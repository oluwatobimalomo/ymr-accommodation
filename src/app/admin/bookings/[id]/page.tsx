import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { getBookingDetail } from "@/lib/booking/admin-queries";
import { formatNaira } from "@/lib/format-currency";
import { getDb } from "@/db/client";
import { paymentTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOccupantReallocationChoices, listReallocationHistory } from "@/lib/booking/reallocation";

export const dynamic = "force-dynamic";

export default async function AdminBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reallocate?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { error, reallocate: selectedOccupantId } = await searchParams;
  const data = await getBookingDetail(actor, id);
  if (!data) notFound();
  const { booking, occupants, category, checkoutOrder, checkoutItems, keyRecords } = data;
  const canSeeFinancials = actor.globalPermissions.has("payment.read") || actor.scopedPermissions.has("payment.read");
  const transactions = canSeeFinancials ? await getDb().select().from(paymentTransactions).where(checkoutOrder ? eq(paymentTransactions.checkoutOrderId, checkoutOrder.id) : eq(paymentTransactions.bookingId, id)) : [];
  const canCancel = can(actor, "booking.cancel") && booking.paymentStatus !== "CANCELLED" && booking.accommodationStatus !== "CHECKED_IN" && booking.accommodationStatus !== "CHECKED_OUT";
  const lodgeScope = { lodgeId: category?.lodgeId };
  const isReadyForCheckIn = booking.paymentStatus === "PAID" && booking.allocationStatus === "FULLY_ALLOCATED";
  const canCheckIn = can(actor, isReadyForCheckIn ? "checkin.perform" : "checkin.override", lodgeScope);
  const canCheckOut = can(actor, "checkout.perform", lodgeScope);
  const canSeeKeys = can(actor, "keys.read", lodgeScope);
  const canIssueKeys = can(actor, "keys.issue", lodgeScope);
  const canReallocate = can(actor, "booking.reallocate", lodgeScope);
  const reallocationHistory = await listReallocationHistory(actor, id);
  const selectedOccupant = canReallocate ? occupants.find((occupant) => occupant.id === selectedOccupantId && occupant.bedspaceId) : undefined;
  const reallocationChoices = selectedOccupant ? await getOccupantReallocationChoices(actor, id, selectedOccupant.id) : [];
  const summaryAmount = checkoutOrder?.amountMinor ?? booking.amountMinor;
  const summaryCount = checkoutOrder ? checkoutItems.length : 1;

  return (
    <div className="admin-booking-detail stack">
      <Link className="booking-detail-back" href="/admin/bookings">&larr; All bookings</Link>
      <header className="booking-detail-heading">
        <div><span className="eyebrow">Booking reference</span><h1>{booking.reference}</h1></div>
        <div className="booking-status-tags">{canSeeFinancials && <span className={`status-pill status-${booking.paymentStatus.toLowerCase()}`}>{booking.paymentStatus}</span>}<span className={`status-pill status-${booking.accommodationStatus.toLowerCase()}`}>{booking.accommodationStatus.replace(/_/g, " ")}</span></div>
      </header>
      <ErrorBanner error={error} />

      <section className="card booking-summary-card">
        <div className="booking-summary-primary"><span className="eyebrow">Booked by</span><strong>{booking.bookerName}</strong><p>{booking.bookerPhone} <span>·</span> {booking.bookerEmail}</p></div>
        <div className="booking-summary-stay"><span className="eyebrow">Accommodation</span><strong>{category?.name || "Accommodation"}</strong><span>{summaryCount === 1 ? "1 stay" : `${summaryCount} stays in this order`}</span></div>
        {canSeeFinancials && <div className="booking-summary-total"><span className="eyebrow">{checkoutOrder ? "Order total" : "Booking total"}</span><strong>{formatNaira(summaryAmount)}</strong>{checkoutOrder && <span>One payment · {checkoutOrder.paymentStatus.toLowerCase()}</span>}</div>}
      </section>

      {checkoutOrder && <details className="card booking-order-disclosure">
        <summary>View the {checkoutItems.length} accommodations in this order</summary>
        <ul className="checkout-item-list">{checkoutItems.map((item) => <li key={item.id}><Link href={`/admin/bookings/${item.id}`}>{item.lodgeName} · {item.categoryName}</Link><span>{canSeeFinancials && `${item.paymentStatus} · `}{item.accommodationStatus.replace(/_/g, " ")}</span></li>)}</ul>
      </details>}

      <section className="card booking-occupants-card" id="occupants">
        <div className="booking-section-heading"><div><span className="eyebrow">People staying</span><h2>Occupants</h2></div><span>{occupants.length}</span></div>
        <div className="booking-occupant-list">{occupants.map((occupant) => <article className="booking-occupant-row" key={occupant.id}><div><strong>{occupant.name}</strong><span>{occupant.gender === "UNSPECIFIED" ? "Gender not provided" : occupant.gender.toLowerCase()}</span></div><div>{occupant.phone && <span>{occupant.phone}</span>}{occupant.email && <span>{occupant.email}</span>}</div><small>{occupant.bedspaceId || occupant.roomId || occupant.unitId ? "Allocated" : "Not allocated"}</small></article>)}</div>
        {canReallocate && occupants.some((occupant) => occupant.bedspaceId) && <div className="occupant-reallocation-list"><h3>Reallocate a guest</h3><p>Transfers stay within the same shared accommodation category. Return any issued key first.</p>{occupants.filter((occupant) => occupant.bedspaceId).map((occupant) => <article key={occupant.id} className="occupant-reallocation-row"><strong>{occupant.name}</strong>{selectedOccupant?.id === occupant.id ? <form method="post" action={`/api/admin/bookings/${booking.id}`} className="occupant-reallocation-form"><input type="hidden" name="intent" value="reallocate"/><input type="hidden" name="occupantId" value={occupant.id}/><label className="field"><span>Destination bedspace</span><select name="targetBedspaceId" required defaultValue=""><option value="" disabled>Select an available bedspace</option>{reallocationChoices.map((choice) => <option key={choice.bedspaceId} value={choice.bedspaceId}>{choice.label}</option>)}</select></label><label className="field"><span>Reason for move</span><input name="reason" required minLength={5} maxLength={500} placeholder="Explain why this guest is moving"/></label><button className="btn" type="submit" disabled={!reallocationChoices.length}>Move guest</button>{!reallocationChoices.length && <small>No other available bedspaces in this accommodation category.</small>}<Link className="text-button" href={`/admin/bookings/${booking.id}#occupants`}>Cancel</Link></form> : <Link className="btn secondary" href={`/admin/bookings/${booking.id}?reallocate=${occupant.id}#occupants`}>Choose destination</Link>}</article>)}</div>}
        {reallocationHistory.length > 0 && <div className="reallocation-history"><h3>Allocation history</h3>{reallocationHistory.map((move) => <article key={move.id}><strong>{move.occupantName}</strong><span>{move.fromLabel} · Bedspace {move.fromLetter} <span aria-hidden="true">→</span> {move.toLabel} · Bedspace {move.toLetter}</span><small>{new Date(move.movedAt).toLocaleString()} · {move.reason}</small></article>)}</div>}
      </section>

      <section className="card booking-operations-card">
        <div className="booking-section-heading"><div><span className="eyebrow">On-site</span><h2>Guest operations</h2></div><span className="status-pill">{booking.accommodationStatus.replace(/_/g, " ")}</span></div>
        {booking.accommodationStatus === "ALLOCATED" || booking.accommodationStatus === "UNALLOCATED" ? (
          canCheckIn ? <form method="post" action={`/api/admin/bookings/${booking.id}`} className="booking-operation-action">
            <input type="hidden" name="intent" value="check-in" />
            {!isReadyForCheckIn && <div className="field"><label htmlFor="checkin-reason">Reason for overriding payment or allocation checks</label><textarea id="checkin-reason" name="reason" minLength={5} required rows={2} placeholder="Explain why check-in should proceed" /></div>}
            <button className="btn" type="submit">{isReadyForCheckIn ? "Check in booking" : "Override and check in"}</button>
          </form> : <p className="listing-meta">Check-in is available after payment and full allocation. An authorized override is required otherwise.</p>
        ) : booking.accommodationStatus === "CHECKED_IN" ? (
          <div className="booking-operation-action">{canCheckOut && <form method="post" action={`/api/admin/bookings/${booking.id}`}><input type="hidden" name="intent" value="check-out" /><button className="btn" type="submit">Check out booking</button></form>}<p className="listing-meta">Return or report every issued key before checkout.</p></div>
        ) : <p className="listing-meta">This booking is not currently eligible for check-in or check-out.</p>}

        {canSeeKeys && <div className="booking-key-area">
          <div className="booking-section-heading"><div><span className="eyebrow">Key handover</span><h3>Key custody</h3></div>{keyRecords.filter((record) => record.status === "ISSUED").length > 0 && <span className="status-pill">{keyRecords.filter((record) => record.status === "ISSUED").length} issued</span>}</div>
          {booking.accommodationStatus === "CHECKED_IN" && canIssueKeys && occupants.filter((occupant) => !keyRecords.some((record) => record.occupantId === occupant.id && record.status === "ISSUED")).map((occupant) => <form method="post" action={`/api/admin/bookings/${booking.id}`} className="key-issue-form" key={occupant.id}><input type="hidden" name="intent" value="issue-key" /><input type="hidden" name="occupantId" value={occupant.id} /><strong>{occupant.name}</strong><label className="field"><span>Key label or number</span><input name="keyLabel" required maxLength={64} placeholder="e.g. Room 4 · Key 12" /></label><button className="btn secondary" type="submit">Issue key</button></form>)}
          {keyRecords.length > 0 ? <details className="key-history-disclosure"><summary>Key history ({keyRecords.length})</summary><div className="stack">{keyRecords.map((record) => {
            const occupant = occupants.find((item) => item.id === record.occupantId);
            return <article className="key-custody-record" key={record.id}><div><strong>{record.keyLabel}</strong><span>{occupant?.name ?? "Former occupant"} · {record.status.toLowerCase()}</span><small>Issued {new Date(record.issuedAt).toLocaleString()}</small>{record.note && <small>{record.note}</small>}</div>
              {record.status === "ISSUED" && <div className="key-custody-actions">{can(actor, "keys.return", lodgeScope) && <form method="post" action={`/api/admin/bookings/${booking.id}`}><input type="hidden" name="intent" value="return-key" /><input type="hidden" name="recordId" value={record.id} /><button className="btn secondary" type="submit">Record return</button></form>}{can(actor, "keys.manage", lodgeScope) && <form method="post" action={`/api/admin/bookings/${booking.id}`} className="key-missing-form"><input type="hidden" name="intent" value="missing-key" /><input type="hidden" name="recordId" value={record.id} /><label className="field"><span>Missing key reason</span><input name="note" minLength={5} required placeholder="Required" /></label><button className="btn secondary" type="submit">Report missing</button></form>}</div>}
            </article>;
          })}</div></details> : <p className="listing-meta">No key handovers recorded.</p>}
        </div>}
      </section>

      {transactions.length > 0 && <details className="card payment-activity-disclosure"><summary>Payment activity ({transactions.length})</summary><div className="stack">{transactions.map((transaction) => <article className="payment-activity-row" key={transaction.id}><div><strong>{transaction.status}</strong><span>{transaction.gatewayResponse}</span></div><div><strong>{formatNaira(transaction.amountMinor)}</strong><span>{transaction.paidAt ? new Date(transaction.paidAt).toLocaleString() : `Ref ${transaction.reference}`}</span></div></article>)}</div></details>}

      {canCancel && <details className="card booking-cancel-disclosure"><summary>Cancel this booking and release its accommodation</summary><p>Payment status remains separate from cancellation. If this booking has been paid, a refund must be processed separately.</p><form method="post" action={`/api/admin/bookings/${booking.id}`}><input type="hidden" name="intent" value="cancel" /><button className="btn secondary" type="submit">Cancel booking</button></form></details>}
    </div>
  );
}
