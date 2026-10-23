import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { requireActor } from "@/lib/auth/require";
import { can } from "@/lib/authz/authorize";
import { listCouponCategories, listCouponEvents, listCoupons } from "@/lib/coupons/coupons";
import { formatNaira } from "@/lib/format-currency";
import { CouponCreateForm } from "@/components/CouponCreateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discount codes" };

const formatDate = (date: Date) => new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
}).format(date);

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const actor = await requireActor();
  if (!can(actor, "coupon.manage")) notFound();
  const [{ error, saved }, [eventRows, categoryRows, couponRows]] = await Promise.all([searchParams, Promise.all([listCouponEvents(), listCouponCategories(), listCoupons()])]);

  return <div className="admin-page stack coupon-admin-page">
    <header className="admin-page-heading"><div><span className="eyebrow">Bookings · Promotions</span><h1>Discount codes</h1><p>Create event-specific attendee offers and monitor completed redemptions.</p></div></header>
    {error && <ErrorBanner error={error} />}
    {saved && <p className="alert coupon-saved" role="status">{saved === "code-created" ? "Discount code created." : "Discount code status updated."}</p>}
    <section className="card coupon-create-card">
      <div><span className="eyebrow">New offer</span><h2>Create a discount code</h2><p className="listing-meta">Set the code, offer, apartment scope, usage limits and validity period. You can pause or reactivate it at any time.</p></div>
      {eventRows.length ? <CouponCreateForm events={eventRows} categories={categoryRows} /> : <p className="empty-state">Create an event before generating discount codes.</p>}
    </section>
    <section className="card coupon-directory">
      <div className="admin-section-heading"><div><span className="eyebrow">Campaign control</span><h2>All codes</h2></div><span className="staff-count-badge">{couponRows.length} codes</span></div>
      {couponRows.length ? <div className="table-scroll"><table className="data-table coupon-table"><thead><tr><th>Code</th><th>Event</th><th>Offer</th><th>Apartments</th><th>Use count</th><th>Validity</th><th>Status</th><th>Action</th></tr></thead><tbody>{couponRows.map(({ coupon, eventName, redemptionCount, categoryNames }) => {
        const ended = coupon.expiresAt <= new Date();
        const full = redemptionCount >= coupon.maxRedemptions;
        const displayStatus = ended ? "Expired" : full ? "Fully used" : coupon.status === "ACTIVE" ? "Active" : "Paused";
        return <tr key={coupon.id}>
          <td data-label="Code"><strong className="coupon-code">{coupon.code}</strong></td>
          <td data-label="Event">{eventName}</td>
          <td data-label="Offer">{coupon.discountType === "PERCENTAGE" ? `${coupon.discountPercent}%${coupon.maxDiscountMinor !== null ? ` · max ${formatNaira(coupon.maxDiscountMinor)}` : ""}` : formatNaira(coupon.fixedDiscountMinor ?? 0)}<small>Min. {formatNaira(coupon.minSubtotalMinor)} · {coupon.maxPerAttendee} per attendee</small></td>
          <td data-label="Apartments">{categoryNames.length ? categoryNames.join(", ") : "All event apartments"}</td>
          <td data-label="Use count">{redemptionCount} / {coupon.maxRedemptions}</td>
          <td data-label="Validity">{formatDate(coupon.startsAt)}<small>to {formatDate(coupon.expiresAt)}</small></td>
          <td data-label="Status"><span className={`status-pill ${displayStatus === "Active" ? "is-success" : ""}`}>{displayStatus}</span></td>
          <td data-label="Action">{!ended && !full && <form method="post" action="/api/admin/coupons"><input type="hidden" name="intent" value="status"/><input type="hidden" name="couponId" value={coupon.id}/><input type="hidden" name="status" value={coupon.status === "ACTIVE" ? "PAUSED" : "ACTIVE"}/><button className="btn secondary" type="submit">{coupon.status === "ACTIVE" ? "Pause" : "Reactivate"}</button></form>}</td>
        </tr>;
      })}</tbody></table></div> : <p className="empty-state">No discount codes yet.</p>}
    </section>
  </div>;
}
