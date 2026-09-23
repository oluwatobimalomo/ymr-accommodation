import { handleAdminAction } from "@/lib/admin-action";
import { setBedspaceStatus } from "@/lib/inventory/bedspaces";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") ?? "";
  const returnTo = url.searchParams.get("returnTo") || `/admin/rooms/${roomId}`;
  return handleAdminAction(request, returnTo, async (form, actor) => {
    await setBedspaceStatus(
      actor,
      id,
      String(form.get("status")) as "AVAILABLE" | "BLOCKED" | "MAINTENANCE" | "RETIRED",
      String(form.get("reason") ?? "") || undefined,
    );
  });
}
