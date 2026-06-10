"use server";

import { z } from "zod";
import { searchService } from "@/src/lib/search";
import { getActiveWorkspace } from "@/src/lib/workspace-context";

const QuerySchema = z.string().min(2).max(200);

/** Task search for the command palette (debounced client-side). */
export async function searchTasksAction(query: string) {
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) return { ok: true as const, hits: [] };

  const ws = await getActiveWorkspace();
  if (!ws) return { ok: true as const, hits: [] };

  const hits = await searchService().search(ws.id, parsed.data, { limit: 10 });
  return { ok: true as const, hits };
}
