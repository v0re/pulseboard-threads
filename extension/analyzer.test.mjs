import { describe, expect, it } from "vitest";
import {
  analyzePostText,
  buildWritingTips,
  countGraphemes,
  createReplyDraft,
  normalizePostText,
  truncateGraphemes,
} from "./analyzer.mjs";

describe("Chrome extension local analyzer", () => {
  it("counts a composed emoji as one grapheme", () => {
    expect(countGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect(countGraphemes("🇹🇼")).toBe(1);
    expect(countGraphemes("👍🏽")).toBe(1);
    expect(countGraphemes("e\u0301")).toBe(1);
    expect(truncateGraphemes("A👨‍👩‍👧‍👦B", 2)).toBe("A👨‍👩‍👧‍👦");
  });

  it("enforces the 100/101 grapheme boundary", () => {
    expect(countGraphemes(truncateGraphemes("字".repeat(100), 100))).toBe(100);
    expect(countGraphemes(truncateGraphemes("字".repeat(101), 100))).toBe(100);
  });

  it("removes invisible directional controls and normalizes lines", () => {
    expect(normalizePostText(" 第一行\u202e\n\n 第二行\u0000 ")).toBe("第一行\n第二行");
  });

  it("summarizes questions, tags, mentions and links without network calls", () => {
    const result = analyzePostText("你怎麼看？ #Threads @someone https://example.com", { hasMedia: true });
    expect(result.questions).toBe(1);
    expect(result.hashtags).toEqual(["#Threads"]);
    expect(result.mentions).toEqual(["@someone"]);
    expect(result.links).toEqual(["https://example.com"]);
    expect(result.hasMedia).toBe(true);
    expect(buildWritingTips(result).length).toBeGreaterThan(0);
  });

  it("creates an honest local draft within the complete 100-grapheme limit", () => {
    const draft = createReplyDraft(analyzePostText("這個功能應該怎麼設計？"));
    expect(draft).toContain("（本機草稿）");
    expect(countGraphemes(draft)).toBeLessThanOrEqual(100);
  });
});
