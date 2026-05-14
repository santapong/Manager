import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth";
import { getActiveWorkspace } from "@/src/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const svc = await auth();
  const session = await svc.getSession();
  if (!session) redirect("/sign-in");
  const ws = await getActiveWorkspace();
  if (!ws) redirect("/welcome");
  redirect(`/${ws.slug}`);
}
