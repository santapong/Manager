import { type NextRequest } from "next/server";
import { dbNode, withWorkspace } from "@manager/db";
import { env } from "@/src/env";
import { auth } from "@/src/lib/auth";
import { aiService } from "@/src/lib/ai";
import { aiEncryptionConfigured } from "@/src/lib/ai/crypto";
import { getActiveWorkspace } from "@/src/lib/workspace-context";
import { ChatSchema } from "@/src/lib/validators/ai";
import { getDecryptedKey } from "@/src/server/ai-keys";
import { assistantTools, runAssistantTool } from "@/src/server/ai-tools";

// Node runtime: the adapter uses the Anthropic SDK + node:crypto (key
// decryption), and we hold an open transaction per tool call. Never cached —
// every chat turn is a fresh model call against live workspace data.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /api/ai/chat — streaming assistant turn.
 *
 * Body: { messages: { role, content }[] } (ChatSchema). Replies with a stream
 * of newline-delimited JSON (NDJSON), one object per line:
 *   - { "type": "text", "text": "…" }        a model text delta
 *   - { "type": "proposal", "proposal": {…} } a gated write awaiting confirmation
 *   - { "type": "error", "message": "…" }     a terminal error (no secrets/stack)
 *
 * The model may call read tools (looked up live) and write tools. Write tools
 * NEVER mutate: `runAssistantTool` validates + resolves them into a *proposal*
 * which we forward to the client as a `proposal` line; the model is told it was
 * proposed, not applied. The user must Confirm a proposal, which runs the real
 * mutation in a Server Action. Every tool call runs through `runAssistantTool`
 * inside a `withWorkspace` transaction so it is RLS-scoped to the caller's
 * workspace.
 *
 * Auth: 401 without a session, 400 without an active workspace, 400 when the
 * workspace has no AI key or the server has no encryption key configured. The
 * BYO key is decrypted only here, passed straight to the adapter, and never
 * logged or returned.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const svc = await auth();
  const session = await svc.getSession();
  if (!session) return jsonError("Sign in to use the assistant.", 401);

  const ws = await getActiveWorkspace();
  if (!ws) return jsonError("Select a workspace first.", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid chat request.", 400);
  }

  if (!aiEncryptionConfigured()) {
    return jsonError("AI is not configured on this server.", 400);
  }

  const db = dbNode(env.DATABASE_URL);
  const apiKey = await withWorkspace(db, ws.id, (tx) => getDecryptedKey(tx, ws.id));
  if (!apiKey) {
    return jsonError("No AI key is set for this workspace. Add one in Settings → AI.", 400);
  }

  const system =
    `You are the AI assistant for the "${ws.name}" workspace inside a project-management app. ` +
    "You can read the workspace's projects, tasks, and sprints with the provided tools. " +
    "Always use a tool to look up real data before answering questions about projects, tasks, or sprints — never guess names, statuses, counts, or keys. " +
    "Project keys look like \"ENG\" and task keys like \"ENG-12\". " +
    "You can also PROPOSE changes with the write tools create_task, update_task, and move_task. " +
    "These never change anything directly: each proposal becomes a confirmation card the user must explicitly Confirm before it is applied. " +
    "Only propose a change when the user clearly asks for one; keep each proposal minimal and explicit, changing just the fields they asked about. " +
    "After proposing, briefly tell the user what you've prepared and that they can Confirm or Dismiss it — do not claim a change is done. " +
    "Answer concisely and refer to tasks by their key. If you can't find something, say so plainly.";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      // One NDJSON object per line. Swallow post-close enqueues (client aborts).
      const writeLine = (obj: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        await aiService().streamChat(
          {
            apiKey,
            system,
            messages: parsed.data.messages,
            tools: assistantTools(),
          },
          {
            onText: (delta) => writeLine({ type: "text", text: delta }),
            // Each tool call gets its own RLS-scoped transaction. Reads return
            // their JSON to the model; writes come back as a proposal we forward
            // to the client as its own line, then tell the model it was proposed
            // (never applied) so it can't believe a change happened.
            executeTool: async (name, input) => {
              const result = await withWorkspace(db, ws.id, (tx) =>
                runAssistantTool(tx, ws.id, name, input),
              );
              if (result.proposal) writeLine({ type: "proposal", proposal: result.proposal });
              return result.forModel;
            },
          },
        );
      } catch {
        // No secrets, no stack — just a marker the UI can show inline.
        writeLine({ type: "error", message: "The assistant ran into a problem." });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
