import { handleAdminAction } from "@/lib/admin-action";
import { createUnit } from "@/lib/inventory/units";

export async function POST(request: Request) {
  const categoryId = new URL(request.url).searchParams.get("categoryId") ?? "";
  return handleAdminAction(request, `/admin/categories/${categoryId}`, async (form, actor) => {
    await createUnit(actor, {
      categoryId,
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? ""),
      description: String(form.get("description") ?? ""),
      capacity: Number(form.get("capacity") ?? 0),
    });
  });
}
