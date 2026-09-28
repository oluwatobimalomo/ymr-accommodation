import { handleAdminAction } from "@/lib/admin-action";
import { getCurrentActor } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/auth/origin";
import { can, ForbiddenError } from "@/lib/authz/authorize";
import { safeErrorMessage } from "@/lib/safe-error";
import { getTicket } from "@/lib/support/tickets";
import { replyToTicket, setTicketStatus } from "@/lib/support/tickets";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await params;
  try {
    const data = await getTicket(actor, id);
    if (!data) return Response.json({ error: "That support ticket could not be found." }, { status: 404 });
    return Response.json({ ...data, canManage: can(actor, "support.manage", { lodgeId: data.lodge?.id }) });
  } catch (error) {
    return Response.json({ error: error instanceof ForbiddenError ? "You don't have permission to view this ticket." : safeErrorMessage(error) }, { status: error instanceof ForbiddenError ? 403 : 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (request.headers.get("accept")?.includes("application/json")) {
    if (!isSameOrigin(request)) return Response.json({ error: "Bad origin." }, { status: 403 });
    const actor = await getCurrentActor();
    if (!actor) return Response.json({ error: "Please sign in again." }, { status: 401 });
    try {
      const payload = await request.json() as { intent?: string; status?: string; body?: string };
      if (payload.intent === "reply") await replyToTicket(actor, id, String(payload.body ?? ""));
      else if (payload.intent === "status") await setTicketStatus(actor, id, String(payload.status) as never, String(payload.body ?? ""));
      else return Response.json({ error: "Choose a valid ticket action." }, { status: 400 });
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error instanceof ForbiddenError ? "You don't have permission to update this ticket." : safeErrorMessage(error) }, { status: error instanceof ForbiddenError ? 403 : 400 });
    }
  }
  return handleAdminAction(request, `/admin/support/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    if (intent === "reply") {
      await replyToTicket(actor, id, String(form.get("body") ?? ""));
      return;
    }
    if (intent === "status") {
      await setTicketStatus(actor, id, String(form.get("status")) as never, String(form.get("body") ?? ""));
      return;
    }
  });
}
