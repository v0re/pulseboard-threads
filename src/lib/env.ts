const requiredNames = [
  "DATABASE_URL",
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "APP_ENCRYPTION_KEY",
  "SESSION_SECRET",
] as const;

const productionRequiredNames = [
  ...requiredNames,
  "APP_URL",
  "CRON_SECRET",
] as const;

export type RequiredEnvName = (typeof requiredNames)[number];
export type ProductionRequiredEnvName = (typeof productionRequiredNames)[number];

const secretNames = ["APP_ENCRYPTION_KEY", "SESSION_SECRET"] as const;

function secretBytes(value: string): number {
  if (/^[a-f\d]{64}$/i.test(value)) return 32;
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) return Buffer.from(value, "base64url").length;
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) return Buffer.from(value, "base64").length;
  return 0;
}

export function invalidConfiguration(): string[] {
  const invalid: string[] = secretNames.filter((name) => {
    const value = process.env[name]?.trim();
    return Boolean(value) && secretBytes(value as string) !== 32;
  });
  const encryptionKey = process.env.APP_ENCRYPTION_KEY?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (encryptionKey && sessionSecret && encryptionKey === sessionSecret) invalid.push("APP_ENCRYPTION_KEY 與 SESSION_SECRET 必須不同");
  return invalid;
}

export function getEnv(name: RequiredEnvName): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要的環境變數：${name}`);
  if ((secretNames as readonly string[]).includes(name) && secretBytes(value) !== 32) {
    throw new Error(`${name} 必須是獨立產生的 32-byte 隨機值（Base64、Base64URL 或 64 位十六進位）`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function missingConfiguration(): RequiredEnvName[] {
  return requiredNames.filter((name) => !process.env[name]?.trim());
}

export function missingProductionConfiguration(): ProductionRequiredEnvName[] {
  return productionRequiredNames.filter((name) => !process.env[name]?.trim());
}

export function isAppConfigured(): boolean {
  return missingConfiguration().length === 0 && invalidConfiguration().length === 0;
}

export function isProductionReady(): boolean {
  return missingProductionConfiguration().length === 0 && invalidConfiguration().length === 0;
}

export function getAppUrl(requestUrl?: string): string {
  const configured = optionalEnv("APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export function getThreadsRedirectUri(requestUrl?: string): string {
  return optionalEnv("THREADS_REDIRECT_URI") ?? `${getAppUrl(requestUrl)}/api/auth/threads/callback`;
}

export function getAllowedThreadsUserIds(): Set<string> {
  return new Set((optionalEnv("THREADS_ALLOWED_USER_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

export function getSyncPostLimit(): number {
  const parsed = Number(optionalEnv("SYNC_POST_LIMIT") ?? "100");
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 10), 250) : 100;
}
