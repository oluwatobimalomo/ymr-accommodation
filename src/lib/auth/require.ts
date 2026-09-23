import { redirect } from "next/navigation";
import { getCurrentActor } from "./session";
import type { Actor } from "@/lib/authz/authorize";

/** For server components: redirects to login if not signed in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/admin/login");
  return actor;
}
