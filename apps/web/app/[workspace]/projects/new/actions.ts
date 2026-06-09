"use server";

import { redirect } from "next/navigation";
import { createProjectWithDefaultList } from "@manager/db/queries";
import { auth } from "@/src/lib/auth";
import { CreateProjectSchema } from "@/src/lib/validators/task";
import { withActiveWorkspace } from "@/src/lib/workspace-context";

export async function createProject(_prev: unknown, formData: FormData) {
  const parsed = CreateProjectSchema.safeParse({
    name: formData.get("name"),
    key: String(formData.get("key") ?? "").toUpperCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const svc = await auth();
  const session = await svc.requireSession();

  // redirect() works by throwing NEXT_REDIRECT, so it must stay OUTSIDE the
  // try — otherwise the catch swallows it and the success redirect is lost.
  let result: { slug: string; projectKey: string };
  try {
    result = await withActiveWorkspace(async (tx, ws) => {
      const project = await createProjectWithDefaultList(tx, {
        workspaceId: ws.id,
        key: parsed.data.key,
        name: parsed.data.name,
        createdBy: session.user.id,
      });
      return { slug: ws.slug, projectKey: project.key };
    });
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
      return { error: `Project key "${parsed.data.key}" is taken — pick another.` };
    }
    throw e;
  }
  redirect(`/${result.slug}/projects/${result.projectKey}`);
}
