import type { ThreadsReply } from "./types";

export function replyTimestamp(reply: ThreadsReply): number | null {
  if (!reply.timestamp) return null;
  const value = new Date(reply.timestamp).getTime();
  return Number.isFinite(value) ? value : null;
}

export function isEligibleReply(reply: ThreadsReply, postId: string, username: string, enabledAt: number): boolean {
  const timestamp = replyTimestamp(reply);
  return Boolean(
    reply.id && reply.text?.trim() && reply.media_type === "TEXT_POST" && reply.is_reply === true &&
    reply.is_reply_owned_by_me === false && reply.root_post?.id === postId && reply.replied_to?.id === postId &&
    reply.username && reply.username.toLocaleLowerCase() !== username.toLocaleLowerCase() &&
    reply.hide_status?.toUpperCase() !== "HIDDEN" && timestamp !== null && timestamp >= enabledAt
  );
}
