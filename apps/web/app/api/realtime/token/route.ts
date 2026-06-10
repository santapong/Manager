import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/src/lib/auth";
import { REALTIME_ENABLED, realtimeService } from "@/src/lib/realtime";
import { getActiveWorkspace } from "@/src/lib/workspace-context";

export const runtime = "nodejs";

/**
 * GET /api/realtime/token?channel=ws:{wsId}:project:{projectId}
 *
 * Mints a subscribe-only TokenRequest for the requested channel. 404 when
 * realtime isn't configured (clients treat that as "stay on polling").
 * Channel must belong to the caller's active workspace.
 */
export async function GET(req: NextRequest) {
  if (!REALTIME_ENABLED) return new NextResponse("not_found", { status: 404 });

  const svc = await auth();
  const session = await svc.getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const ws = await getActiveWorkspace();
  if (!ws) return new NextResponse("no_workspace", { status: 403 });

  const channel = req.nextUrl.searchParams.get("channel") ?? "";
  if (!channel.startsWith(`ws:${ws.id}:`)) {
    return new NextResponse("forbidden_channel", { status: 403 });
  }

  const { token } = await realtimeService().authorize({
    userId: session.user.id,
    workspaceId: ws.id,
    channels: [channel],
  });

  // token is a serialized Ably TokenRequest — return it as JSON for authUrl.
  return new NextResponse(token, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
