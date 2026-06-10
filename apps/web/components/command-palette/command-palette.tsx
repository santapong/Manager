"use client";

// Cmd-K command palette (cmdk). Navigation + live task search via the
// FTS-backed server action. shouldFilter is off — nav items are filtered
// with a simple substring match and task hits are already server-filtered.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { searchTasksAction } from "../../app/[workspace]/_actions/search";

type Project = { key: string; name: string };
type Hit = { id: string; key: string; title: string; projectKey: string };

export function CommandPalette({
  workspaceSlug,
  projects,
}: {
  workspaceSlug: string;
  projects: Project[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setValue("");
      setHits([]);
    }
  }, [open]);

  // Debounced task search once the query is meaningful.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchTasksAction(q);
      setHits(res.hits.map((h) => ({ id: h.id, key: h.key, title: h.title, projectKey: h.projectKey })));
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [value]);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  const q = value.trim().toLowerCase();
  const navItems = useMemo(() => {
    const items = [
      { label: "Projects", path: `/${workspaceSlug}` },
      { label: "Inbox", path: `/${workspaceSlug}/inbox` },
      { label: "Search", path: `/${workspaceSlug}/search` },
      { label: "Members", path: `/${workspaceSlug}/settings/members` },
      { label: "Tags", path: `/${workspaceSlug}/settings/labels` },
      { label: "New project", path: `/${workspaceSlug}/projects/new` },
      ...projects.flatMap((p) => [
        { label: `${p.key} — ${p.name}`, path: `/${workspaceSlug}/projects/${p.key}` },
        { label: `${p.key} — Board`, path: `/${workspaceSlug}/projects/${p.key}/board` },
      ]),
    ];
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  }, [workspaceSlug, projects, q]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      shouldFilter={false}
      label="Command palette"
      className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
      overlayClassName="fixed inset-0 z-40 bg-black/30"
    >
      <Command.Input
        value={value}
        onValueChange={setValue}
        placeholder="Jump to… or search tasks"
        className="w-full border-b border-gray-200 px-4 py-3 text-sm focus:outline-none"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-gray-500">
          {searching ? "Searching…" : "No results."}
        </Command.Empty>

        {navItems.length > 0 ? (
          <Command.Group
            heading="Navigate"
            className="text-xs font-medium uppercase tracking-wide text-gray-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {navItems.map((item) => (
              <Command.Item
                key={item.path + item.label}
                value={item.label}
                onSelect={() => go(item.path)}
                className="cursor-pointer rounded-md px-3 py-2 text-sm normal-case tracking-normal text-gray-800 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {hits.length > 0 ? (
          <Command.Group
            heading="Tasks"
            className="text-xs font-medium uppercase tracking-wide text-gray-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {hits.map((hit) => (
              <Command.Item
                key={hit.id}
                value={`${hit.key} ${hit.title}`}
                onSelect={() => go(`/${workspaceSlug}/projects/${hit.projectKey}?task=${hit.id}`)}
                className="cursor-pointer rounded-md px-3 py-2 text-sm normal-case tracking-normal text-gray-800 data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
              >
                <span className="mr-2 font-mono text-xs text-gray-500">{hit.key}</span>
                {hit.title}
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
