const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/gu;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const URL_PATTERN = /https?:\/\/[^\s<>()]+/giu;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]{1,50}/gu;
const MENTION_PATTERN = /@[\p{L}\p{N}._]{1,50}/gu;

function segmentText(value) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }).segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

export function countGraphemes(value) {
  return segmentText(String(value ?? "")).length;
}

export function truncateGraphemes(value, limit) {
  if (!Number.isInteger(limit) || limit < 0) throw new TypeError("limit must be a non-negative integer");
  return segmentText(String(value ?? "")).slice(0, limit).join("");
}

export function normalizePostText(value, limit = 5_000) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(BIDI_CONTROLS, "")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");

  return truncateGraphemes(normalized, limit);
}

function uniqueMatches(value, pattern) {
  return [...new Set(value.match(pattern) ?? [])];
}

export function analyzePostText(value, options = {}) {
  const text = normalizePostText(value);
  const hashtags = uniqueMatches(text, HASHTAG_PATTERN);
  const mentions = uniqueMatches(text, MENTION_PATTERN);
  const links = uniqueMatches(text, URL_PATTERN);
  const questionGroups = text.match(/[?？]+/gu) ?? [];
  const exclamationGroups = text.match(/[!！]+/gu) ?? [];

  return {
    text,
    graphemes: countGraphemes(text),
    paragraphs: text ? text.split("\n").length : 0,
    hashtags,
    mentions,
    links,
    questions: questionGroups.length,
    exclamations: exclamationGroups.length,
    hasMedia: options.hasMedia === true,
  };
}

export function buildWritingTips(analysis) {
  const tips = [];
  if (analysis.questions > 0) tips.push("先回應貼文中的問題，再補充一個具體觀點。");
  if (analysis.graphemes > 280) tips.push("原文較長，回覆時聚焦其中一個重點即可。");
  if (analysis.links.length > 0) tips.push("引用連結內容前，先核對來源與上下文。");
  if (analysis.mentions.length > 0) tips.push("草稿不會自動加入新的標註，避免打擾其他帳號。");
  if (analysis.hashtags.length > 2) tips.push("主題標籤較多，可挑一個最相關的方向回覆。");
  if (analysis.hasMedia) tips.push("若回應圖片或影片，請確認草稿符合實際畫面。");
  if (tips.length === 0) tips.push("用一個具體觀察取代泛泛稱讚，回覆會更自然。");
  return tips.slice(0, 3);
}

function fitDraft(body) {
  const label = "（本機草稿）";
  const budget = 100 - countGraphemes(label);
  return `${truncateGraphemes(body.trim(), budget)}${label}`;
}

export function createReplyDraft(analysis) {
  if (!analysis?.text) return "";
  if (analysis.questions > 0) {
    return fitDraft("這個問題很值得討論。或許可以先釐清前提，再比較不同做法，謝謝分享。");
  }
  if (analysis.links.length > 0) {
    return fitDraft("謝謝分享這份內容。我會先核對來源與上下文，再整理最值得延伸的重點。");
  }
  if (analysis.hasMedia) {
    return fitDraft("這個呈現方式很直觀，也讓重點更容易理解。謝謝整理與分享。");
  }
  return fitDraft("謝謝分享，這個觀點很有意思，也提供了不同的思考方向。");
}
