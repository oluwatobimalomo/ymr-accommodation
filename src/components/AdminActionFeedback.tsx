"use client";

import { useEffect, useState } from "react";

const successMessages: Record<string, string> = {
  "changes-saved": "Changes saved.",
  "record-created": "Record created.",
  "access-approved": "Access request approved.",
  "access-declined": "Access request declined.",
  "status-updated": "Status updated.",
  "photos-saved": "Photos saved.",
  "inventory-saved": "Inventory updated.",
  "facilities-saved": "Facilities saved.",
  "beds-saved": "Bed options saved.",
  "bedspaces-added": "Bedspaces added.",
  "room-added": "Room added.",
  "pricing-saved": "Pricing saved.",
  "capacity-saved": "Capacity saved.",
  "booking-cancelled": "Booking cancelled.",
  "guest-checked-in": "Guest checked in.",
  "guest-checked-out": "Guest checked out.",
  "guest-reallocated": "Guest reallocated.",
  "key-issued": "Key issued.",
  "key-returned": "Key return recorded.",
  "key-marked-missing": "Key marked as missing.",
  "reply-sent": "Reply sent.",
  "1": "Changes saved.",
  created: "Staff access saved.",
  "staff-access-saved": "Staff access saved.",
  "apartment-created": "Apartment saved and added to this lodge.",
};

/** Shared, accessible confirmation for successful admin form submissions. */
export function AdminActionFeedback() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const successKey = url.searchParams.get("saved")
      ?? url.searchParams.get("created")
      ?? url.searchParams.get("success")
      ?? "";
    const nextMessage = successMessages[successKey];
    if (!nextMessage) return;

    setMessage(nextMessage);
    url.searchParams.delete("saved");
    url.searchParams.delete("created");
    if (successKey === "apartment-created") url.searchParams.delete("success");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (!message) return null;

  return (
    <div className="admin-action-feedback" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={() => setMessage("")} aria-label="Dismiss confirmation">×</button>
    </div>
  );
}
