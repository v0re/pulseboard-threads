import "server-only";

import { randomUUID } from "node:crypto";
import {
  claimAutoReplyForPublishing,
  claimAutoReplyJob,
  claimStalePublishingJobs,
  getAutoReplySettings,
  getAutoReplyUsageToday,
  ensureAutoReplyPublishQuota,
  isAutoReplyEnabled,
  listPostsForReplyScan,
  markAutoReplyFailed,
  markAutoReplyGenerating,
  markAutoReplyPublishOutcome,
  markAutoReplyPublished,
  markAutoReplyReady,
  markAutoReplySkipped,
  markRepliesScanned,
  recordAutoReplyContainer,
} from "./auto-reply-db";
import { finalizeAutomatedReply, localSafetyReason } from "./auto-reply-safety";
import { isEligibleReply, replyTimestamp } from "./auto-reply-selection";
import { optionalEnv } from "./env";
import { generateReplyDecision, isModerationFlagged, isOpenAIConfigured, OpenAIRequestError } from "./openai";
import {
  AUTO_REPLY_SCOPES,
  createReplyContainer,
  getContainerStatus,
  getPostReplies,
  publishReplyContainer,
  ThreadsApiError,
} from "./threads";
import type { ThreadsReply } from "./types";

export type AutoReplyRunSummary = {
  status: "disabled" | "not_ready" | "completed";
  scannedPosts: number;
  analyzed: number;
  published: number;
  skipped: number;
  failed: number;
  threadsApiCalls: number;
  reason?: string;
};

function boundedEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(optionalEnv(name) ?? String(fallback));
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
}

function errorCode(error: unknown): string {
  if (error instanceof ThreadsApiError) return `THREADS_${error.status}`;
  if (error instanceof OpenAIRequestError) return `OPENAI_${error.status ?? "REQUEST"}`;
  if (error instanceof DOMException) return error.name.toUpperCase();
  return "UNEXPECTED";
}

function isUncertainPublish(error: unknown): boolean {
  return !(error instanceof ThreadsApiError) || error.status >= 500;
}

async function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

async function waitForContainer(accessToken: string, containerId: string, signal?: AbortSignal): Promise<{ state: "ready" | "published" | "failed"; apiCalls: number }> {
  for (let attempt = 0; attempt < 17; attempt += 1) {
    const result = await getContainerStatus(accessToken, containerId, signal);
    if (result.status === "FINISHED") return { state: "ready", apiCalls: attempt + 1 };
    if (result.status === "PUBLISHED") return { state: "published", apiCalls: attempt + 1 };
    if (["ERROR", "EXPIRED"].includes(result.status)) return { state: "failed", apiCalls: attempt + 1 };
    if (attempt < 16) await wait(1_500, signal);
  }
  return { state: "failed", apiCalls: 17 };
}

async function reconcileStalePublishing(args: {
  connectionId: string;
  threadsUserId: string;
  accessToken: string;
  signal?: AbortSignal;
}, summary: AutoReplyRunSummary): Promise<void> {
  const jobs = await claimStalePublishingJobs(args.connectionId);
  for (const job of jobs) {
    if (!job.containerId) {
      await markAutoReplyPublishOutcome(job.id, "failed", "MISSING_CONTAINER");
      summary.failed += 1;
      continue;
    }
    try {
      const container = await getContainerStatus(args.accessToken, job.containerId, args.signal);
      summary.threadsApiCalls += 1;
      if (container.status === "PUBLISHED") {
        await markAutoReplyPublished(job.id, job.containerId);
        summary.published += 1;
        continue;
      }
      if (["ERROR", "EXPIRED"].includes(container.status)) {
        await markAutoReplyPublishOutcome(job.id, "failed", `CONTAINER_${container.status}`);
        summary.failed += 1;
        continue;
      }
      if (container.status !== "FINISHED") {
        await markAutoReplyPublishOutcome(job.id, "uncertain", `CONTAINER_${container.status}`);
        continue;
      }
      if (!await ensureAutoReplyPublishQuota(args.connectionId, job.id)) {
        if (!await isAutoReplyEnabled(args.connectionId)) {
          await markAutoReplyPublishOutcome(job.id, "failed", "DISABLED_BEFORE_PUBLISH");
          summary.failed += 1;
        } else {
          await markAutoReplyPublishOutcome(job.id, "uncertain", "DAILY_LIMIT");
        }
        continue;
      }
      try {
        const publishedId = await publishReplyContainer(args.accessToken, args.threadsUserId, job.containerId, args.signal);
        summary.threadsApiCalls += 1;
        await markAutoReplyPublished(job.id, publishedId);
        summary.published += 1;
      } catch (error) {
        await markAutoReplyPublishOutcome(job.id, isUncertainPublish(error) ? "uncertain" : "failed", errorCode(error));
        summary.failed += 1;
      }
    } catch (error) {
      await markAutoReplyPublishOutcome(job.id, "uncertain", errorCode(error));
      summary.failed += 1;
    }
  }
}

export async function runAutoReplies(args: {
  connectionId: string;
  threadsUserId: string;
  username: string;
  grantedScopes: string[];
  accessToken: string;
  signal?: AbortSignal;
}): Promise<AutoReplyRunSummary> {
  const summary: AutoReplyRunSummary = {
    status: "completed", scannedPosts: 0, analyzed: 0, published: 0, skipped: 0, failed: 0, threadsApiCalls: 0,
  };
  const settings = await getAutoReplySettings(args.connectionId);
  const missingScopes = AUTO_REPLY_SCOPES.filter((scope) => !args.grantedScopes.includes(scope));
  if (missingScopes.length) return { ...summary, status: "not_ready", reason: "oauth_scopes_missing" };
  await reconcileStalePublishing(args, summary);
  if (!settings.enabled || !settings.enabledAt) return { ...summary, status: "disabled", reason: "disabled" };
  if (!isOpenAIConfigured()) return { ...summary, status: "not_ready", reason: "openai_not_configured" };

  let usage = await getAutoReplyUsageToday(args.connectionId);
  if (usage >= settings.dailyLimit) return { ...summary, reason: "daily_limit_reached" };

  const postLimit = boundedEnv("AUTO_REPLY_POST_LIMIT", 20, 1, 100);
  const repliesPerPost = boundedEnv("AUTO_REPLY_REPLIES_PER_POST", 250, 10, 500);
  const analysisLimit = boundedEnv("AUTO_REPLY_ANALYSIS_LIMIT", 10, 1, 25);
  const posts = await listPostsForReplyScan(args.connectionId, postLimit);
  const enabledAt = new Date(settings.enabledAt).getTime();

  for (const post of posts) {
    if (args.signal?.aborted || usage >= settings.dailyLimit || summary.analyzed >= analysisLimit) break;
    let replies: ThreadsReply[];
    try {
      const result = await getPostReplies(args.accessToken, post.id, repliesPerPost, args.signal);
      replies = result.replies;
      summary.threadsApiCalls += result.apiCalls;
      summary.scannedPosts += 1;
      await markRepliesScanned(args.connectionId, post.id);
    } catch {
      summary.failed += 1;
      continue;
    }

    const eligible = replies
      .filter((reply) => isEligibleReply(reply, post.id, args.username, enabledAt))
      .sort((a, b) => (replyTimestamp(a) ?? 0) - (replyTimestamp(b) ?? 0));

    for (const incoming of eligible) {
      if (args.signal?.aborted || usage >= settings.dailyLimit || summary.analyzed >= analysisLimit) break;
      const incomingText = incoming.text?.trim() ?? "";
      const createdAt = incoming.timestamp ? new Date(incoming.timestamp).toISOString() : new Date().toISOString();
      const job = await claimAutoReplyJob({
        id: randomUUID(),
        connectionId: args.connectionId,
        rootPostId: post.id,
        sourceReplyId: incoming.id,
        sourceUsername: incoming.username ?? null,
        sourceCreatedAt: createdAt,
      });
      if (!job) continue;

      let readyReply = job.status === "ready" ? job.generated_reply : null;
      if (!readyReply) {
        const localReason = localSafetyReason(post.text, incomingText);
        if (localReason) {
          await markAutoReplySkipped(job.id, "local_safety", localReason);
          summary.skipped += 1;
          continue;
        }
        if (!await markAutoReplyGenerating(job.id)) continue;
        summary.analyzed += 1;
        try {
          if (await isModerationFlagged([post.text, incomingText], args.signal)) {
            await markAutoReplySkipped(job.id, "moderation", "input_flagged");
            summary.skipped += 1;
            continue;
          }
          const generated = await generateReplyDecision({
            connectionId: args.connectionId,
            rootPostText: post.text,
            incomingReplyText: incomingText,
            signal: args.signal,
          });
          if (generated.decision.action === "skip") {
            await markAutoReplySkipped(job.id, generated.decision.category, generated.decision.reason);
            summary.skipped += 1;
            continue;
          }
          readyReply = finalizeAutomatedReply(generated.decision.reply);
          if (!readyReply) {
            await markAutoReplySkipped(job.id, "output_safety", "invalid_length");
            summary.skipped += 1;
            continue;
          }
          if (await isModerationFlagged([readyReply], args.signal)) {
            await markAutoReplySkipped(job.id, "moderation", "output_flagged");
            summary.skipped += 1;
            continue;
          }
          await markAutoReplyReady(job.id, {
            reply: readyReply,
            category: generated.decision.category,
            responseId: generated.responseId,
            model: generated.model,
          });
        } catch (error) {
          await markAutoReplyFailed(job.id, errorCode(error));
          summary.failed += 1;
          continue;
        }
      }

      const textToPublish = await claimAutoReplyForPublishing(args.connectionId, job.id);
      if (!textToPublish) {
        if (!await isAutoReplyEnabled(args.connectionId)) {
          await markAutoReplySkipped(job.id, "settings", "disabled");
          summary.skipped += 1;
        }
        continue;
      }

      let containerId: string;
      try {
        containerId = await createReplyContainer(args.accessToken, incoming.id, textToPublish, args.signal);
        summary.threadsApiCalls += 1;
        await recordAutoReplyContainer(job.id, containerId);
        const containerState = await waitForContainer(args.accessToken, containerId, args.signal);
        summary.threadsApiCalls += containerState.apiCalls;
        if (containerState.state === "failed") {
          await markAutoReplyPublishOutcome(job.id, "failed", "CONTAINER_NOT_READY");
          summary.failed += 1;
          continue;
        }
        if (containerState.state === "published") {
          await markAutoReplyPublished(job.id, containerId);
          summary.published += 1;
          usage += 1;
          continue;
        }
        if (!await ensureAutoReplyPublishQuota(args.connectionId, job.id)) {
          if (!await isAutoReplyEnabled(args.connectionId)) {
            await markAutoReplyPublishOutcome(job.id, "failed", "DISABLED_BEFORE_PUBLISH");
            summary.failed += 1;
          } else {
            await markAutoReplyPublishOutcome(job.id, "uncertain", "DAILY_LIMIT");
          }
          continue;
        }
      } catch (error) {
        await markAutoReplyPublishOutcome(job.id, "failed", errorCode(error));
        summary.failed += 1;
        continue;
      }

      try {
        const publishedId = await publishReplyContainer(args.accessToken, args.threadsUserId, containerId, args.signal);
        summary.threadsApiCalls += 1;
        await markAutoReplyPublished(job.id, publishedId);
        summary.published += 1;
        usage += 1;
      } catch (error) {
        await markAutoReplyPublishOutcome(job.id, isUncertainPublish(error) ? "uncertain" : "failed", errorCode(error));
        summary.failed += 1;
        usage += 1;
      }
    }
  }
  return summary;
}
