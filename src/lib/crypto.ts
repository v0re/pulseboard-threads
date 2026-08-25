import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function keyFromSecret(secret: string): Buffer {
  if (/^[a-f\d]{64}$/i.test(secret)) return Buffer.from(secret, "hex");
  try {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to a deterministic key for human-readable development secrets.
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivText, tagText, encryptedText, ...extra] = payload.split(".");
  if (!ivText || !tagText || !encryptedText || extra.length) throw new Error("加密資料格式無效");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function signValue(value: string, secret: string): string {
  const encoded = Buffer.from(value, "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySignedValue(payload: string, secret: string): string | null {
  const [encoded, signature, ...extra] = payload.split(".");
  if (!encoded || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try { return Buffer.from(encoded, "base64url").toString("utf8"); } catch { return null; }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
