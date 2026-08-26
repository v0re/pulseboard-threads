import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl, createReplyContainer, exchangeCodeForToken, exchangeForLongLivedToken,
  getGrantedScopes, getPostReplies, publishReplyContainer, THREADS_SCOPES,
} from "./threads";

describe("Threads OAuth", () => {
  afterEach(() => { delete process.env.THREADS_APP_ID; delete process.env.THREADS_APP_SECRET; vi.unstubAllGlobals(); });

  it("uses the official host, required scopes and CSRF state", () => {
    process.env.THREADS_APP_ID = "123";
    const url = new URL(buildAuthorizationUrl("https://example.com/api/auth/threads/callback", "csrf-value"));
    expect(url.origin).toBe("https://threads.com");
    expect(url.searchParams.get("state")).toBe("csrf-value");
    expect(url.searchParams.get("scope")?.split(",")).toEqual([...THREADS_SCOPES]);
    expect(url.searchParams.get("scope")).toContain("threads_read_replies");
    expect(url.searchParams.get("scope")).toContain("threads_manage_replies");
    expect(url.searchParams.get("scope")).toContain("threads_content_publish");
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

  it("reads top-level replies and publishes through the official two-step endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "r1", text: "hello" }], paging: { cursors: {} } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "container-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "published-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const replies = await getPostReplies("token", "post-1", 10);
    expect(replies.replies[0]?.id).toBe("r1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1.0/post-1/replies?");

    await createReplyContainer("token", "r1", "回覆");
    const createInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://graph.threads.com/v1.0/me/threads");
    expect(String(createInit.body)).toContain("reply_to_id=r1");
    expect(String(createInit.body)).not.toContain("auto_publish_text");

    await publishReplyContainer("token", "user-1", "container-1");
    expect(String(fetchMock.mock.calls[2][0])).toBe("https://graph.threads.com/v1.0/user-1/threads_publish");
    expect(String((fetchMock.mock.calls[2][1] as RequestInit).body)).toBe("creation_id=container-1");
  });

  it("stores scopes verified by Meta instead of assuming requested scopes were granted", async () => {
    process.env.THREADS_APP_ID = "123";
    process.env.THREADS_APP_SECRET = "secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "app-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { is_valid: true, scopes: ["threads_basic", "threads_read_replies"] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getGrantedScopes("user-token")).toEqual(["threads_basic", "threads_read_replies"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v1.0/debug_token?input_token=user-token");
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer app-token" });
  });
});
