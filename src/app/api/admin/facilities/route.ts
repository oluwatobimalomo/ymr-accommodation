import { handleAdminAction } from "@/lib/admin-action";
import { createFacility } from "@/lib/inventory/facilities";

export async function POST(request: Request) {
  return handleAdminAction(request, "/admin/facilities", async (form, actor) => {
    await createFacility(actor, String(form.get("name") ?? ""), String(form.get("icon") ?? ""));
  });
}
