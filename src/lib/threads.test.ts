import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizationUrl, exchangeCodeForToken, exchangeForLongLivedToken, THREADS_SCOPES } from "./threads";

describe("Threads OAuth", () => {
  afterEach(() => { delete process.env.THREADS_APP_ID; delete process.env.THREADS_APP_SECRET; vi.unstubAllGlobals(); });

  it("uses the official host, read-only scopes and CSRF state", () => {
    process.env.THREADS_APP_ID = "123";
    const url = new URL(buildAuthorizationUrl("https://example.com/api/auth/threads/callback", "csrf-value"));
    expect(url.origin).toBe("https://threads.com");
    expect(url.searchParams.get("state")).toBe("csrf-value");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...THREADS_SCOPES]);
    expect(url.searchParams.get("scope")).not.toContain("publish");
  });

  it("uses Meta's unversioned token exchange endpoints", async () => {
    process.env.THREADS_APP_ID = "123";
    process.env.THREADS_APP_SECRET = "secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short", user_id: "42" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "long", expires_in: 5_184_000 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await exchangeCodeForToken("code", "https://example.com/callback");
    await exchangeForLongLivedToken("short");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://graph.threads.com/oauth/access_token");
    expect(String(fetchMock.mock.calls[1][0])).toContain("https://graph.threads.com/access_token?");
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("/v1.0/");
  });
});
