import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth";

export async function POST() {
  const svc = await auth();
  await svc.signOut();
  redirect("/sign-in");
}

export async function GET() {
  return POST();
}
