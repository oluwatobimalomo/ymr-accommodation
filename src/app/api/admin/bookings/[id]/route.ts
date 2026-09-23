import { handleAdminAction } from "@/lib/admin-action";
import { cancelBooking } from "@/lib/booking/admin-queries";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/bookings/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    if (intent === "cancel") {
      await cancelBooking(actor, id, String(form.get("reason") ?? ""));
    }
  });
}
