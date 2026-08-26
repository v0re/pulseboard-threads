/* global chrome */

import {
  analyzePostText,
  buildWritingTips,
  countGraphemes,
  createReplyDraft,
  truncateGraphemes,
} from "./analyzer.mjs";

const PULSEBOARD_URL = "https://pulseboard-threads.vercel.app/";
const SETUP_URL = `${PULSEBOARD_URL}setup`;

const elements = {
  openDashboard: document.querySelector("#openDashboard"),
  openSetup: document.querySelector("#openSetup"),
  inspectPost: document.querySelector("#inspectPost"),
  tabStatus: document.querySelector("#tabStatus"),
  analysisMessage: document.querySelector("#analysisMessage"),
  analysisResult: document.querySelector("#analysisResult"),
  characterCount: document.querySelector("#characterCount"),
  questionCount: document.querySelector("#questionCount"),
  hashtagCount: document.querySelector("#hashtagCount"),
  linkCount: document.querySelector("#linkCount"),
  postPreview: document.querySelector("#postPreview"),
  writingTips: document.querySelector("#writingTips"),
  replyDraft: document.querySelector("#replyDraft"),
  draftCount: document.querySelector("#draftCount"),
  copyDraft: document.querySelector("#copyDraft"),
};

function isThreadsPostUrl(value) {
  try {
    const url = new URL(value);
    const allowedHost = url.protocol === "https:" && ["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname);
    return allowedHost && /^\/@[^/]+\/post\/[^/]+/u.test(url.pathname);
  } catch {
    return false;
  }
}

function extractVisibleThreadsPost() {
  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < innerHeight
      && rect.left < innerWidth
      && style.visibility !== "hidden"
      && style.display !== "none";
  }

  function normalize(value) {
    return String(value ?? "")
      .replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
      .replace(/\r\n?/gu, "\n")
      .split("\n")
      .map((line) => line.replace(/[\t ]+/gu, " ").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 5_000);
  }

  function postIdentity(pathname) {
    return pathname.match(/^\/@[^/]+\/post\/[^/]+/u)?.[0] ?? null;
  }

  const currentPost = postIdentity(location.pathname);
  if (!currentPost) return { error: "請先開啟單篇 Threads 貼文頁面。" };

  const selectedText = normalize(getSelection()?.toString());
  if (selectedText) {
    return {
      text: selectedText,
      hasMedia: false,
      title: document.title,
      url: location.href,
    };
  }

  const articleCandidates = [...document.querySelectorAll("article, [role='article']")]
    .filter(isVisible)
    .map((node) => ({
      node,
      text: normalize(node.innerText),
      exactPostLink: [...node.querySelectorAll("a[href*='/post/']")].some((anchor) => {
        try {
          return postIdentity(new URL(anchor.href, location.href).pathname) === currentPost;
        } catch {
          return false;
        }
      }),
      hasOtherPostLink: [...node.querySelectorAll("a[href*='/post/']")].some((anchor) => {
        try {
          const linkedPost = postIdentity(new URL(anchor.href, location.href).pathname);
          return linkedPost !== null && linkedPost !== currentPost;
        } catch {
          return false;
        }
      }),
    }))
    .filter((candidate) => candidate.text.length >= 2 && candidate.exactPostLink && !candidate.hasOtherPostLink);

  const uniqueCandidates = new Map(articleCandidates.map((candidate) => [candidate.text, candidate.node]));
  const selected = uniqueCandidates.size === 1 ? [...uniqueCandidates.values()][0] : null;

  const text = normalize(selected?.innerText);
  if (!text) return { error: "無法可靠定位貼文。請反白選取貼文文字，再按一次分析。" };

  const hasLargeImage = [...selected.querySelectorAll("img")].some((image) => {
    const rect = image.getBoundingClientRect();
    return rect.width >= 160 && rect.height >= 120 && isVisible(image);
  });

  return {
    text,
    hasMedia: [...selected.querySelectorAll("video")].some(isVisible) || hasLargeImage,
    title: document.title,
    url: location.href,
  };
}

function updateDraftCounter() {
  const count = countGraphemes(elements.replyDraft.value);
  if (count > 100) elements.replyDraft.value = truncateGraphemes(elements.replyDraft.value, 100);
  elements.draftCount.textContent = String(countGraphemes(elements.replyDraft.value));
}

function renderAnalysis(analysis) {
  elements.characterCount.textContent = String(analysis.graphemes);
  elements.questionCount.textContent = String(analysis.questions);
  elements.hashtagCount.textContent = String(analysis.hashtags.length);
  elements.linkCount.textContent = String(analysis.links.length);
  elements.postPreview.textContent = analysis.text;
  elements.writingTips.replaceChildren(...buildWritingTips(analysis).map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
  elements.replyDraft.value = createReplyDraft(analysis);
  elements.analysisResult.hidden = false;
  elements.analysisMessage.textContent = "分析只存在這個彈出視窗；關閉後即清除。";
  updateDraftCounter();
}

async function inspectCurrentPost() {
  elements.inspectPost.disabled = true;
  elements.tabStatus.textContent = "讀取中…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isThreadsPostUrl(tab.url)) throw new Error("請先開啟單篇 Threads 貼文頁面。");
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisibleThreadsPost });
    const extracted = results[0]?.result;
    if (!extracted || extracted.error) throw new Error(extracted?.error ?? "無法讀取目前分頁。");
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab?.id !== tab.id || currentTab.url !== extracted.url) throw new Error("分頁內容已變更，請重新按一次分析。");
    renderAnalysis(analyzePostText(extracted.text, { hasMedia: extracted.hasMedia }));
    elements.tabStatus.textContent = "已完成本機分析";
  } catch (error) {
    elements.analysisResult.hidden = true;
    elements.analysisMessage.textContent = error instanceof Error ? error.message : "讀取失敗，請重新整理頁面後再試。";
    elements.tabStatus.textContent = "未讀取";
  } finally {
    elements.inspectPost.disabled = false;
  }
}

elements.openDashboard.addEventListener("click", () => chrome.tabs.create({ url: PULSEBOARD_URL }));
elements.openSetup.addEventListener("click", () => chrome.tabs.create({ url: SETUP_URL }));
elements.inspectPost.addEventListener("click", inspectCurrentPost);
elements.replyDraft.addEventListener("input", updateDraftCounter);
elements.copyDraft.addEventListener("click", async () => {
  if (!elements.replyDraft.value) return;
  try {
    await navigator.clipboard.writeText(elements.replyDraft.value);
    elements.copyDraft.textContent = "已複製";
  } catch {
    elements.copyDraft.textContent = "複製失敗";
  }
  setTimeout(() => { elements.copyDraft.textContent = "複製草稿"; }, 1_200);
});
