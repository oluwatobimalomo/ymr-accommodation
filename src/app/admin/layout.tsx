import { AdminShell } from "@/components/AdminChrome";
import { getCurrentActor } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  return actor ? <AdminShell actor={actor}>{children}</AdminShell> : <div className="admin-login-shell">{children}</div>;
}
