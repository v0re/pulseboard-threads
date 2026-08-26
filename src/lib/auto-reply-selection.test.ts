import { describe, expect, it } from "vitest";
import { isEligibleReply } from "./auto-reply-selection";
import type { ThreadsReply } from "./types";

function reply(overrides: Partial<ThreadsReply> = {}): ThreadsReply {
  return {
    id: "reply-1",
    text: "謝謝分享",
    username: "visitor",
    timestamp: "2026-08-26T00:01:00.000Z",
    media_type: "TEXT_POST",
    is_reply: true,
    is_reply_owned_by_me: false,
    root_post: { id: "post-1" },
    replied_to: { id: "post-1" },
    ...overrides,
  };
}

describe("auto reply selection", () => {
  const enabledAt = new Date("2026-08-26T00:00:00.000Z").getTime();

  it("only accepts a new direct text reply from another user", () => {
    expect(isEligibleReply(reply(), "post-1", "owner", enabledAt)).toBe(true);
    expect(isEligibleReply(reply({ is_reply_owned_by_me: true }), "post-1", "owner", enabledAt)).toBe(false);
    expect(isEligibleReply(reply({ username: "OWNER" }), "post-1", "owner", enabledAt)).toBe(false);
    expect(isEligibleReply(reply({ replied_to: { id: "nested-reply" } }), "post-1", "owner", enabledAt)).toBe(false);
    expect(isEligibleReply(reply({ media_type: "IMAGE" }), "post-1", "owner", enabledAt)).toBe(false);
    expect(isEligibleReply(reply({ timestamp: "2026-08-25T23:59:59.000Z" }), "post-1", "owner", enabledAt)).toBe(false);
  });
});
