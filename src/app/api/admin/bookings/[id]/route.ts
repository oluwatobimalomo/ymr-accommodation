import { handleAdminAction } from "@/lib/admin-action";
import { cancelBooking, checkInBooking, checkOutBooking, issueOccupantKey, updateKeyCustody } from "@/lib/booking/admin-queries";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/bookings/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    if (intent === "cancel") {
      await cancelBooking(actor, id, String(form.get("reason") ?? ""));
    }
    if (intent === "check-in") await checkInBooking(actor, id, String(form.get("reason") ?? ""));
    if (intent === "check-out") await checkOutBooking(actor, id);
    if (intent === "issue-key") await issueOccupantKey(actor, id, String(form.get("occupantId") ?? ""), String(form.get("keyLabel") ?? ""));
    if (intent === "return-key") await updateKeyCustody(actor, String(form.get("recordId") ?? ""), "return", String(form.get("note") ?? ""));
    if (intent === "missing-key") await updateKeyCustody(actor, String(form.get("recordId") ?? ""), "missing", String(form.get("note") ?? ""));
  });
}
