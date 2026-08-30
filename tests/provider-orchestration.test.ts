import { describe, expect, it } from "vitest";

import {
  beginSecondProviderCall,
  combineSupplementMetadata,
  mergeProviderDocuments,
} from "../src/server/ai/providers";
import {
  MAX_PROVIDER_HTTP_CALLS,
  MAX_PROVIDER_WEB_SEARCH_TOOL_CALLS,
  MAX_WEB_SEARCH_ACTIONS,
} from "../src/server/research/types";

type ProviderDocument = Parameters<typeof mergeProviderDocuments>[0];
type NormalizedMetadata = Parameters<
  typeof combineSupplementMetadata
>[0]["primary"];

const primaryUrl = "https://genial.example/equipe/erwan-simon";
const supplementUrl = "https://bordeaux.example/interview/erwan-simon";

function candidate(url = primaryUrl): ProviderDocument["candidates"][number] {
  return {
    candidateKey: "erwan-simon",
    displayName: "Erwan Simon",
    entityType: "person",
    entityScope: "person",
    discriminators: {
      city: "Bordeaux",
      country: "France",
      industry: null,
      employer: "GENIAL",
      officialSite: null,
      legalIdentifier: null,
      year: null,
    },
    sourceUrl: url,
    excerpt: "Erwan Simon travaille chez GENIAL à Bordeaux.",
    prefix: null,
    suffix: null,
  };
}

function claim(
  url: string,
  excerpt: string,
): ProviderDocument["claims"][number] {
  return {
    subjectKey: "erwan-simon",
    category: "role",
    entityType: "person",
    predicate: "role",
    scopeType: "person",
    scopeLabel: "Erwan Simon",
    factPeriodLabel: null,
    factDate: null,
    normalizedValue: null,
    unit: null,
    currency: null,
    contradictionKey: null,
    sourceUrl: url,
    excerpt,
    prefix: null,
    suffix: null,
  };
}

function document(
  url: string,
  excerpt: string,
): ProviderDocument {
  return {
    identityStatus: "resolved",
    entityType: "person",
    candidates: [candidate()],
    claims: [claim(url, excerpt)],
    missingCategories: ["activity"],
  };
}

function metadata(options: {
  readonly id: string;
  readonly url: string;
  readonly supported?: boolean;
}): NormalizedMetadata {
  const supported = options.supported ?? true;
  return {
    status: supported ? "supported" : "unknown",
    citations: [],
    sources: [{ sourceId: options.id, url: options.url, title: options.id }],
    webSearchCalls: [{
      toolCallId: options.id,
      sources: [{ url: options.url }],
    }],
    webSearchActions: [{
      toolCallId: options.id,
      actionType: "search",
      queries: [`"Erwan Simon" ${options.id}`],
    }],
    webSearchInspections: [],
    webSearchActionCount: 1,
    webSearchQueryCount: 1,
    webSearchInspectionCount: 0,
    webSearchUniqueCallCount: 1,
    webSearchActionPolicyStatus: supported ? "supported" : "rejected",
    webSearchActionPolicyCode: supported ? null : "web_search_action_invalid",
  };
}

describe("bounded provider orchestration", () => {
  it("merges a successful recall supplement and centralizes its accounting", () => {
    const primary = document(
      primaryUrl,
      "Erwan Simon dirige les opérations de GENIAL à Bordeaux.",
    );
    const supplement = document(
      supplementUrl,
      "Erwan Simon présente le développement de GENIAL à Bordeaux.",
    );
    const mergedDocument = mergeProviderDocuments(primary, supplement);
    const mergedMetadata = combineSupplementMetadata({
      primary: metadata({ id: "primary-search", url: primaryUrl }),
      supplement: metadata({ id: "supplement-search", url: supplementUrl }),
      retainSupplementContent: true,
    });

    expect(mergedDocument.claims.map(({ sourceUrl }) => sourceUrl)).toEqual([
      primaryUrl,
      supplementUrl,
    ]);
    expect(mergedMetadata.sources.map(({ sourceId }) => sourceId)).toEqual([
      "primary-search",
      "supplement:supplement-search",
    ]);
    expect(mergedMetadata.webSearchActionCount).toBe(2);
    expect(mergedMetadata.webSearchQueryCount).toBe(2);
  });

  it("keeps primary content when supplemental metadata is rejected", () => {
    const primaryDocument = document(
      primaryUrl,
      "Erwan Simon dirige les opérations de GENIAL à Bordeaux.",
    );
    const combined = combineSupplementMetadata({
      primary: metadata({ id: "primary-search", url: primaryUrl }),
      supplement: metadata({
        id: "supplement-search",
        url: supplementUrl,
        supported: false,
      }),
      retainSupplementContent: false,
    });

    expect(primaryDocument.claims).toHaveLength(1);
    expect(combined.sources.map(({ url }) => url)).toEqual([primaryUrl]);
    expect(combined.webSearchActionCount).toBe(2);
    expect(combined.webSearchActionPolicyStatus).toBe("supported");
  });

  it("selects repair or supplement once, never both", () => {
    const selected = beginSecondProviderCall(null, "structural_repair");
    expect(selected).toBe("structural_repair");
    expect(() => beginSecondProviderCall(selected, "recall_supplement"))
      .toThrow("already been selected");
    expect(MAX_PROVIDER_HTTP_CALLS).toBe(2);
    expect(MAX_PROVIDER_WEB_SEARCH_TOOL_CALLS).toBe(4);
    expect(MAX_WEB_SEARCH_ACTIONS).toBe(6);
  });
});
