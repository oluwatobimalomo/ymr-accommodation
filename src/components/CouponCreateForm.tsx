"use client";

import { useMemo, useState } from "react";

type EventOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; eventId: string; lodgeName: string; name: string };

export function CouponCreateForm({ events, categories }: { events: EventOption[]; categories: CategoryOption[] }) {
  const [eventId, setEventId] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [scope, setScope] = useState<"ALL" | "SELECTED">("ALL");
  const eventCategories = useMemo(() => categories.filter((category) => category.eventId === eventId), [categories, eventId]);

  return <form method="post" action="/api/admin/coupons" className="coupon-create-form">
    <input type="hidden" name="intent" value="create" />
    <label className="field"><span>Event</span><select name="eventId" required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="" disabled>Select an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.currency})</option>)}</select></label>
    <label className="field"><span>Discount code</span><input name="code" required minLength={4} maxLength={32} pattern="[A-Za-z0-9]{4,32}" autoCapitalize="characters" autoComplete="off" placeholder="e.g. DIASPORA10" /><small className="field-hint">4–32 letters or numbers. Codes are case-insensitive.</small></label>
    <label className="field"><span>Discount type</span><select name="discountType" value={discountType} onChange={(event) => setDiscountType(event.target.value as "PERCENTAGE" | "FIXED")}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
    <label className="field"><span>{discountType === "PERCENTAGE" ? "Discount percentage" : "Discount amount (₦)"}</span><input name="discountValue" type="number" min={discountType === "PERCENTAGE" ? "1" : "0.01"} max={discountType === "PERCENTAGE" ? "90" : "21000000"} step={discountType === "PERCENTAGE" ? "1" : "0.01"} required placeholder={discountType === "PERCENTAGE" ? "10" : "5000"} /></label>
    {discountType === "PERCENTAGE" && <label className="field"><span>Maximum discount (₦) <small className="field-hint">Optional cap</small></span><input name="maxDiscountNaira" type="number" min="1" max="21000000" step="1" placeholder="No cap" /></label>}
    <label className="field"><span>Minimum eligible booking total (₦)</span><input name="minSubtotalNaira" type="number" min="0" max="21000000" step="1" required defaultValue="0" /></label>
    <label className="field"><span>Total successful uses</span><input name="maxRedemptions" type="number" min="1" max="10000" step="1" required placeholder="50" /></label>
    <label className="field"><span>Uses per attendee</span><input name="maxPerAttendee" type="number" min="1" max="10" step="1" required defaultValue="1" /></label>
    <label className="field"><span>Starts (WAT)</span><input name="startsAt" type="datetime-local" required /></label>
    <label className="field"><span>Expires (WAT)</span><input name="expiresAt" type="datetime-local" required /></label>
    <fieldset className="coupon-apartment-scope"><legend>Where the code applies</legend>
      <label><input type="radio" name="scope" value="ALL" checked={scope === "ALL"} onChange={() => setScope("ALL")} /> All apartments for this event</label>
      <label><input type="radio" name="scope" value="SELECTED" checked={scope === "SELECTED"} onChange={() => setScope("SELECTED")} disabled={!eventId || eventCategories.length === 0} /> Selected apartments</label>
      {scope === "SELECTED" && <div className="coupon-apartment-options">{eventCategories.length ? eventCategories.map((category) => <label key={category.id}><input type="checkbox" name="categoryId" value={category.id} /> <span>{category.lodgeName}<small>{category.name}</small></span></label>) : <p>Select an event with active apartments.</p>}</div>}
    </fieldset>
    <button className="btn coupon-create-submit" type="submit">Create discount code</button>
  </form>;
}
