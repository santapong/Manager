import { auth } from "@/src/lib/auth";
import { withActiveWorkspace } from "@/src/lib/workspace-context";
import { getLayout, getWorkspaceStats } from "@/src/server/dashboard";
import { getStats as getPomodoroStats } from "@/src/server/pomodoro";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: slug } = await params;
  const session = await (await auth()).requireSession();
  const userId = session.user.id;

  const { stats, pomodoroStats, layout } = await withActiveWorkspace(async (tx, ws) => {
    const [stats, pomodoroStats, layout] = await Promise.all([
      getWorkspaceStats(tx, ws.id, userId),
      getPomodoroStats(tx, ws.id, userId),
      getLayout(tx, ws.id, userId),
    ]);
    return { stats, pomodoroStats, layout };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your workspace at a glance. Drag widgets to rearrange.
        </p>
      </header>
      <Dashboard
        workspaceSlug={slug}
        stats={stats}
        pomodoroStats={pomodoroStats}
        initialLayout={layout}
      />
    </div>
  );
}
