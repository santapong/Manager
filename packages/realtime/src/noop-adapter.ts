import type { RealtimeService } from "./types";

/**
 * No-op realtime service used in Phase 0 and in tests. Logs publishes
 * to stderr so they're visible but never reach a remote service.
 */
export function createNoopRealtimeService(): RealtimeService {
  return {
    async publish({ channel, event }) {
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[realtime/noop] publish ${channel} ${event}`);
      }
    },
    async authorize() {
      return {
        token: `noop_${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 60_000),
      };
    },
    async presenceEnter() {},
    async presenceLeave() {},
  };
}
