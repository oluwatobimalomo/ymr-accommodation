import { handleAdminAction } from "@/lib/admin-action";
import { replyToTicket, setTicketStatus } from "@/lib/support/tickets";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/support/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    if (intent === "reply") {
      await replyToTicket(actor, id, String(form.get("body") ?? ""));
      return;
    }
    if (intent === "status") {
      await setTicketStatus(actor, id, String(form.get("status")) as never);
      return;
    }
  });
}
