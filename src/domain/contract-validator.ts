import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

import schema from "../../docs/contracts/research-dossier.schema.json";
import type { ResearchDossier } from "./research-dossier";

export interface ContractViolation {
  readonly instancePath: string;
  readonly keyword: string;
  readonly message: string;
}

export type ContractValidationResult =
  | { readonly ok: true; readonly value: ResearchDossier }
  | { readonly ok: false; readonly errors: readonly ContractViolation[] };

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  strictTypes: false,
});

addFormats(ajv);

const validate = ajv.compile<ResearchDossier>(schema);

function normalizeErrors(errors: ErrorObject[] | null | undefined): ContractViolation[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message ?? "JSON Schema violation",
  }));
}

export function validateResearchDossier(value: unknown): ContractValidationResult {
  if (validate(value)) {
    return { ok: true, value };
  }

  return {
    ok: false,
    errors: normalizeErrors(validate.errors),
  };
}
