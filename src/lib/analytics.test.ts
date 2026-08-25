import { describe, expect, it } from "vitest";
import { engagementRate, formatMetric, interactionTotal, percentChange, sumKnown } from "./analytics";

describe("analytics", () => {
  it("preserves unknown metrics instead of turning them into zero", () => {
    expect(sumKnown([null, null])).toBeNull();
    expect(formatMetric(null)).toBe("無資料");
    expect(engagementRate({ views: null, likes: 3, replies: 2, reposts: 1, quotes: 0, shares: null })).toBeNull();
  });

  it("calculates interactions without double-counting shares", () => {
    const metrics = { views: 100, likes: 5, replies: 2, reposts: 1, quotes: 2, shares: 9 };
    expect(interactionTotal(metrics)).toBe(10);
    expect(engagementRate(metrics)).toBe(10);
  });

  it("handles change baselines safely", () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
  });
});
