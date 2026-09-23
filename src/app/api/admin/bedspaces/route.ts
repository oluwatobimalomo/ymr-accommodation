import { handleAdminAction } from "@/lib/admin-action";
import { createBedspace } from "@/lib/inventory/bedspaces";

export async function POST(request: Request) {
  const roomId = new URL(request.url).searchParams.get("roomId") ?? "";
  return handleAdminAction(request, `/admin/rooms/${roomId}`, async (form, actor) => {
    await createBedspace(actor, roomId, String(form.get("letter") ?? ""));
  });
}
