import "server-only";

import { getAutoReplyLogs, getAutoReplySettings, type AutoReplyLog, type AutoReplySettings } from "./auto-reply-db";
import { getConnection, hasDatabase } from "./db";
import { isAppConfigured } from "./env";
import { isOpenAIConfigured } from "./openai";
import { getSessionConnectionId } from "./session";
import { AUTO_REPLY_SCOPES } from "./threads";

export type AutoReplyPageData = {
  settings: AutoReplySettings;
  logs: AutoReplyLog[];
  openAIConfigured: boolean;
  scopesReady: boolean;
  missingScopes: string[];
  databaseReady: boolean;
};

function unavailableData(): AutoReplyPageData {
  return {
    settings: { enabled: false, enabledAt: null, dailyLimit: 5 },
    logs: [],
    openAIConfigured: isOpenAIConfigured(),
    scopesReady: false,
    missingScopes: [...AUTO_REPLY_SCOPES],
    databaseReady: false,
  };
}

export async function getAutoReplyPageData(): Promise<AutoReplyPageData> {
  if (!isAppConfigured() || !hasDatabase()) return unavailableData();
  const connectionId = await getSessionConnectionId();
  if (!connectionId) return { ...unavailableData(), databaseReady: true };
  const connection = await getConnection(connectionId);
  if (!connection) return { ...unavailableData(), databaseReady: true };
  const missingScopes = AUTO_REPLY_SCOPES.filter((scope) => !connection.granted_scopes.includes(scope));
  try {
    const [settings, logs] = await Promise.all([getAutoReplySettings(connectionId), getAutoReplyLogs(connectionId)]);
    return {
      settings,
      logs,
      openAIConfigured: isOpenAIConfigured(),
      scopesReady: missingScopes.length === 0,
      missingScopes: [...missingScopes],
      databaseReady: true,
    };
  } catch {
    return { ...unavailableData(), scopesReady: missingScopes.length === 0, missingScopes: [...missingScopes] };
  }
}
