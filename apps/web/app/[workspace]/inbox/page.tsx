import Link from "next/link";
import { listNotificationsForUser } from "@manager/db/queries";
import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { InboxList } from "./inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const [{ workspace: slug }, { filter }] = await Promise.all([params, searchParams]);
  const unreadOnly = filter !== "all";

  const svc = await auth();
  const session = await svc.requireSession();
  const items = await withActiveWorkspace(async (tx, ws) =>
    listNotificationsForUser(tx, { workspaceId: ws.id, userId: session.user.id, unreadOnly }),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <nav aria-label="Inbox filter" className="flex gap-2 text-sm">
          <Link
            href={`/${slug}/inbox`}
            className={
              unreadOnly
                ? "rounded-md bg-gray-900 px-2.5 py-1 font-medium text-white"
                : "rounded-md px-2.5 py-1 text-gray-600 hover:bg-gray-100"
            }
          >
            Unread
          </Link>
          <Link
            href={`/${slug}/inbox?filter=all`}
            className={
              !unreadOnly
                ? "rounded-md bg-gray-900 px-2.5 py-1 font-medium text-white"
                : "rounded-md px-2.5 py-1 text-gray-600 hover:bg-gray-100"
            }
          >
            All
          </Link>
        </nav>
      </header>

      <InboxList
        workspaceSlug={slug}
        items={items.map((i) => ({
          id: i.id,
          type: i.type,
          read: i.readAt !== null,
          createdAt: i.createdAt.toISOString(),
          actor: i.actor ? (i.actor.name ?? i.actor.email) : null,
          excerpt: typeof i.payload.excerpt === "string" ? i.payload.excerpt : null,
          task: i.task,
          // Tolerate deleted tasks: fall back to the denormalized payload.
          taskKey: i.task?.key ?? (typeof i.payload.taskKey === "string" ? i.payload.taskKey : null),
          taskTitle:
            i.task?.title ??
            (typeof i.payload.taskTitle === "string" ? i.payload.taskTitle : null),
        }))}
      />
    </div>
  );
}
