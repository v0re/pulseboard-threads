import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, signValue, verifySignedValue } from "./crypto";

describe("secret protection", () => {
  const secret = "test-only-secret-that-is-long-enough";

  it("round-trips encrypted tokens", () => {
    const encrypted = encryptSecret("TH-private-token", secret);
    expect(encrypted).not.toContain("TH-private-token");
    expect(decryptSecret(encrypted, secret)).toBe("TH-private-token");
  });

  it("rejects tampered sessions", () => {
    const signed = signValue("connection-id", secret);
    expect(verifySignedValue(signed, secret)).toBe("connection-id");
    expect(verifySignedValue(`${signed}x`, secret)).toBeNull();
  });
});
