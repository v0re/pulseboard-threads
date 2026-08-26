export const AUTO_REPLY_MAX_GRAPHEMES = 100;
export const AUTO_REPLY_DISCLOSURE = "（AI 自動回覆）";

export type ReplyDecision = {
  action: "reply" | "skip";
  category: string;
  reason: string;
  reply: string;
};

const promptInjectionPatterns = [
  /ignore (all|any|the|previous|prior).{0,30}(instruction|prompt)/iu,
  /system\s*(prompt|message)/iu,
  /developer\s*(prompt|message)/iu,
  /reveal.{0,30}(prompt|instruction|secret|api.?key)/iu,
  /忽略.{0,20}(指令|提示|規則)/u,
  /(系統|開發者).{0,8}(提示|訊息|指令)/u,
  /顯示.{0,20}(金鑰|密碼|提示詞|系統指令)/u,
];

const highRiskPatterns: Array<[string, RegExp]> = [
  ["personal_data", /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d\s().-]{7,}\d)|身分證|信用卡|卡號|密碼|驗證碼|住址)/iu],
  ["crisis", /(?:自殺|輕生|不想活|傷害自己|割腕|suicid|self.?harm)/iu],
  ["medical", /(?:診斷|處方|用藥|劑量|急診|癌症|懷孕|精神疾病|medical advice)/iu],
  ["legal", /(?:法律意見|提告|訴訟|合約條款|律師|legal advice)/iu],
  ["financial", /(?:買進|賣出|投資建議|保證獲利|報明牌|加密貨幣投資|financial advice)/iu],
  ["political_persuasion", /(?:投給|不要投|政治宣傳|拉票|政黨動員|選舉動員)/iu],
  ["payment_or_credentials", /(?:匯款|轉帳|付款連結|助記詞|私鑰|登入憑證|api.?key)/iu],
];

export function countGraphemes(value: string): number {
  const Segmenter = Intl.Segmenter;
  if (Segmenter) return [...new Segmenter("zh-Hant", { granularity: "grapheme" }).segment(value)].length;
  return Array.from(value).length;
}

export function localSafetyReason(rootText: string, replyText: string): string | null {
  const combined = `${rootText}\n${replyText}`.slice(0, 8_000);
  if (!replyText.trim()) return "empty_text";
  if (promptInjectionPatterns.some((pattern) => pattern.test(combined))) return "prompt_injection";
  for (const [reason, pattern] of highRiskPatterns) if (pattern.test(combined)) return reason;
  return null;
}

export function normalizeDecision(value: unknown): ReplyDecision | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.action !== "reply" && record.action !== "skip") return null;
  if (typeof record.category !== "string" || typeof record.reason !== "string" || typeof record.reply !== "string") return null;
  const reply = record.reply.trim().replace(/\s*\n+\s*/g, " ");
  if (record.action === "reply" && (!reply || countGraphemes(reply) > AUTO_REPLY_MAX_GRAPHEMES)) return null;
  return {
    action: record.action,
    category: record.category.slice(0, 80),
    reason: record.reason.slice(0, 240),
    reply: record.action === "reply" ? reply : "",
  };
}

export function outputSafetyReason(value: string): string | null {
  if (/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u.test(value)) return "control_characters";
  if (/(?:https?:\/\/|www\.|(?:[a-z\d-]+\.)+[a-z]{2,}\b)/iu.test(value)) return "url";
  if (/[#@][^\s#@]+/u.test(value)) return "tag_or_mention";
  const localReason = localSafetyReason("", value);
  if (localReason) return localReason;
  if (/(?:私訊|加我|聯絡我|點擊|立即購買|限時|保證|一定獲利|我們會處理|我會處理|已經處理)/u.test(value)) return "promotion_or_commitment";
  return null;
}

export function finalizeAutomatedReply(value: string): string | null {
  const content = value.trim().replace(/\s*\n+\s*/g, " ");
  if (!content || outputSafetyReason(content)) return null;
  const finalText = content.endsWith(AUTO_REPLY_DISCLOSURE) ? content : `${content}${AUTO_REPLY_DISCLOSURE}`;
  return countGraphemes(finalText) <= AUTO_REPLY_MAX_GRAPHEMES ? finalText : null;
}
