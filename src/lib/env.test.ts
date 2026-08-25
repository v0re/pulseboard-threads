import { afterEach, describe, expect, it } from "vitest";
import { invalidConfiguration, isAppConfigured, isProductionReady, missingProductionConfiguration } from "./env";

const names = [
  "DATABASE_URL",
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "APP_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "APP_URL",
  "CRON_SECRET",
] as const;

afterEach(() => {
  for (const name of names) delete process.env[name];
});

function setValidEnvironment() {
  process.env.DATABASE_URL = "postgresql://example.invalid/db";
  process.env.THREADS_APP_ID = "123";
  process.env.THREADS_APP_SECRET = "meta-secret";
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64url");
  process.env.SESSION_SECRET = Buffer.alloc(32, 2).toString("base64url");
  process.env.APP_URL = "https://example.com";
  process.env.CRON_SECRET = "cron-secret";
}

describe("deployment configuration", () => {
  it("distinguishes core configuration from production readiness", () => {
    setValidEnvironment();
    delete process.env.APP_URL;
    expect(isAppConfigured()).toBe(true);
    expect(isProductionReady()).toBe(false);
    expect(missingProductionConfiguration()).toContain("APP_URL");
  });

  it("rejects short or reused encryption and session keys", () => {
    setValidEnvironment();
    process.env.APP_ENCRYPTION_KEY = "short";
    expect(invalidConfiguration()).toContain("APP_ENCRYPTION_KEY");
    process.env.APP_ENCRYPTION_KEY = process.env.SESSION_SECRET;
    expect(invalidConfiguration()).toContain("APP_ENCRYPTION_KEY 與 SESSION_SECRET 必須不同");
  });
});
