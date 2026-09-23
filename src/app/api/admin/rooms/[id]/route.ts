import { handleAdminAction } from "@/lib/admin-action";
import { setRoomStatus, updateRoom, updateRoomCapacity } from "@/lib/inventory/rooms";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/rooms/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");
    if (intent === "capacity") {
      await updateRoomCapacity(actor, id, Number(form.get("capacity") ?? 0), String(form.get("reason") ?? ""));
      return;
    }
    if (intent === "status") {
      await setRoomStatus(
        actor,
        id,
        String(form.get("status")) as "ACTIVE" | "INACTIVE" | "MAINTENANCE",
        String(form.get("reason") ?? ""),
      );
      return;
    }
    await updateRoom(actor, id, { name: String(form.get("name") ?? ""), code: String(form.get("code") ?? "") });
  });
}
