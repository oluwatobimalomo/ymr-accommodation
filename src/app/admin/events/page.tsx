import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listEvents, type EventStatus } from "@/lib/inventory/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

const toInputDate = (value: Date | null) => value
  ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value).replace(" ", "T")
  : "";

function EventFields({ event }: { event?: Awaited<ReturnType<typeof listEvents>>[number] }) {
  return <>
    {event && <input type="hidden" name="eventId" value={event.id} />}
    <div className="event-form-grid">
      <label className="field"><span>Event name</span><input name="name" required minLength={2} maxLength={120} defaultValue={event?.name} placeholder="YMR 2026 — City Takers" /></label>
      <label className="field"><span>Slug</span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={event?.slug} placeholder="ymr-2026-city-takers" /></label>
      <label className="field"><span>Year</span><input name="year" type="number" required min={2000} max={2200} defaultValue={event?.year ?? new Date().getFullYear()} /></label>
      <label className="field"><span>Booking reference prefix</span><input name="bookingRefPrefix" required pattern="[A-Z0-9]+(-[A-Z0-9]+)*" maxLength={24} defaultValue={event?.bookingRefPrefix} placeholder="YMR26-ACM" /></label>
      <label className="field"><span>Status</span><select name="status" defaultValue={event?.status ?? "DRAFT"}>{(["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as EventStatus[]).map((status) => <option value={status} key={status}>{status[0]}{status.slice(1).toLowerCase()}</option>)}</select></label>
      <label className="field"><span>Payment hold (minutes)</span><input name="holdMinutes" type="number" required min={5} max={120} defaultValue={event?.holdMinutes ?? 15} /></label>
      <label className="field"><span>Bookings open (WAT)</span><input name="bookingOpensAt" type="datetime-local" defaultValue={toInputDate(event?.bookingOpensAt ?? null)} /></label>
      <label className="field"><span>Bookings close (WAT)</span><input name="bookingClosesAt" type="datetime-local" defaultValue={toInputDate(event?.bookingClosesAt ?? null)} /></label>
      <label className="field"><span>Expected check-in (WAT)</span><input name="checkInDate" type="datetime-local" defaultValue={toInputDate(event?.checkInDate ?? null)} /></label>
      <label className="field"><span>Expected check-out (WAT)</span><input name="checkOutDate" type="datetime-local" defaultValue={toInputDate(event?.checkOutDate ?? null)} /></label>
    </div>
  </>;
}

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "events.manage")) notFound();
  const [{ error }, eventRows] = await Promise.all([searchParams, listEvents()]);

  return <div className="admin-page stack events-admin-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Administration</span><h1>Events</h1><p>Manage retreat editions, booking windows, and check-in dates.</p></div></header>
    <ErrorBanner error={error} />
    <section className="card event-create-card"><div><span className="eyebrow">New edition</span><h2>Create an event</h2><p className="listing-meta">Events stay in the system for booking history. Archive editions that should no longer accept bookings.</p></div>
      <form method="post" action="/api/admin/events" className="stack"><input type="hidden" name="intent" value="create"/><EventFields/><button className="btn" type="submit">Create event</button></form>
    </section>
    <section className="card events-directory"><div className="admin-section-heading"><div><span className="eyebrow">Retreat editions</span><h2>All events</h2></div><span className="staff-count-badge">{eventRows.length} events</span></div>
      {eventRows.length ? <div className="events-list">{eventRows.map((event) => <details className="event-row" key={event.id}>
        <summary><span><strong>{event.name}</strong><small>{event.year} · {event.status[0]}{event.status.slice(1).toLowerCase()} · {event.bookingRefPrefix}</small></span><span className="event-edit-label">Edit event</span></summary>
        <form method="post" action="/api/admin/events" className="stack event-edit-form"><input type="hidden" name="intent" value="update"/><EventFields event={event}/><button className="btn secondary" type="submit">Save event</button></form>
      </details>)}</div> : <p className="empty-state">No events have been created yet.</p>}
    </section>
  </div>;
}
