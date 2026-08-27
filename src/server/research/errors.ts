export interface SourceErrorDiagnostics {
  readonly sourceFetchCount: number;
  readonly sourceVerificationMs: number;
}

export const CONTENT_TYPE_REJECTION_REASON_CODES = [
  "content_type_missing",
  "content_type_multiple",
  "content_type_conflicting",
  "content_type_syntax_invalid",
  "media_type_unsupported",
] as const;

export type ContentTypeRejectionReasonCode =
  (typeof CONTENT_TYPE_REJECTION_REASON_CODES)[number];

export const SOURCE_MEDIA_TYPE_CLASSES = [
  "application_pdf",
  "application_json",
  "application_octet_stream",
  "image",
  "audio",
  "video",
  "text_other",
  "other",
] as const;

export type SourceMediaTypeClass = (typeof SOURCE_MEDIA_TYPE_CLASSES)[number];

export type ContentTypeRejectionDiagnostics =
  | {
      readonly reasonCode: Exclude<
        ContentTypeRejectionReasonCode,
        "media_type_unsupported"
      >;
      readonly sourceMediaTypeClass: null;
    }
  | {
      readonly reasonCode: "media_type_unsupported";
      readonly sourceMediaTypeClass: SourceMediaTypeClass;
    };

export class ResearchPipelineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly sourceDiagnostics?: SourceErrorDiagnostics,
    readonly contentTypeDiagnostics?: ContentTypeRejectionDiagnostics,
  ) {
    super(message);
    this.name = "ResearchPipelineError";
  }
}
