import {
  createAblyRealtimeService,
  createNoopRealtimeService,
  type RealtimeService,
} from "@manager/realtime";
import { env } from "../env";

export const REALTIME_ENABLED = Boolean(env.ABLY_API_KEY);

/**
 * RealtimeService port construction (PLAN §7): Ably when configured,
 * silent no-op otherwise — every feature must work without it.
 */
export function realtimeService(): RealtimeService {
  return env.ABLY_API_KEY
    ? createAblyRealtimeService(env.ABLY_API_KEY)
    : createNoopRealtimeService();
}

/** Channel naming: one channel per project, namespaced by workspace. */
export function projectChannel(workspaceId: string, projectId: string): string {
  return `ws:${workspaceId}:project:${projectId}`;
}
