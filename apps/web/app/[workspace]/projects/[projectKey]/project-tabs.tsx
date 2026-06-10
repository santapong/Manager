import Link from "next/link";

const TABS = [
  { id: "tasks", label: "Tasks", path: "" },
  { id: "board", label: "Board", path: "/board" },
  { id: "milestones", label: "Milestones", path: "/milestones" },
  { id: "graph", label: "Dependencies", path: "/graph" },
] as const;

export type ProjectTab = (typeof TABS)[number]["id"];

export function ProjectTabs({
  workspaceSlug,
  projectKey,
  active,
}: {
  workspaceSlug: string;
  projectKey: string;
  active: ProjectTab;
}) {
  return (
    <nav aria-label="Project sections" className="flex gap-4 border-b border-gray-200 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/${workspaceSlug}/projects/${projectKey}${tab.path}`}
          aria-current={tab.id === active ? "page" : undefined}
          className={
            tab.id === active
              ? "-mb-px border-b-2 border-brand-600 px-1 py-2 font-medium text-brand-700"
              : "-mb-px border-b-2 border-transparent px-1 py-2 text-gray-500 hover:text-gray-900"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
