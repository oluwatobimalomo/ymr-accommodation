import { handleAdminAction } from "@/lib/admin-action";
import { updateCategory, updateCategoryPricing } from "@/lib/inventory/categories";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lodgeId = new URL(request.url).searchParams.get("lodgeId") ?? "";
  return handleAdminAction(request, `/admin/categories/${id}?lodgeId=${lodgeId}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");
    if (intent === "pricing") {
      await updateCategoryPricing(
        actor,
        id,
        { defaultPriceMinor: Math.round(Number(form.get("priceNaira") ?? 0) * 100) },
        String(form.get("reason") ?? ""),
      );
      return;
    }
    await updateCategory(actor, id, {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      customerSelectsRoom: form.get("customerSelectsRoom") === "on",
      customerSelectsBedspace: form.get("customerSelectsBedspace") === "on",
      allowEntireRoomBooking: form.get("allowEntireRoomBooking") === "on",
      status: String(form.get("status") ?? "ACTIVE") as "ACTIVE" | "INACTIVE",
    });
  });
}
