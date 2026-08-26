import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export const PRIMARY_RESEARCH_MODEL = "gpt-5.6-luna" as const;

export const RESEARCH_EXECUTION_LIMITS = Object.freeze({
  requestTimeoutMs: 240_000,
  maxProviderCalls: 8,
  maxRetriesPerOperation: 1,
});

type ProviderSecretName = "OPENAI_API_KEY" | "GEMINI_API_KEY";

function requireServerSecret(name: ProviderSecretName): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Configuration fournisseur absente: ${name}`);
  }
  return value;
}

export function createPrimaryResearchModel() {
  const provider = createOpenAI({
    apiKey: requireServerSecret("OPENAI_API_KEY"),
  });
  return provider.responses(PRIMARY_RESEARCH_MODEL);
}

export function createGeminiComparisonProvider() {
  return createGoogleGenerativeAI({
    apiKey: requireServerSecret("GEMINI_API_KEY"),
  });
}
