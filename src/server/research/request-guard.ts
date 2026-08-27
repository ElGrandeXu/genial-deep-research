import { createHash, randomBytes } from "node:crypto";

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_ADMISSIONS_PER_WINDOW = 3;
const MAX_CONCURRENT_REQUESTS = 2;

export type ResearchAdmission =
  | {
      readonly admitted: true;
      readonly release: () => void;
    }
  | {
      readonly admitted: false;
      readonly code: "rate_limited" | "server_busy";
      readonly retryAfterSeconds: number;
    };

export interface ResearchRequestGuard {
  acquire(request: Request): ResearchAdmission;
}

interface ResearchRequestGuardOptions {
  readonly now?: () => number;
  readonly hashSalt?: Uint8Array;
}

function clientAddress(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  const firstAddress = forwarded?.split(",", 1)[0]?.trim();
  return firstAddress === undefined || firstAddress.length === 0
    ? "address-unavailable"
    : firstAddress.slice(0, 128);
}

function retryAfterSeconds(delayMs: number): number {
  return Math.max(1, Math.ceil(delayMs / 1_000));
}

export function createResearchRequestGuard(
  options: ResearchRequestGuardOptions = {},
): ResearchRequestGuard {
  const now = options.now ?? Date.now;
  const salt = options.hashSalt ?? randomBytes(32);
  const admissions = new Map<string, number[]>();
  let activeRequests = 0;

  function prune(currentTime: number): void {
    const earliestAcceptedTime = currentTime - WINDOW_MS;
    for (const [key, timestamps] of admissions) {
      const retained = timestamps.filter(
        (timestamp) => timestamp > earliestAcceptedTime,
      );
      if (retained.length === 0) admissions.delete(key);
      else if (retained.length !== timestamps.length) admissions.set(key, retained);
    }
  }

  return {
    acquire(request) {
      const currentTime = now();
      prune(currentTime);

      const addressHash = createHash("sha256")
        .update(salt)
        .update(clientAddress(request), "utf8")
        .digest("hex");
      const timestamps = admissions.get(addressHash) ?? [];
      if (timestamps.length >= MAX_ADMISSIONS_PER_WINDOW) {
        const oldestAdmission = timestamps[0] ?? currentTime;
        return {
          admitted: false,
          code: "rate_limited",
          retryAfterSeconds: retryAfterSeconds(
            oldestAdmission + WINDOW_MS - currentTime,
          ),
        };
      }

      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        return {
          admitted: false,
          code: "server_busy",
          retryAfterSeconds: 1,
        };
      }

      timestamps.push(currentTime);
      admissions.set(addressHash, timestamps);
      activeRequests += 1;
      let released = false;
      return {
        admitted: true,
        release() {
          if (released) return;
          released = true;
          activeRequests = Math.max(0, activeRequests - 1);
        },
      };
    },
  };
}
