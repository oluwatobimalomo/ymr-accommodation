import { handleAdminAction } from "@/lib/admin-action";
import { createEvent, updateEvent, type EventInput, type EventStatus } from "@/lib/inventory/events";

function dateValue(form: FormData, name: string): Date | null {
  const value = String(form.get(name) ?? "").trim();
  if (!value) return null;
  // datetime-local fields are entered as Lagos time; persist the corresponding UTC instant.
  const localDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+01:00` : value;
  const date = new Date(localDate);
  if (Number.isNaN(date.getTime())) throw new Error(`Enter a valid ${name.replace(/([A-Z])/g, " $1").toLowerCase()}.`);
  return date;
}

function readEvent(form: FormData): EventInput {
  const year = Number(form.get("year"));
  const holdMinutes = Number(form.get("holdMinutes"));
  return {
    name: String(form.get("name") ?? "").trim(),
    slug: String(form.get("slug") ?? "").trim(),
    year,
    status: String(form.get("status") ?? "DRAFT") as EventStatus,
    bookingRefPrefix: String(form.get("bookingRefPrefix") ?? "").trim(),
    holdMinutes,
    bookingOpensAt: dateValue(form, "bookingOpensAt"),
    bookingClosesAt: dateValue(form, "bookingClosesAt"),
    checkInDate: dateValue(form, "checkInDate"),
    checkOutDate: dateValue(form, "checkOutDate"),
  };
}

export async function POST(request: Request) {
  return handleAdminAction(request, "/admin/events", async (form, actor) => {
    const intent = String(form.get("intent") ?? "create");
    const input = readEvent(form);
    if (intent === "create") await createEvent(actor, input);
    else if (intent === "update") await updateEvent(actor, String(form.get("eventId") ?? ""), input);
    else throw new Error("Choose a valid event action.");
  }, "/admin/events?saved=1");
}
