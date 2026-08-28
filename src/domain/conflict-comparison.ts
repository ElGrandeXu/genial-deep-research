type ConflictPeriod = {
  readonly status: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly as_of: string | null;
  readonly label: string | null;
};

type ConflictScope = {
  readonly type: string;
  readonly label: string | null;
};

export type ConflictMetricSignature = {
  readonly metric: "revenue" | "workforce";
  readonly definition: string;
  readonly semanticUnit: "currency" | "employees";
  readonly currency: string | null;
  readonly scaleUnit: "thousand" | "million" | "billion" | null;
  readonly scopeKind: "entity" | "group" | "subsidiary" | "parent";
};

export type ConflictMetricObservation = ConflictMetricSignature & {
  readonly value: number;
  readonly periodKey: string;
  readonly valueNature: ConflictValueNature;
};

export type ConflictValueNature = "published" | "estimated" | "unknown";

const CONFLICT_NUMBER_LITERAL = String.raw`[-+]?\d+(?:(?:[ .\u202f]\d{3})+|(?:[.,]\d+))?`;
const CONFLICT_SCALE_LITERAL = String.raw`(?:k|thousand|thousands|millier(?:s)?|million(?:s)?|milliard(?:s)?|billion|billions|bn)`;
const CONFLICT_VALUE_LITERAL = String.raw`${CONFLICT_NUMBER_LITERAL}(?:\s*${CONFLICT_SCALE_LITERAL})?`;
const CONFLICT_NUMBER_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\d])(${CONFLICT_NUMBER_LITERAL})(?:\s*(${CONFLICT_SCALE_LITERAL}))?`,
  "giu",
);

export function canonicalConflictText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

export function conflictSourcePageKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return null;
  }
}

export function conflictLocatorDocumentIdentity(locator: string): {
  readonly pageKey: string;
  readonly digest: string;
} | null {
  try {
    const parsed: unknown = JSON.parse(locator);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.finalUrl !== "string" ||
      typeof record.normalizedTextSha256 !== "string" ||
      !/^[0-9a-f]{64}$/iu.test(record.normalizedTextSha256)
    ) return null;
    const pageKey = conflictSourcePageKey(record.finalUrl);
    return pageKey === null
      ? null
      : { pageKey, digest: record.normalizedTextSha256.toLowerCase() };
  } catch {
    return null;
  }
}

export function conflictPeriodKey(period: ConflictPeriod): string {
  return JSON.stringify([
    period.status,
    period.start,
    period.end,
    period.as_of,
    canonicalConflictText(period.label),
  ]);
}

export function conflictScopeKey(scope: ConflictScope): string {
  return JSON.stringify([
    canonicalConflictText(scope.type),
    canonicalConflictText(scope.label),
  ]);
}

export function conflictUnitCurrencyKey(
  unit: string | null,
  currency: string | null,
): string {
  return JSON.stringify([
    canonicalConflictText(unit),
    canonicalConflictText(currency),
  ]);
}

export function conflictValueKey(value: unknown): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function parseLiteral(raw: string): number | null {
  const compact = raw.replace(/[ \u202f]/gu, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  let canonical = compact;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    canonical = compact.replaceAll(thousands, "").replace(decimal, ".");
  } else {
    const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
    if (separator !== null) {
      const pieces = compact.split(separator);
      const groupedThousands = pieces.length > 1 &&
        pieces.slice(1).every((piece) => piece.length === 3);
      canonical = groupedThousands
        ? pieces.join("")
        : `${pieces.shift() ?? ""}.${pieces.join("")}`;
    }
  }
  const value = Number(canonical);
  return Number.isFinite(value) ? value : null;
}

function scaleFor(raw: string | undefined): {
  readonly multiplier: number;
  readonly unit: ConflictMetricSignature["scaleUnit"];
} | null {
  const value = canonicalConflictText(raw);
  if (value.length === 0) return { multiplier: 1, unit: null };
  if (/^(?:k|thousand|thousands|millier|milliers)$/u.test(value)) {
    return { multiplier: 1_000, unit: "thousand" };
  }
  if (/^millions?$/u.test(value)) return { multiplier: 1_000_000, unit: "million" };
  if (/^(?:milliards?|billions?|bn)$/u.test(value)) {
    return { multiplier: 1_000_000_000, unit: "billion" };
  }
  return null;
}

function parsedConflictNumbers(excerpt: string): Array<{
  readonly value: number;
  readonly scaleUnit: ConflictMetricSignature["scaleUnit"];
}> {
  return [...excerpt.matchAll(CONFLICT_NUMBER_PATTERN)].flatMap((match) => {
    const raw = match[1];
    const scale = scaleFor(match[2]);
    if (raw === undefined || scale === null) return [];
    if (match[2] !== undefined && /^[-+]?\d+[.,]\d{3}$/u.test(raw)) return [];
    const parsed = parseLiteral(raw);
    if (parsed === null) return [];
    const isBareYear = match[2] === undefined && /^\d{4}$/u.test(raw) && parsed >= 1900 && parsed <= 2100;
    return isBareYear ? [] : [{ value: parsed * scale.multiplier, scaleUnit: scale.unit }];
  });
}

export function parseConflictMetricValue(excerpt: string): number | null {
  const values = [...new Set(parsedConflictNumbers(excerpt).map(({ value }) => value))];
  return values.length === 1 ? values[0] ?? null : null;
}

function currencyFromText(text: string): string | null | undefined {
  const currencies = new Set<string>();
  if (/(?:€|\beur\b|\beuros?\b)/u.test(text)) currencies.add("EUR");
  if (/\busd\b|\bus dollars?\b|\bdollars? americains?\b/u.test(text)) currencies.add("USD");
  if (/(?:£|\bgbp\b|\bpounds? sterling\b|\blivres? sterling\b)/u.test(text)) currencies.add("GBP");
  if (/\bchf\b|\bfrancs? suisses?\b/u.test(text)) currencies.add("CHF");
  if (/\bcad\b|\bcanadian dollars?\b|\bdollars? canadiens?\b/u.test(text)) currencies.add("CAD");
  if (/\baud\b|\baustralian dollars?\b|\bdollars? australiens?\b/u.test(text)) currencies.add("AUD");
  if (/\bjpy\b|\byens?\b/u.test(text)) currencies.add("JPY");
  if (/\bcny\b|\byuans?\b|\brenminbi\b/u.test(text)) currencies.add("CNY");
  if (currencies.size > 1) return undefined;
  return [...currencies][0] ?? null;
}

function oneDefinition(matches: readonly [string, boolean][], fallback: string): string | null {
  const present = matches.filter(([, matched]) => matched).map(([name]) => name);
  if (present.length > 1) return null;
  return present[0] ?? fallback;
}

function scopeKindFromText(text: string): ConflictMetricSignature["scopeKind"] | null {
  const scopeKinds = [
    ["group", /\b(?:consolidated|consolide(?:e|es|s)?|au niveau du groupe|for the group|group-wide|groupe dans son ensemble)\b/u.test(text)],
    ["subsidiary", /\b(?:subsidiary|subsidiaries|filiale|filiales)\b/u.test(text)],
    ["parent", /\b(?:parent company|maison mere|societe mere)\b/u.test(text)],
  ] as const;
  const present = scopeKinds.filter(([, matched]) => matched).map(([kind]) => kind);
  return present.length > 1 ? null : present[0] ?? "entity";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const CONFLICT_PERIOD_LITERAL = String.raw`(?:(?:calendar(?:[ -]year)?|annee\s+(?:civile|calendaire))\s+(?:19|20)\d{2}|(?:fy|fiscal(?:[ -]year)?|financial(?:[ -]year)?|exercice|annee\s+fiscale)\s+(?:19|20)\d{2})`;
const CONFLICT_SCOPE_QUALIFIER = String.raw`(?:consolidated|consolide(?:e|es|s)?|subsidiary|filiale|parent\s+company|maison\s+mere|societe\s+mere|for\s+the\s+group|au\s+niveau\s+du\s+groupe|group-wide)`;
const CONFLICT_REVENUE_DEFINITION = String.raw`(?:adjusted|ajuste(?:e|es|s)?|organic|organique|gross|brut(?:e|es|s)?|net)`;
const CONFLICT_NATURE_QUALIFIER = String.raw`(?:expected|projected|target(?:ed)?|guidance|budgeted|preliminary|provisional|estimated|attendu(?:e|es|s)?|projete(?:e|es|s)?|objectif|budgete(?:e|es|s)?|preliminaire|provisoire)`;
const CONFLICT_ARTICLE = String.raw`(?:a|an|the|un|une|le|la|les|l)`;
const CONFLICT_CURRENCY_LITERAL = String.raw`(?:€|eur|(?:d\s+)?euros?|usd|us\s+dollars?|dollars?\s+americains?|£|gbp|pounds?\s+sterling|livres?\s+sterling|chf|francs?\s+suisses?|cad|canadian\s+dollars?|dollars?\s+canadiens?|aud|australian\s+dollars?|dollars?\s+australiens?|jpy|yens?|cny|yuans?|renminbi)`;
const CONFLICT_PERIOD_TAIL = String.raw`(?:(?:in|for|during|en|pour|pour\s+l|au\s+titre\s+de)\s+(?:the\s+)?${CONFLICT_PERIOD_LITERAL})`;

function conflictClauses(text: string): string[] {
  return text
    .split(/[!?;\r\n]+|\.(?=\s+\p{L}|$)/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function ownedMetricClause(
  text: string,
  expectedSubject: string,
): {
  readonly body: string;
  readonly clause: string;
  readonly subjectIncludesSubsidiaries: boolean;
} | null {
  const subject = escapeRegExp(canonicalConflictText(expectedSubject).replace(/[’']/gu, " "));
  if (subject.length === 0) return null;
  const subjectScopeExtension = String.raw`\s+(?:(?:and|including)\s+(?:all\s+)?(?:its\s+)?subsidiaries|(?:et|incluant|y compris)\s+(?:toutes?\s+)?ses\s+filiales)`;
  const reportingVerb = String.raw`(?:(?:a|ont|avait|avaient|has|have|had)\s+)?(?:publi(?:e|ee|es|ees)|declar(?:e|ee|es|ees)|declared|declares|reported|reports|published|publishes|estim(?:e|ee|es|ees)|estimated|estimates|forecast|forecasted|forecasts)`;
  const relation = new RegExp(
    String.raw`^${subject}(?![\p{L}\d])(${subjectScopeExtension})?[\s,]+${reportingVerb}\b\s*(.*)$`,
    "u",
  );
  const matches = conflictClauses(text).flatMap((clause) => {
    const match = clause.match(relation);
    const body = match?.[2]?.trim();
    return body === undefined || body.length === 0
      ? []
      : [{
          body,
          clause,
          subjectIncludesSubsidiaries: match?.[1] !== undefined,
        }];
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}

function linkedMetricValue(
  body: string,
  metric: ConflictMetricSignature["metric"],
): { readonly value: number; readonly scaleUnit: ConflictMetricSignature["scaleUnit"] } | null {
  const connector = String.raw`(?:de|of|at|was|is|s\s+eleve\s+a|atteint|totaled|totalled)`;
  const periodOrEmpty = String.raw`(?:\s+${CONFLICT_PERIOD_TAIL})?`;
  const value = String.raw`(${CONFLICT_VALUE_LITERAL})(?![\d.,])`;
  const revenueQualifier = String.raw`(?:${CONFLICT_ARTICLE}|${CONFLICT_PERIOD_LITERAL}|${CONFLICT_SCOPE_QUALIFIER}|${CONFLICT_REVENUE_DEFINITION}|${CONFLICT_NATURE_QUALIFIER}|annual)`;
  const workforceBasis = String.raw`(?:average|averaged|moyenne?|en\s+moyenne|year-end|at\s+year\s+end|end\s+of\s+(?:the\s+)?year|fin\s+d\s+annee|a\s+la\s+cloture|au\s+31\s+decembre)`;
  const workforceQualifier = String.raw`(?:${CONFLICT_ARTICLE}|${CONFLICT_PERIOD_LITERAL}|${CONFLICT_SCOPE_QUALIFIER}|${CONFLICT_NATURE_QUALIFIER}|${workforceBasis})`;
  const pattern = metric === "revenue"
    ? new RegExp(
        String.raw`^(?:(?:${revenueQualifier})\s+)*(?:chiffres?\s+d\s+affaires?|revenus?|revenue|turnover|net\s+sales|sales)(?:\s+(?:${CONFLICT_REVENUE_DEFINITION}|${CONFLICT_NATURE_QUALIFIER}|${CONFLICT_SCOPE_QUALIFIER}))*\s+${connector}\s+${value}\s*${CONFLICT_CURRENCY_LITERAL}${periodOrEmpty}$`,
        "u",
      )
    : new RegExp(
        String.raw`^(?:(?:${workforceQualifier})\s+)*(?:effectifs?|workforce|headcount|staff|etp|fte|full[ -]time\s+equivalents?)(?:\s+(?:${workforceBasis}|${CONFLICT_NATURE_QUALIFIER}|${CONFLICT_SCOPE_QUALIFIER}))*\s+${connector}\s+${value}\s+(?:employees?|employe(?:e|es|s)?|salarie(?:e|es|s)?|effectifs?|headcount|staff|etp|fte)${periodOrEmpty}$`,
        "u",
      );
  const literal = body.match(pattern)?.[1];
  const literalMatch = literal?.match(
    new RegExp(String.raw`^(${CONFLICT_NUMBER_LITERAL})(?:\s*(${CONFLICT_SCALE_LITERAL}))?$`, "iu"),
  );
  const raw = literalMatch?.[1];
  const scale = scaleFor(literalMatch?.[2]);
  if (raw === undefined || scale === null) return null;
  if (literalMatch?.[2] !== undefined && /^[-+]?\d+[.,]\d{3}$/u.test(raw)) return null;
  if (metric === "revenue" && /^[-+]?\d+[.,]\d{3}$/u.test(raw)) return null;
  const parsed = parseLiteral(raw);
  if (parsed === null) return null;
  return { value: parsed * scale.multiplier, scaleUnit: scale.unit };
}

export function conflictMetricObservation(
  excerpt: string,
  expectedSubject: string,
): ConflictMetricObservation | null {
  const text = canonicalConflictText(excerpt).replace(/[’']/gu, " ");
  if (
    /%|[~≈<>]|\b(?:percent|percentage|pourcent(?:age)?|growth|grew|increase|increased|decrease|decreased|change|delta|croissance|hausse|baisse|variation|progression|recul|about|approximately|around|circa|environ|approximativement|between|entre|from|de\s+plus\s+de|more\s+than|less\s+than|at\s+least|at\s+most|up\s+to|over|under)\b/u.test(text) ||
    /\d\s*(?:-|–|—|to|a)\s*\d/u.test(text)
  ) return null;
  const revenue = /\b(?:chiffres?\s+d\s+affaires?|revenus?|revenue|turnover|net\s+sales|sales)\b/u.test(text);
  const workforce = /\b(?:effectifs?|employe(?:e|es|s)?|salarie(?:e|es|s)?|employees?|workforce|headcount|staff|etp|fte)\b/u.test(text);
  if (Number(revenue) + Number(workforce) !== 1) return null;
  const metric = revenue ? "revenue" : "workforce";
  const owned = ownedMetricClause(text, expectedSubject);
  if (owned === null) return null;
  const linked = linkedMetricValue(owned.body, metric);
  if (linked === null) return null;
  const { value, scaleUnit } = linked;
  const { body, clause } = owned;
  const periodKey = conflictExcerptPeriodKey(clause);
  if (periodKey === null) return null;
  const valueNature = conflictValueNature(clause);
  const currency = currencyFromText(clause);
  const bodyScopeKind = scopeKindFromText(body);
  if (currency === undefined || bodyScopeKind === null || bodyScopeKind === "parent") return null;
  if (
    owned.subjectIncludesSubsidiaries &&
    bodyScopeKind !== "entity" &&
    bodyScopeKind !== "group"
  ) return null;
  const scopeKind = owned.subjectIncludesSubsidiaries ? "group" : bodyScopeKind;

  if (revenue) {
    if (currency === null) return null;
    if (
      /\b(?:annual\s+recurring\s+revenue|arr|run[ -]rate\s+revenue|operating\s+revenue|revenu\s+recurrent\s+annuel|revenu\s+operationnel)\b/u.test(clause)
    ) return null;
    const definition = oneDefinition([
      ["adjusted", /\b(?:ajuste(?:e|es|s)?|adjusted)\b/u.test(body)],
      ["organic", /\b(?:organique|organic)\b/u.test(body)],
      ["gross", /\b(?:brut(?:e|es|s)?|gross)\b/u.test(body)],
      ["net", /\b(?:net\s+(?:revenues?|turnover|sales)|(?:revenus?|turnover|sales|chiffres?\s+d\s+affaires?)\s+net(?:te)?s?)\b/u.test(body)],
    ], "standard");
    return definition === null
      ? null
      : {
          metric: "revenue",
          definition,
          semanticUnit: "currency",
          currency,
          scaleUnit,
          scopeKind,
          value,
          periodKey,
          valueNature,
        };
  }

  if (currency !== null) return null;
  const basis = oneDefinition([
    ["average", /\b(?:average|averaged|moyenne?|en moyenne)\b/u.test(clause)],
    ["year_end", /\b(?:year-end|end of (?:the )?year|at year end|fin d annee|a la cloture|au 31 decembre)\b/u.test(clause)],
  ], "unspecified");
  if (basis === null || basis === "unspecified") return null;
  const countKind = /\b(?:etp|fte|full[ -]time equivalents?)\b/u.test(clause)
    ? "fte"
    : "headcount";
  return {
    metric: "workforce",
    definition: `${countKind}_${basis}`,
    semanticUnit: "employees",
    currency: null,
    scaleUnit,
    scopeKind,
    value,
    periodKey,
    valueNature,
  };
}

export function conflictMetricPredicate(value: string): ConflictMetricSignature["metric"] | null {
  const text = canonicalConflictText(value).replace(/[^a-z0-9]+/gu, " ");
  if (/\b(?:chiffre d affaires|chiffre affaires|revenue|turnover|sales)\b/u.test(text)) {
    return "revenue";
  }
  if (/\b(?:effectif|employees?|headcount|workforce|staff|etp|fte)\b/u.test(text)) {
    return "workforce";
  }
  return null;
}

export function conflictExcerptPeriodKey(excerpt: string): string | null {
  const text = canonicalConflictText(excerpt);
  if (
    /\b(?:q[1-4]|t[1-4]|h[12]|s[12]|quarters?|trimestres?|semesters?|semestres?|first[ -]half|second[ -]half|half[ -]year|year[ -]to[ -]date|ytd|ttm|ltm|trailing[ -]twelve[ -]months?|last[ -]twelve[ -]months?|rolling(?:[ -]year)?|premier[ -]semestre|second[ -]semestre|months?|mois|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\b/u.test(text)
  ) return null;
  const years = [...new Set(text.match(/\b(?:19|20)\d{2}\b/gu) ?? [])];
  if (years.length !== 1) return null;
  const fiscal = /\b(?:fy|fiscal(?:[ -]year)?|financial(?:[ -]year)?|exercice|annee fiscale)\b/u.test(text);
  const calendar = /\b(?:calendar(?:[ -]year)?|annee (?:civile|calendaire))\b/u.test(text);
  if (fiscal === calendar) return null;
  const basis = fiscal ? "fiscal" : "calendar";
  return `${years[0] ?? ""}|${basis}`;
}

export function conflictPeriodSupportsExcerpt(
  period: ConflictPeriod,
  excerpt: string,
): boolean {
  const evidenceKey = conflictExcerptPeriodKey(excerpt);
  if (evidenceKey === null || period.status !== "stated") return false;
  const structuredKey = conflictExcerptPeriodKey([
    period.label,
    period.start,
    period.end,
    period.as_of,
  ].filter((value) => value !== null).join(" "));
  return structuredKey === evidenceKey;
}

export function conflictPeriodSupportsKey(
  period: ConflictPeriod,
  evidenceKey: string,
): boolean {
  if (period.status !== "stated") return false;
  const structuredKey = conflictExcerptPeriodKey([
    period.label,
    period.start,
    period.end,
    period.as_of,
  ].filter((value) => value !== null).join(" "));
  return structuredKey === evidenceKey;
}

export function conflictValueNature(excerpt: string): ConflictValueNature {
  const text = canonicalConflictText(excerpt);
  if (
    /\b(?:non(?:\s+encore)?|pas(?:\s+encore)?|jamais|not(?:\s+yet)?|never)\b(?:[\s-]+\p{L}+){0,3}[\s-]+(?:publi(?:e|ee|es|ees)|declar(?:e|ee|es|ees)|declared|reported|audited|estim(?:e|ee|es|ees|ated)|verifi(?:e|ee|es|ees)|verified)\b/u.test(text) ||
    /\b(?:ne|n)\b.{0,24}\b(?:pas|jamais)\b.{0,24}\b(?:publi(?:e|ee|es|ees)|declar(?:e|ee|es|ees)|reported|audited|estim(?:e|ee|es|ees|ated)|verifi(?:e|ee|es|ees)|verified)\b/u.test(text) ||
    /\b(?:unpublished|undeclared|unaudited|unreported|unverified)\b/u.test(text) ||
    /\b(?:contest(?:e|ee|es|ees)|disputed|incertain(?:e|es|s)?|uncertain)\b/u.test(text)
  ) {
    return "unknown";
  }
  const published = /\b(?:publi(?:e|ee|es|ees)|declar(?:e|ee|es|ees)|declared|reported|audited)\b/u.test(text);
  const estimated = /\b(?:estim(?:e|ee|es|ees|ated)|forecast(?:ed)?|prevision(?:nel(?:le)?)?|expected|projected|target(?:ed)?|guidance|budgeted|preliminary|provisional|attendu(?:e|es|s)?|projete(?:e|es|s)?|objectif|budgete(?:e|es|s)?|preliminaire|provisoire)\b/u.test(text);
  if (published === estimated) return "unknown";
  return published ? "published" : "estimated";
}

export function conflictScopeMatchesExcerpt(
  scope: ConflictScope,
  signature: ConflictMetricSignature,
): boolean {
  if (signature.scopeKind === "group") return canonicalConflictText(scope.type) === "group";
  if (signature.scopeKind === "subsidiary") return canonicalConflictText(scope.type) === "subsidiary";
  if (signature.scopeKind === "parent") return canonicalConflictText(scope.type) === "company";
  return canonicalConflictText(scope.type) === "company";
}

export function conflictVersionUnitMatchesExcerpt(
  unit: string | null,
  signature: ConflictMetricSignature,
): boolean {
  const normalizedUnit = canonicalConflictText(unit);
  if (signature.semanticUnit === "employees") {
    return /^(?:employees?|employes?|salaries?|effectifs?|headcount|workforce|staff|etp|fte)$/u.test(normalizedUnit);
  }
  if (normalizedUnit.length === 0) return true;
  if (/^(?:currency|monetary|money|revenue|turnover|sales|chiffre d affaires)$/u.test(normalizedUnit)) {
    return true;
  }
  if (signature.scaleUnit === "thousand") return /^(?:k|thousands?|milliers?)$/u.test(normalizedUnit);
  if (signature.scaleUnit === "million") return /^millions?$/u.test(normalizedUnit);
  if (signature.scaleUnit === "billion") return /^(?:milliards?|billions?|bn)$/u.test(normalizedUnit);
  return /^(?:currency|monetary|money)$/u.test(normalizedUnit);
}
