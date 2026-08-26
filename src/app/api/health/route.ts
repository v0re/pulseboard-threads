import { invalidConfiguration, isAppConfigured, isProductionReady, missingConfiguration, missingProductionConfiguration } from "@/lib/env";
import { getAutoReplyModel, isOpenAIConfigured } from "@/lib/openai";

export function GET() {
  const missing = missingConfiguration();
  const productionMissing = missingProductionConfiguration();
  const invalid = invalidConfiguration();
  const productionReady = isProductionReady();
  return Response.json(
    {
      ok: productionReady,
      configured: isAppConfigured(),
      productionReady,
      missing,
      productionMissing,
      invalid,
      features: { autoReply: { openAIConfigured: isOpenAIConfigured(), model: getAutoReplyModel() } },
    },
    { status: productionReady ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
