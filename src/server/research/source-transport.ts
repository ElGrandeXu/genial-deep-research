import { request as httpsRequest, type RequestOptions } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";

import {
  ResearchPipelineError,
  type ContentTypeRejectionDiagnostics,
  type SourceMediaTypeClass,
} from "./errors";
import {
  NodeDnsResolver,
  resolveAndPinPublicAddress,
  validateSourceUrl,
  type DnsAddress,
  type DnsResolver,
  type ValidatedSourceUrl,
} from "./source-security";

export const SOURCE_MAX_BYTES = 512 * 1024;
export const SOURCE_MAX_REDIRECTS = 2;
export const SOURCE_TOTAL_TIMEOUT_MS = 20_000;
export const SOURCE_USER_AGENT = "GENIAL-SourceVerifier/1.0";

const ALLOWED_MEDIA_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SourceTransportResponse {
  readonly statusCode: number;
  readonly headers: IncomingHttpHeaders;
  readonly rawHeaders: readonly string[];
  readonly headersDistinct: Readonly<
    Record<string, readonly string[] | undefined>
  >;
  readonly body: AsyncIterable<Uint8Array>;
  destroy(error?: Error): void;
}

export interface PinnedSourceRequest {
  readonly url: URL;
  readonly address: DnsAddress;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export interface SourceTransport {
  request(request: PinnedSourceRequest): Promise<SourceTransportResponse>;
}

let nodeHttpsRequestCount = 0;

export function getNodeHttpsRequestCount(): number {
  return nodeHttpsRequestCount;
}

type HttpsRequestFactory = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ReturnType<typeof httpsRequest>;

const swallowLateTransportError = () => undefined;

export function buildPinnedHttpsRequestOptions(
  request: Omit<PinnedSourceRequest, "signal">,
): RequestOptions {
  const expectedHostname = request.url.hostname;
  const lookup: LookupFunction = (hostname, options, callback) => {
    if (hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
      const error = new Error("PINNED_LOOKUP_HOSTNAME_MISMATCH");
      if (options.all === true) {
        callback(error, []);
      } else {
        callback(error, "", request.address.family);
      }
      return;
    }
    if (options.all === true) {
      callback(null, [
        {
          address: request.address.address,
          family: request.address.family,
        },
      ]);
      return;
    }
    callback(null, request.address.address, request.address.family);
  };
  return {
    protocol: "https:",
    method: "GET",
    hostname: expectedHostname,
    port: 443,
    path: `${request.url.pathname}${request.url.search}`,
    servername: expectedHostname,
    rejectUnauthorized: true,
    agent: false,
    lookup,
    headers: {
      Accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
      "Accept-Encoding": "identity",
      Host: expectedHostname,
      "User-Agent": SOURCE_USER_AGENT,
    },
  };
}

export class NodePinnedHttpsTransport implements SourceTransport {
  constructor(private readonly requestFactory: HttpsRequestFactory = httpsRequest) {}

  request(request: PinnedSourceRequest): Promise<SourceTransportResponse> {
    if (this.requestFactory === httpsRequest) nodeHttpsRequestCount += 1;
    return new Promise((resolve, reject) => {
      const options = buildPinnedHttpsRequestOptions({
        url: request.url,
        address: request.address,
        timeoutMs: request.timeoutMs,
      });
      let client: ReturnType<typeof httpsRequest> | undefined;
      let activeResponse: IncomingMessage | undefined;
      let promiseSettled = false;
      let operationTerminal = false;
      let operationFailure: unknown;
      let clientDestroyed = false;
      let responseDestroyed = false;
      let abortListenerInstalled = false;
      let requestErrorListenerInstalled = false;
      let requestCloseListenerInstalled = false;
      let responseErrorListenerInstalled = false;
      let responseEndListenerInstalled = false;
      let responseCloseListenerInstalled = false;
      let responseEnded = false;
      const failureListeners = new Set<(error: unknown) => void>();
      const pendingResponses: IncomingMessage[] = [];
      const safeRemoveListener = (
        emitter: IncomingMessage | ReturnType<typeof httpsRequest> | undefined,
        event: string,
        listener: (...args: unknown[]) => void,
      ) => {
        try {
          emitter?.removeListener(event, listener);
        } catch {
          // Cleanup must preserve the original terminal result.
        }
      };
      const keepLateErrorSafe = (
        emitter: IncomingMessage | ReturnType<typeof httpsRequest> | undefined,
      ) => {
        if (emitter === undefined) return;
        try {
          emitter.removeListener("error", swallowLateTransportError);
          emitter.on("error", swallowLateTransportError);
        } catch {
          // A hostile emitter cannot be made safer without changing the result.
        }
      };
      const removeOwnedListeners = () => {
        if (abortListenerInstalled) {
          try {
            request.signal.removeEventListener("abort", onAbort);
          } catch {
            // Cleanup is best-effort and idempotent.
          }
          abortListenerInstalled = false;
        }
        if (requestErrorListenerInstalled) {
          safeRemoveListener(client, "error", onRequestError);
          requestErrorListenerInstalled = false;
        }
        if (requestCloseListenerInstalled) {
          safeRemoveListener(client, "close", onRequestClose);
          requestCloseListenerInstalled = false;
        }
        if (responseErrorListenerInstalled) {
          safeRemoveListener(activeResponse, "error", onResponseError);
          responseErrorListenerInstalled = false;
        }
        if (responseEndListenerInstalled) {
          safeRemoveListener(activeResponse, "end", onResponseEnd);
          responseEndListenerInstalled = false;
        }
        if (responseCloseListenerInstalled) {
          safeRemoveListener(activeResponse, "close", onResponseClose);
          responseCloseListenerInstalled = false;
        }
        keepLateErrorSafe(client);
        keepLateErrorSafe(activeResponse);
      };
      const destroyClient = (error?: Error) => {
        if (client === undefined || clientDestroyed) return;
        clientDestroyed = true;
        try {
          if (!client.destroyed) client.destroy(error);
        } catch {
          // Destruction cannot replace the original failure.
        }
      };
      const destroyResponse = (error?: Error) => {
        if (activeResponse === undefined || responseDestroyed) return;
        responseDestroyed = true;
        try {
          if (!activeResponse.destroyed) activeResponse.destroy(error);
        } catch {
          // Destruction cannot replace the original failure.
        }
      };
      const settleRequestFailure = (error: unknown) => {
        if (promiseSettled) return;
        promiseSettled = true;
        reject(error);
      };
      const terminate = (error: unknown) => {
        if (operationTerminal) return;
        operationTerminal = true;
        operationFailure = error;
        for (const notify of failureListeners) notify(error);
        failureListeners.clear();
        const destroyError = error instanceof Error ? error : undefined;
        destroyResponse(destroyError);
        destroyClient(destroyError);
        settleRequestFailure(error);
        removeOwnedListeners();
      };
      const complete = () => {
        if (operationTerminal) return;
        operationTerminal = true;
        failureListeners.clear();
        removeOwnedListeners();
      };
      const raceOperationFailure = <T>(promise: Promise<T>): Promise<T> => {
        if (operationTerminal) {
          return operationFailure === undefined
            ? promise
            : Promise.reject(operationFailure);
        }
        return new Promise<T>((raceResolve, raceReject) => {
          let settled = false;
          const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            failureListeners.delete(fail);
            raceReject(error);
          };
          failureListeners.add(fail);
          promise.then(
            (value) => {
              if (settled) return;
              settled = true;
              failureListeners.delete(fail);
              raceResolve(value);
            },
            (error: unknown) => {
              if (settled) return;
              settled = true;
              failureListeners.delete(fail);
              raceReject(error);
            },
          );
        });
      };
      const createBody = (response: IncomingMessage): AsyncIterable<Uint8Array> => ({
        [Symbol.asyncIterator]() {
          let iterator: AsyncIterator<Uint8Array>;
          try {
            iterator = response[Symbol.asyncIterator]();
          } catch (error) {
            terminate(error);
            throw error;
          }
          return {
            async next() {
              try {
                const item = await raceOperationFailure(
                  Promise.resolve().then(() => iterator.next()),
                );
                if (item.done === true) {
                  responseEnded = true;
                  complete();
                }
                return item;
              } catch (error) {
                terminate(error);
                throw error;
              }
            },
            async return() {
              try {
                return iterator.return === undefined
                  ? { done: true as const, value: undefined }
                  : await iterator.return();
              } finally {
                if (!operationTerminal) {
                  terminate(new Error("Source response iteration stopped early."));
                }
              }
            },
          };
        },
      });
      const adaptResponse = (response: IncomingMessage) => {
        if (operationTerminal || activeResponse !== undefined) {
          keepLateErrorSafe(response);
          try {
            if (!response.destroyed) response.destroy();
          } catch {
            // A late callback cannot change the terminal result.
          }
          return;
        }
        activeResponse = response;
        try {
          responseErrorListenerInstalled = true;
          response.on("error", onResponseError);
          responseEndListenerInstalled = true;
          response.once("end", onResponseEnd);
          responseCloseListenerInstalled = true;
          response.once("close", onResponseClose);
          const adapted: SourceTransportResponse = {
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            rawHeaders: response.rawHeaders,
            headersDistinct: response.headersDistinct,
            body: createBody(response),
            destroy(error) {
              terminate(error ?? new Error("Source response destroyed."));
            },
          };
          if (request.signal.aborted) {
            terminate(
              request.signal.reason instanceof Error
                ? request.signal.reason
                : new DOMException("Source request aborted.", "AbortError"),
            );
            return;
          }
          if (!promiseSettled) {
            promiseSettled = true;
            resolve(adapted);
          }
        } catch (error) {
          terminate(error);
        }
      };
      function onAbort() {
        terminate(
          request.signal.reason instanceof Error
            ? request.signal.reason
            : new DOMException("Source request aborted.", "AbortError"),
        );
      }
      function onRequestError(error: unknown) {
        terminate(error);
      }
      function onRequestClose() {
        if (!promiseSettled && !operationTerminal) {
          terminate(new Error("Source request closed before response headers."));
        }
      }
      function onResponseError(error: unknown) {
        terminate(error);
      }
      function onResponseEnd() {
        responseEnded = true;
      }
      function onResponseClose() {
        if (!responseEnded && !operationTerminal) {
          terminate(new Error("Source response closed before end."));
        }
      }
      const receiveResponse = (response: IncomingMessage) => {
        if (client === undefined) {
          pendingResponses.push(response);
          return;
        }
        adaptResponse(response);
      };

      try {
        client = this.requestFactory(options, receiveResponse);
        client.removeListener("error", swallowLateTransportError);
        requestErrorListenerInstalled = true;
        client.on("error", onRequestError);
        requestCloseListenerInstalled = true;
        client.once("close", onRequestClose);
        abortListenerInstalled = true;
        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) onAbort();
        if (operationTerminal) return;
        client.setTimeout(0);
        for (const response of pendingResponses.splice(0)) adaptResponse(response);
        if (!operationTerminal) client.end();
      } catch (error) {
        for (const response of pendingResponses.splice(0)) {
          keepLateErrorSafe(response);
          try {
            if (!response.destroyed) response.destroy(error as Error);
          } catch {
            // Preserve the setup failure.
          }
        }
        terminate(error);
      }
    });
  }
}

export interface FetchedSource {
  readonly body: string;
  readonly mediaType: "text/html" | "application/xhtml+xml" | "text/plain";
  readonly contentType: string;
  readonly bytesRead: number;
  readonly finalUrl: string;
  readonly citationUrl: string;
  readonly redirectCount: number;
  readonly requestCount: number;
}

function firstHeader(
  headers: IncomingHttpHeaders,
  name: "content-type" | "location",
): string | null {
  const value = headers[name];
  if (typeof value === "string") return value;
  return null;
}

function contentTypeRejection(
  diagnostics: ContentTypeRejectionDiagnostics,
  message: string,
): ResearchPipelineError {
  return new ResearchPipelineError(
    "source_content_type_rejected",
    message,
    undefined,
    diagnostics,
  );
}

function missingContentType(): ResearchPipelineError {
  return contentTypeRejection(
    { reasonCode: "content_type_missing", sourceMediaTypeClass: null },
    "Le Content-Type de la source est absent.",
  );
}

function multipleContentType(): ResearchPipelineError {
  return contentTypeRejection(
    { reasonCode: "content_type_multiple", sourceMediaTypeClass: null },
    "Le Content-Type de la source n’est pas unique.",
  );
}

function conflictingContentType(): ResearchPipelineError {
  return contentTypeRejection(
    { reasonCode: "content_type_conflicting", sourceMediaTypeClass: null },
    "Les représentations du Content-Type de la source divergent.",
  );
}

function invalidContentTypeSyntax(): ResearchPipelineError {
  return contentTypeRejection(
    { reasonCode: "content_type_syntax_invalid", sourceMediaTypeClass: null },
    "La syntaxe du Content-Type de la source est invalide.",
  );
}

function classifyUnsupportedMediaType(mediaType: string): SourceMediaTypeClass {
  if (mediaType === "application/pdf") return "application_pdf";
  if (mediaType === "application/json") return "application_json";
  if (mediaType === "application/octet-stream") {
    return "application_octet_stream";
  }
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("text/")) return "text_other";
  return "other";
}

function isHttpTokenCharacter(character: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]$/u.test(character);
}

function readHttpToken(
  value: string,
  start: number,
): { readonly token: string; readonly end: number } {
  let end = start;
  while (end < value.length && isHttpTokenCharacter(value[end] ?? "")) end += 1;
  if (end === start) throw invalidContentTypeSyntax();
  return { token: value.slice(start, end), end };
}

function skipOptionalWhitespace(value: string, start: number): number {
  let end = start;
  while (value[end] === " " || value[end] === "\t") end += 1;
  return end;
}

function isQuotedTextCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    code === 0x09 ||
    code === 0x20 ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function isQuotedPairCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    code === 0x09 ||
    code === 0x20 ||
    (code >= 0x21 && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function readQuotedString(
  value: string,
  start: number,
): { readonly decoded: string; readonly end: number } {
  let cursor = start + 1;
  let decoded = "";
  while (cursor < value.length) {
    const character = value[cursor] ?? "";
    if (character === '"') return { decoded, end: cursor + 1 };
    if (character === "\\") {
      const escaped = value[cursor + 1];
      if (escaped === undefined || !isQuotedPairCharacter(escaped)) {
        throw invalidContentTypeSyntax();
      }
      decoded += escaped;
      cursor += 2;
      continue;
    }
    if (!isQuotedTextCharacter(character)) throw invalidContentTypeSyntax();
    decoded += character;
    cursor += 1;
  }
  throw invalidContentTypeSyntax();
}

function contentTypePropertyValues(surface: unknown): readonly unknown[] {
  if (typeof surface !== "object" || surface === null || Array.isArray(surface)) {
    throw invalidContentTypeSyntax();
  }
  let entries: readonly [string, unknown][];
  try {
    entries = Object.entries(surface as Readonly<Record<string, unknown>>);
  } catch {
    throw invalidContentTypeSyntax();
  }
  return entries
    .filter(([name]) => name.toLowerCase() === "content-type")
    .map(([, value]) => value);
}

function trimHttpSpaceAndTab(value: string): string {
  return value.replace(/^[\t ]+|[\t ]+$/gu, "");
}

function readSingletonContentType(response: SourceTransportResponse): string {
  try {
    const rawHeaders: unknown = response.rawHeaders;
    if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
      throw invalidContentTypeSyntax();
    }
    const rawValues: string[] = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name: unknown = rawHeaders[index];
      const value: unknown = rawHeaders[index + 1];
      if (
        typeof name !== "string" ||
        typeof value !== "string" ||
        name.length === 0 ||
        [...name].some((character) => !isHttpTokenCharacter(character))
      ) {
        throw invalidContentTypeSyntax();
      }
      if (name.toLowerCase() === "content-type") rawValues.push(value);
    }

    const headerValues = contentTypePropertyValues(response.headers);
    const distinctValues = contentTypePropertyValues(response.headersDistinct);
    if (
      rawValues.length === 0 ||
      headerValues.length === 0 ||
      distinctValues.length === 0
    ) throw missingContentType();
    if (
      rawValues.length > 1 ||
      headerValues.length > 1 ||
      distinctValues.length > 1
    ) throw multipleContentType();

    const rawValue = rawValues[0];
    const headerValue = headerValues[0];
    const distinctValue = distinctValues[0];
    if (
      typeof rawValue !== "string" ||
      typeof headerValue !== "string" ||
      !Array.isArray(distinctValue)
    ) {
      if (Array.isArray(headerValue)) throw multipleContentType();
      throw invalidContentTypeSyntax();
    }
    if (distinctValue.length === 0) throw missingContentType();
    if (distinctValue.length > 1) throw multipleContentType();
    if (typeof distinctValue[0] !== "string") throw invalidContentTypeSyntax();

    const normalizedRawValue = trimHttpSpaceAndTab(rawValue);
    const normalizedHeaderValue = trimHttpSpaceAndTab(headerValue);
    const normalizedDistinctValue = trimHttpSpaceAndTab(distinctValue[0]);
    if (
      normalizedRawValue !== normalizedHeaderValue ||
      normalizedRawValue !== normalizedDistinctValue
    ) {
      throw conflictingContentType();
    }
    return normalizedRawValue;
  } catch (error) {
    if (
      error instanceof ResearchPipelineError &&
      error.code === "source_content_type_rejected"
    ) {
      throw error;
    }
    throw invalidContentTypeSyntax();
  }
}

function parseContentType(value: string | null): {
  readonly mediaType: FetchedSource["mediaType"];
  readonly charset: "utf-8" | "us-ascii";
  readonly normalized: string;
} {
  if (value === null) {
    throw missingContentType();
  }
  let cursor = 0;
  const type = readHttpToken(value, cursor);
  cursor = type.end;
  if (value[cursor] !== "/") throw invalidContentTypeSyntax();
  cursor += 1;
  const subtype = readHttpToken(value, cursor);
  cursor = subtype.end;
  const mediaType = `${type.token}/${subtype.token}`.toLowerCase();
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw contentTypeRejection(
      {
        reasonCode: "media_type_unsupported",
        sourceMediaTypeClass: classifyUnsupportedMediaType(mediaType),
      },
      "Le type de contenu de la source est refusé.",
    );
  }

  const parameters = new Map<string, string>();
  cursor = skipOptionalWhitespace(value, cursor);
  while (cursor < value.length) {
    if (value[cursor] !== ";") throw invalidContentTypeSyntax();
    cursor = skipOptionalWhitespace(value, cursor + 1);
    const parameterName = readHttpToken(value, cursor);
    cursor = parameterName.end;
    if (value[cursor] !== "=") throw invalidContentTypeSyntax();
    cursor += 1;

    let parameterValue: string;
    if (value[cursor] === '"') {
      const quoted = readQuotedString(value, cursor);
      parameterValue = quoted.decoded;
      cursor = quoted.end;
    } else {
      const token = readHttpToken(value, cursor);
      parameterValue = token.token;
      cursor = token.end;
    }

    const normalizedName = parameterName.token.toLowerCase();
    if (parameters.has(normalizedName)) throw invalidContentTypeSyntax();
    parameters.set(normalizedName, parameterValue);
    cursor = skipOptionalWhitespace(value, cursor);
  }

  const declared = (parameters.get("charset") ?? "utf-8").toLowerCase();
  const charset = declared === "utf8" ? "utf-8" : declared;
  if (charset !== "utf-8" && charset !== "us-ascii") {
    throw new ResearchPipelineError(
      "source_charset_rejected",
      "Le charset de la source n’est pas pris en charge.",
    );
  }
  return {
    mediaType: mediaType as FetchedSource["mediaType"],
    charset,
    normalized: `${mediaType}; charset=${charset}`,
  };
}

function invalidContentLength(): ResearchPipelineError {
  return new ResearchPipelineError(
    "source_transport_error",
    "Les métadonnées de longueur de la source sont invalides.",
  );
}

function namedHeaderEntries(
  headers: Readonly<Record<string, unknown>>,
  name: string,
): readonly unknown[] {
  return Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value);
}

function parseContentLengthDigits(value: string): string {
  const match = /^[\t ]*([0-9]+)[\t ]*$/u.exec(value);
  if (match?.[1] === undefined) throw invalidContentLength();
  return match[1];
}

function parseContentLength(response: SourceTransportResponse): number | null {
  if (response.rawHeaders.length % 2 !== 0) throw invalidContentLength();
  const rawContentLengths: string[] = [];
  let rawTransferEncodingPresent = false;
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    const value = response.rawHeaders[index + 1];
    if (typeof name !== "string" || typeof value !== "string") {
      throw invalidContentLength();
    }
    const normalizedName = name.toLowerCase();
    if (normalizedName === "content-length") rawContentLengths.push(value);
    if (normalizedName === "transfer-encoding") {
      rawTransferEncodingPresent = true;
    }
  }

  const normalizedContentLengths = namedHeaderEntries(
    response.headers as Readonly<Record<string, unknown>>,
    "content-length",
  );
  const distinctContentLengths = namedHeaderEntries(
    response.headersDistinct as Readonly<Record<string, unknown>>,
    "content-length",
  );
  const contentLengthPresent =
    rawContentLengths.length > 0 ||
    normalizedContentLengths.length > 0 ||
    distinctContentLengths.length > 0;
  if (!contentLengthPresent) return null;

  const transferEncodingPresent =
    rawTransferEncodingPresent ||
    namedHeaderEntries(
      response.headers as Readonly<Record<string, unknown>>,
      "transfer-encoding",
    ).length > 0 ||
    namedHeaderEntries(
      response.headersDistinct as Readonly<Record<string, unknown>>,
      "transfer-encoding",
    ).length > 0;
  if (transferEncodingPresent) throw invalidContentLength();
  if (
    rawContentLengths.length !== 1 ||
    normalizedContentLengths.length !== 1 ||
    distinctContentLengths.length !== 1
  ) {
    throw invalidContentLength();
  }

  const normalizedValue = normalizedContentLengths[0];
  const distinctValue = distinctContentLengths[0];
  if (
    typeof normalizedValue !== "string" ||
    !Array.isArray(distinctValue) ||
    distinctValue.length !== 1 ||
    typeof distinctValue[0] !== "string"
  ) {
    throw invalidContentLength();
  }
  const rawDigits = parseContentLengthDigits(rawContentLengths[0] ?? "");
  const normalizedDigits = parseContentLengthDigits(normalizedValue);
  const distinctDigits = parseContentLengthDigits(distinctValue[0]);
  if (rawDigits !== normalizedDigits || rawDigits !== distinctDigits) {
    throw invalidContentLength();
  }
  if (BigInt(rawDigits) > BigInt(SOURCE_MAX_BYTES)) {
    throw new ResearchPipelineError(
      "source_body_too_large",
      "Le Content-Length de la source dépasse la limite.",
    );
  }
  return Number(rawDigits);
}

function abortedCode(
  signal: AbortSignal,
  deadlineSignal?: AbortSignal,
): "source_timeout" | "source_transport_error" {
  return deadlineSignal?.aborted === true ||
    (signal.reason instanceof DOMException && signal.reason.name === "TimeoutError")
    ? "source_timeout"
    : "source_transport_error";
}

function abortError(
  signal: AbortSignal,
  deadlineSignal?: AbortSignal,
): ResearchPipelineError {
  return new ResearchPipelineError(
    abortedCode(signal, deadlineSignal),
    "La récupération a été interrompue.",
  );
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  deadlineSignal?: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw abortError(signal, deadlineSignal);
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(abortError(signal, deadlineSignal));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

const destroyedSourceResponses = new WeakSet<SourceTransportResponse>();

function destroySourceResponse(
  response: SourceTransportResponse,
  error?: Error,
): void {
  if (destroyedSourceResponses.has(response)) return;
  destroyedSourceResponses.add(response);
  try {
    response.destroy(error);
  } catch {
    // Cleanup cannot replace the operation's terminal category.
  }
}

async function readBoundedBody(
  response: SourceTransportResponse,
  signal: AbortSignal,
  deadlineSignal: AbortSignal,
): Promise<{ readonly bytes: Uint8Array; readonly count: number }> {
  const chunks: Uint8Array[] = [];
  let count = 0;
  const abort = () => {
    chunks.length = 0;
    count = 0;
    destroySourceResponse(
      response,
      signal.reason instanceof Error ? signal.reason : undefined,
    );
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const iterator = response.body[Symbol.asyncIterator]();
    while (true) {
      const item = await withAbort(
        Promise.resolve(iterator.next()),
        signal,
        deadlineSignal,
      );
      if (item.done === true) break;
      if (signal.aborted) throw abortError(signal, deadlineSignal);
      const chunk = item.value;
      count += chunk.byteLength;
      if (count > SOURCE_MAX_BYTES) {
        destroySourceResponse(response);
        throw new ResearchPipelineError(
          "source_body_too_large",
          "Le corps de la source dépasse la limite.",
        );
      }
      chunks.push(chunk);
    }
  } catch (error) {
    chunks.length = 0;
    count = 0;
    if (error instanceof ResearchPipelineError) throw error;
    destroySourceResponse(response, error instanceof Error ? error : undefined);
    throw new ResearchPipelineError(
      "source_transport_error",
      "Le flux de la source a échoué.",
    );
  } finally {
    signal.removeEventListener("abort", abort);
    if (signal.aborted) abort();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, count };
}

export async function fetchSourceWithPinning(options: {
  readonly initialUrl: ValidatedSourceUrl;
  readonly resolver: DnsResolver;
  readonly transport: SourceTransport;
  readonly signal: AbortSignal;
  readonly timeoutMs?: number;
}): Promise<FetchedSource> {
  const timeoutMs = options.timeoutMs ?? SOURCE_TOTAL_TIMEOUT_MS;
  const started = performance.now();
  const deadlineAt = started + timeoutMs;
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineController.abort(
      new DOMException("Source total deadline exceeded.", "TimeoutError"),
    );
  }, timeoutMs);
  deadlineTimer.unref?.();
  const deadlineSignal = deadlineController.signal;
  const signal = AbortSignal.any([options.signal, deadlineSignal]);
  const visited = new Set<string>();
  const citationUrl = options.initialUrl.safeHref;
  let current = options.initialUrl;
  let redirectCount = 0;
  let requestCount = 0;

  try {
    while (true) {
      if (visited.has(current.safeHref)) {
        throw new ResearchPipelineError(
          "source_redirect_rejected",
          "Une boucle de redirection a été détectée.",
        );
      }
      visited.add(current.safeHref);
      let address: DnsAddress;
      try {
        // DnsResolver cannot promise cancellation of its underlying system call.
        // The race observes and ignores every late settlement, so it cannot start transport.
        address = await withAbort(
          resolveAndPinPublicAddress(current.url.hostname, options.resolver),
          signal,
          deadlineSignal,
        );
      } catch (error) {
        if (
          redirectCount > 0 &&
          error instanceof ResearchPipelineError &&
          error.code === "source_dns_rejected"
        ) {
          throw new ResearchPipelineError(
            "source_redirect_rejected",
            "La cible de redirection ne résout pas exclusivement vers le réseau public.",
          );
        }
        throw error;
      }
      if (signal.aborted) throw abortError(signal, deadlineSignal);
      const remaining = deadlineAt - performance.now();
      if (remaining <= 0) {
        deadlineController.abort(
          new DOMException("Source total deadline exceeded.", "TimeoutError"),
        );
        throw abortError(signal, deadlineSignal);
      }
      let response: SourceTransportResponse;
      requestCount += 1;
      try {
        response = await withAbort(
          options.transport.request({
            url: current.url,
            address,
            timeoutMs: Math.max(1, Math.ceil(remaining)),
            signal,
          }),
          signal,
          deadlineSignal,
        );
      } catch (error) {
        if (error instanceof ResearchPipelineError) throw error;
        if (
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
        ) {
          throw new ResearchPipelineError(
            error.name === "TimeoutError"
              ? "source_timeout"
              : abortedCode(signal, deadlineSignal),
            "La récupération de la source a été interrompue.",
          );
        }
        throw new ResearchPipelineError(
          "source_transport_error",
          "La connexion HTTPS à la source a échoué.",
        );
      }

      if (REDIRECT_STATUSES.has(response.statusCode)) {
        destroySourceResponse(response);
        const location = firstHeader(response.headers, "location");
        if (location === null || location.trim().length === 0) {
          throw new ResearchPipelineError(
            "source_redirect_rejected",
            "La redirection ne contient pas de Location valide.",
          );
        }
        if (redirectCount >= SOURCE_MAX_REDIRECTS) {
          throw new ResearchPipelineError(
            "source_redirect_rejected",
            "La limite de redirections est dépassée.",
          );
        }
        let target: string;
        try {
          target = new URL(location, current.url).href;
        } catch {
          throw new ResearchPipelineError(
            "source_redirect_rejected",
            "La Location de redirection est invalide.",
          );
        }
        current = validateSourceUrl(target, "redirect");
        redirectCount += 1;
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        destroySourceResponse(response);
        throw new ResearchPipelineError(
          "source_http_error",
          "La source a retourné un statut HTTP non réussi.",
        );
      }
      let content: ReturnType<typeof parseContentType>;
      try {
        content = parseContentType(readSingletonContentType(response));
      } catch (error) {
        destroySourceResponse(response, error instanceof Error ? error : undefined);
        throw error;
      }
      try {
        parseContentLength(response);
      } catch (error) {
        destroySourceResponse(response, error instanceof Error ? error : undefined);
        throw error;
      }
      const body = await readBoundedBody(response, signal, deadlineSignal);
      if (body.count === 0) {
        throw new ResearchPipelineError("source_empty", "Le corps de la source est vide.");
      }
      let decoded: string;
      try {
        if (
          content.charset === "us-ascii" &&
          body.bytes.some((byte) => byte > 0x7f)
        ) {
          throw new TypeError("US_ASCII_BYTE_OUT_OF_RANGE");
        }
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(body.bytes);
      } catch {
        throw new ResearchPipelineError(
          "source_charset_rejected",
          "Le corps de la source ne correspond pas au charset déclaré.",
        );
      }
      if (decoded.trim().length === 0) {
        throw new ResearchPipelineError("source_empty", "Le corps de la source est vide.");
      }
      return {
        body: decoded,
        mediaType: content.mediaType,
        contentType: content.normalized,
        bytesRead: body.count,
        finalUrl: current.safeHref,
        citationUrl,
        redirectCount,
        requestCount,
      };
    }
  } finally {
    clearTimeout(deadlineTimer);
  }
}

export function createProductionSourceTransportDependencies(): {
  readonly resolver: DnsResolver;
  readonly transport: SourceTransport;
} {
  return {
    resolver: new NodeDnsResolver(),
    transport: new NodePinnedHttpsTransport(),
  };
}
