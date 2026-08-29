export const RESEARCH_RATE_LIMIT_MODE = "waf_only" as const;
export const RESEARCH_WAF_WINDOW_SECONDS = 600;
export const RESEARCH_WAF_MAX_REQUESTS = 20;
const MAX_CONCURRENT_REQUESTS = 2;

export type ResearchAdmission =
  | {
      readonly admitted: true;
      readonly release: () => void;
    }
  | {
      readonly admitted: false;
      readonly code: "server_busy";
      readonly retryAfterSeconds: number;
    };

export interface ResearchRequestGuard {
  acquire(request: Request): Promise<ResearchAdmission>;
}

export function createResearchRequestGuard(): ResearchRequestGuard {
  let activeRequests = 0;

  return {
    async acquire() {
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        return {
          admitted: false,
          code: "server_busy",
          retryAfterSeconds: 1,
        };
      }

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
