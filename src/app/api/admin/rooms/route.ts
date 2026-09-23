import { handleAdminAction } from "@/lib/admin-action";
import { createRoom } from "@/lib/inventory/rooms";

export async function POST(request: Request) {
  const unitId = new URL(request.url).searchParams.get("unitId") ?? "";
  return handleAdminAction(request, `/admin/units/${unitId}`, async (form, actor) => {
    await createRoom(actor, {
      unitId,
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? ""),
      capacity: Number(form.get("capacity") ?? 0),
      genderRestriction: String(form.get("genderRestriction") || "ANY") as "ANY" | "MALE" | "FEMALE",
    });
  });
}
