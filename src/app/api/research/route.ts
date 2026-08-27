import {
  createOpenAIResearchProvider,
  PROVIDER_TIMEOUT_MS,
} from "../../../server/ai/providers";
import {
  parseResearchRequest,
  ResearchRequestError,
} from "../../../server/research/request";
import { executeResearch } from "../../../server/research/service";
import {
  buildFailureReceipt,
  publicFailureMessage,
} from "../../../server/research/failure-receipt";
import { createSourceVerifier } from "../../../server/research/source-content";
import { createProductionSourceTransportDependencies } from "../../../server/research/source-transport";
import type {
  ResearchProgressEvent,
  ResearchProvider,
  SafeLogger,
  SourceVerifier,
} from "../../../server/research/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ResearchRouteDependencies {
  readonly providerFactory: () => ResearchProvider;
  readonly sourceVerifierFactory: () => SourceVerifier;
  readonly logger: SafeLogger;
}

const encoder = new TextEncoder();

export function serializeResearchEvent(
  event: ResearchProgressEvent,
  stringify: (value: unknown) => string = JSON.stringify,
): { readonly event: ResearchProgressEvent; readonly bytes: Uint8Array } {
  try {
    const payload = stringify(event);
    return {
      event,
      bytes: encoder.encode(`event: ${event.state}\ndata: ${payload}\n\n`),
    };
  } catch {
    const receipt = buildFailureReceipt(new TypeError("Serialization failed."), {
      attemptId: event.executionId,
      failedStage: "serialization",
      durationMs: event.elapsedMs,
    });
    const fallback: ResearchProgressEvent = {
      state: "failed",
      executionId: event.executionId,
      elapsedMs: event.elapsedMs,
      error: {
        code: receipt.publicCode,
        message: publicFailureMessage(receipt.category),
        retryable: false,
      },
      receipt,
    };
    const payload = JSON.stringify(fallback);
    return {
      event: fallback,
      bytes: encoder.encode(`event: failed\ndata: ${payload}\n\n`),
    };
  }
}

function errorResponse(error: ResearchRequestError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    {
      status: error.status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export function createResearchPostHandler(dependencies: ResearchRouteDependencies) {
  return async function researchPost(request: Request): Promise<Response> {
    const requestStartedAt = performance.now();
    let input;
    try {
      input = await parseResearchRequest(request);
    } catch (error) {
      if (error instanceof ResearchRequestError) return errorResponse(error);
      return Response.json(
        { error: { code: "invalid_request", message: "La requête est invalide." } },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const acceptedMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
    const localAbort = new AbortController();
    const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
    const signal = AbortSignal.any([request.signal, localAbort.signal, timeout]);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let terminalSent = false;
        let provider: ResearchProvider;
        let sourceVerifier: SourceVerifier;
        try {
          provider = dependencies.providerFactory();
        } catch (error) {
          provider = { async research() { throw error; } };
        }
        try {
          sourceVerifier = dependencies.sourceVerifierFactory();
        } catch (error) {
          sourceVerifier = { async verify() { throw error; } };
        }
        void executeResearch({
          input,
          provider,
          sourceVerifier,
          signal,
          acceptedMs,
          emit(event) {
            if (terminalSent) return;
            const serialized = serializeResearchEvent(event);
            if (
              serialized.event.state === "completed" ||
              serialized.event.state === "failed"
            ) {
              terminalSent = true;
            }
            controller.enqueue(serialized.bytes);
            if (serialized.event !== event) localAbort.abort();
          },
          logger: dependencies.logger,
        })
          .catch(() => undefined)
          .finally(() => {
            try {
              controller.close();
            } catch {
              // Client abandonment has already closed the stream.
            }
          });
      },
      cancel() {
        localAbort.abort();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-store",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  };
}

export const POST = createResearchPostHandler({
  providerFactory: createOpenAIResearchProvider,
  sourceVerifierFactory() {
    return createSourceVerifier(createProductionSourceTransportDependencies());
  },
  logger: {
    info(record) {
      console.info("research_receipt", record);
    },
  },
});
