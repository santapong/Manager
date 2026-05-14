import { Badge } from "@manager/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <Badge>Phase 0</Badge>
      <h1 className="text-3xl font-semibold tracking-tight">Manager</h1>
      <p className="text-gray-600">
        Project management for developers. The app is scaffolded; auth, workspaces, and tasks land
        in subsequent PRs.
      </p>
    </main>
  );
}
