import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/src/lib/workspace-context";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const ws = await getActiveWorkspace();
  if (ws) redirect(`/${ws.slug}`);
  return (
    <main className="mx-auto mt-24 max-w-md px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Welcome to Manager</h1>
      <p className="mb-6 text-sm text-gray-600">
        Create your workspace to get started. You can invite teammates after.
      </p>
      <WelcomeForm />
    </main>
  );
}
