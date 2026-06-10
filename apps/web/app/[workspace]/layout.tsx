import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { and, eq } from "drizzle-orm";
import { dbNode, memberships, workspaces } from "@manager/db";
import { countUnread } from "@manager/db/queries";
import { env } from "@/src/env";
import { auth } from "@/src/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE } from "@/src/lib/workspace-context";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const svc = await auth();
  const session = await svc.getSession();
  if (!session) redirect("/sign-in");

  const db = dbNode(env.DATABASE_URL);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
  if (!ws) notFound();
  const [m] = await db
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ws.id), eq(memberships.userId, session.user.id)))
    .limit(1);
  if (!m) notFound(); // never 403 — don't leak existence

  const unread = await countUnread(db, { workspaceId: ws.id, userId: session.user.id });

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value !== ws.id) {
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, ws.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">{ws.name}</span>
            <span className="font-mono text-xs text-gray-500">/{ws.slug}</span>
            <nav aria-label="Workspace" className="ml-4 flex items-center gap-3 text-sm">
              <Link href={`/${ws.slug}`} className="text-gray-600 hover:text-gray-900">
                Projects
              </Link>
              <Link
                href={`/${ws.slug}/inbox`}
                className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900"
              >
                Inbox
                {unread > 0 ? (
                  <span
                    aria-label={`${unread} unread notifications`}
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white"
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
              <Link
                href={`/${ws.slug}/settings/labels`}
                className="text-gray-600 hover:text-gray-900"
              >
                Tags
              </Link>
              <Link
                href={`/${ws.slug}/settings/members`}
                className="text-gray-600 hover:text-gray-900"
              >
                Members
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">{session.user.email}</span>
            <form action="/api/auth/sign-out" method="post">
              <button className="text-gray-500 hover:text-gray-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
