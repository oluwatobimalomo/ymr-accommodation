import { handleAdminAction } from "@/lib/admin-action";
import { createCategory } from "@/lib/inventory/categories";

export async function POST(request: Request) {
  const lodgeId = new URL(request.url).searchParams.get("lodgeId") ?? "";
  return handleAdminAction(request, `/admin/lodges/${lodgeId}`, async (form, actor) => {
    await createCategory(actor, {
      lodgeId,
      name: String(form.get("name") ?? ""),
      mode: String(form.get("mode")) as "PRIVATE" | "SHARED",
      genderRestriction: String(form.get("genderRestriction") || "ANY") as "ANY" | "MALE" | "FEMALE",
      pricingModel: String(form.get("pricingModel")) as "PER_UNIT" | "PER_PERSON",
      defaultPriceMinor: Math.round(Number(form.get("priceNaira") ?? 0) * 100),
      description: String(form.get("description") ?? ""),
      customerSelectsRoom: form.get("customerSelectsRoom") === "on",
      customerSelectsBedspace: form.get("customerSelectsBedspace") === "on",
      allowEntireRoomBooking: form.get("allowEntireRoomBooking") === "on",
    });
  });
}
