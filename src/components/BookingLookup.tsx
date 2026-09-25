"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatNaira } from "@/lib/format-currency";
import { TicketDownloadActions } from "@/components/TicketDownloadActions";

interface Ticket {
  ticketId: string;
  isGift: boolean;
  guestName: string;
  lodgeName: string;
  apartmentName: string;
  amountMinor: number;
  paymentStatus: string;
  accommodationStatus: string;
  createdAt: string;
  occupants: string[];
  coordinatorName: string;
  coordinatorPhone: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  bookerEmail: string;
  bookerPhone: string;
  items: NonNullable<import("@/components/TicketDownloadActions").TicketDownloadData["items"]>;
}

const paymentText: Record<string, string> = { PENDING: "Payment pending", PAID: "Paid", FAILED: "Payment failed", REFUNDED: "Refunded", CANCELLED: "Cancelled" };
const stayText: Record<string, string> = { UNALLOCATED: "Awaiting allocation", ALLOCATED: "Allocated", CHECKED_IN: "Checked in", CHECKED_OUT: "Checked out", CANCELLED: "Cancelled" };

function BookingTicket({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const firstName = ticket.guestName.split(" ")[0];
  const isPaid = ticket.paymentStatus === "PAID";
  const title = isPaid ? `Your booking is confirmed, ${firstName}.` : ticket.paymentStatus === "PENDING" ? "Your reservation is on hold." : "Your booking details";
  const firstItem = ticket.items[0];
  const actualCheckIn = firstItem?.actualCheckInAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(firstItem.actualCheckInAt)) : "";
  const actualCheckOut = firstItem?.actualCheckOutAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(firstItem.actualCheckOutAt)) : "";
  return (
    <div className="ticket-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="booking-ticket" role="dialog" aria-modal="true" aria-labelledby="ticket-heading">
        <button className="ticket-close ticket-screen-only" type="button" aria-label="Close ticket" onClick={onClose}>×</button>
        <div className="ticket-brand"><img src="/ymr-mark.png" alt="" /><span><strong>YMR Accommodation</strong><small>Young Ministers Retreat · 2026</small></span><span className={`ticket-status${isPaid ? "" : ticket.paymentStatus === "PENDING" ? " is-pending" : " is-attention"}`}>{paymentText[ticket.paymentStatus] ?? ticket.paymentStatus}</span></div>
        <div className="ticket-title-row"><div><span className="eyebrow">Booking ticket</span><h2 id="ticket-heading">{title}</h2></div><span className={`ticket-check${isPaid ? "" : " is-pending"}`} aria-hidden="true">{isPaid ? "✓" : "•"}</span></div>
        <div className="ticket-reference"><span>Ticket ID</span><strong>{ticket.ticketId}</strong></div>
        <div className="ticket-details">
          <div><span>Property</span><strong>{ticket.lodgeName}</strong></div>
          {ticket.apartmentName && <div><span>Apartment</span><strong>{ticket.apartmentName}</strong></div>}
          {ticket.isGift && <div><span>Recipient</span><strong>{ticket.occupants.join(", ") || ticket.guestName}</strong></div>}
          <div><span>Stay status</span><strong>{stayText[ticket.accommodationStatus] ?? ticket.accommodationStatus}</strong></div>
          {actualCheckIn ? <div><span>Checked in</span><strong>{actualCheckIn}</strong></div> : ticket.checkInDate ? <div><span>Expected Check-in</span><strong>{new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(new Date(`${ticket.checkInDate}T12:00:00`))}</strong></div> : null}
          {actualCheckOut && <div><span>Checked out</span><strong>{actualCheckOut}</strong></div>}
          <div><span>Booking date</span><strong>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(ticket.createdAt))}</strong></div>
          <div><span>Amount</span><strong>{formatNaira(ticket.amountMinor)}</strong></div>
        </div>
        {ticket.isGift && <div className="ticket-occupants"><span>Recipient details</span><ul>{ticket.occupants.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul></div>}
        <div className="ticket-booker-details"><span className="ticket-label">Booked by</span><strong>{ticket.guestName}</strong><span>{ticket.bookerEmail}</span><span>{ticket.bookerPhone}</span></div>
        {ticket.items.length > 1 ? <section className="ticket-order-items"><h3>Booking details by lodge</h3>{ticket.items.map((item) => { const checkedIn = item.actualCheckInAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.actualCheckInAt)) : ""; const checkedOut = item.actualCheckOutAt ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.actualCheckOutAt)) : ""; return <article className="ticket-order-item" key={item.reference}><span className="ticket-label">Item {item.sequence}</span><h3>{item.apartmentName}</h3><p><strong>{item.lodgeName}</strong>{checkedIn ? ` · Checked in ${checkedIn}` : item.checkInDate ? ` · Expected Check-in: ${item.checkInDate}` : ""}{checkedOut ? ` · Checked out ${checkedOut}` : ""}</p><ul>{item.occupants.map((guest, index) => <li key={`${guest.name}-${index}`}>{guest.name}{guest.allocation ? ` · ${guest.allocation}` : ""}</li>)}</ul><strong>{formatNaira(item.amountMinor)}</strong><div className="ticket-coordinator"><span className="ticket-label">Lodge Coordinator:</span><strong>{item.coordinatorName || "Contact support"}</strong><span>|</span>{item.coordinatorPhone ? <a href={`tel:${item.coordinatorPhone}`}>{item.coordinatorPhone}</a> : <a href="/support">Support</a>}</div></article>; })}</section> : <div className="ticket-coordinator"><span className="ticket-label">Lodge Coordinator:</span><strong>{ticket.coordinatorName || "Contact support"}</strong><span>|</span>{ticket.coordinatorPhone ? <a href={`tel:${ticket.coordinatorPhone}`}>{ticket.coordinatorPhone}</a> : <a href="/support">Support</a>}</div>}
        <div className="ticket-footer"><span>Keep this ticket handy when you arrive.</span><TicketDownloadActions ticket={{ ticketId: ticket.ticketId, guestName: ticket.guestName, bookerEmail: ticket.bookerEmail, bookerPhone: ticket.bookerPhone, lodgeName: ticket.lodgeName, apartmentName: ticket.apartmentName, amountMinor: ticket.amountMinor, paymentStatus: ticket.paymentStatus, accommodationStatus: ticket.accommodationStatus, occupants: ticket.occupants, isGift: ticket.isGift, checkInDate: ticket.checkInDate ?? undefined, checkOutDate: ticket.checkOutDate ?? undefined, actualCheckInAt: firstItem?.actualCheckInAt, actualCheckOutAt: firstItem?.actualCheckOutAt, coordinatorName: ticket.coordinatorName, coordinatorPhone: ticket.coordinatorPhone, items: ticket.items }} /></div>
      </section>
    </div>
  );
}

export function BookingLookup() {
  const [ticketId, setTicketId] = useState("");
  const [phone, setPhone] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticket) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setTicket(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ticket]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/booking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, phone }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn’t find that booking.");
      setTicket(data as Ticket);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t check that booking right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="booking-lookup-page">
      <div className="booking-lookup-intro"><span className="eyebrow">Your stay, in one place</span><h1>Find your booking</h1><p>Enter the Ticket ID and phone number used when you booked. We&rsquo;ll bring up your ticket.</p></div>
      <form className="booking-lookup-form" onSubmit={submit}>
        <label className="field"><span>Ticket ID</span><input value={ticketId} onChange={(event) => setTicketId(event.target.value)} required placeholder="YMR26-WH-569402CF" autoComplete="off" /></label>
        <label className="field"><span>Phone number used to book</span><input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" required placeholder="e.g. 080… or +234…" autoComplete="tel" /></label>
        {error && <div className="alert" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={loading}>{loading ? "Finding your ticket…" : "Find my ticket"}</button>
        <p className="lookup-privacy">Your details are used only to find the matching booking.</p>
      </form>
      {ticket && <BookingTicket ticket={ticket} onClose={() => setTicket(null)} />}
    </div>
  );
}
