// eslint-disable-next-line no-restricted-imports
import * as Ably from "ably";
import type { RealtimeService } from "./types";

/**
 * Ably implementation of the RealtimeService port (cloud tier). Server-side
 * only: publishes over REST and mints client TokenRequests scoped to the
 * requested channels with subscribe-only capability. The self-host tier
 * swaps this for a Soketi adapter behind the same port (PLAN §7).
 */
export function createAblyRealtimeService(apiKey: string): RealtimeService {
  const rest = new Ably.Rest({ key: apiKey });
  return {
    async publish({ channel, event, payload }) {
      await rest.channels.get(channel).publish(event, payload);
    },

    async authorize({ userId, channels }) {
      const capability: Record<string, ["subscribe"]> = {};
      for (const channel of channels) capability[channel] = ["subscribe"];
      const ttlMs = 60 * 60 * 1000;
      const tokenRequest = await rest.auth.createTokenRequest({
        clientId: userId,
        capability: JSON.stringify(capability),
        ttl: ttlMs,
      });
      // The port carries the TokenRequest as a JSON string; auth endpoints
      // return it verbatim and ably-js clients consume it via authUrl.
      return {
        token: JSON.stringify(tokenRequest),
        expiresAt: new Date(Date.now() + ttlMs),
      };
    },

    // Presence enter/leave needs a Realtime connection — Ably's REST API
    // only reads presence. Browser clients drive presence themselves
    // (Phase 4); these server-side port methods stay inert until then.
    async presenceEnter() {},

    async presenceLeave() {},
  };
}
