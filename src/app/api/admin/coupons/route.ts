import { handleAdminAction } from "@/lib/admin-action";
import { createCoupon, readCouponDate, setCouponStatus } from "@/lib/coupons/coupons";

const number = (form: FormData, name: string) => Number(String(form.get(name) ?? ""));

export async function POST(request: Request) {
  return handleAdminAction(request, "/admin/coupons", async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    if (intent === "create") {
      const maxDiscount = String(form.get("maxDiscountNaira") ?? "").trim();
      const discountType = String(form.get("discountType") ?? "");
      const scope = String(form.get("scope") ?? "ALL");
      if (discountType !== "PERCENTAGE" && discountType !== "FIXED") throw new Error("Choose a valid discount type.");
      if (scope !== "ALL" && scope !== "SELECTED") throw new Error("Choose a valid apartment scope.");
      const categoryIds = scope === "SELECTED" ? form.getAll("categoryId").map(String) : [];
      if (scope === "SELECTED" && categoryIds.length === 0) throw new Error("Select at least one apartment for this code.");
      await createCoupon(actor, {
        eventId: String(form.get("eventId") ?? ""),
        code: String(form.get("code") ?? ""),
        discountType,
        discountValue: number(form, "discountValue"),
        maxDiscountNaira: discountType === "PERCENTAGE" && maxDiscount ? Number(maxDiscount) : undefined,
        categoryIds,
        minSubtotalNaira: number(form, "minSubtotalNaira"),
        maxRedemptions: number(form, "maxRedemptions"),
        maxPerAttendee: number(form, "maxPerAttendee"),
        startsAt: readCouponDate(String(form.get("startsAt") ?? ""), "Start time"),
        expiresAt: readCouponDate(String(form.get("expiresAt") ?? ""), "Expiry time"),
      });
    } else if (intent === "status") {
      const status = String(form.get("status") ?? "");
      if (status !== "ACTIVE" && status !== "PAUSED") throw new Error("Choose a valid code status.");
      await setCouponStatus(actor, String(form.get("couponId") ?? ""), status);
    } else {
      throw new Error("Choose a valid discount code action.");
    }
  }, "/admin/coupons?saved=code-created");
}
