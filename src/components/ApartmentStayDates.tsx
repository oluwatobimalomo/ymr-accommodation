"use client";

import { useState } from "react";

export function ApartmentStayDates({ checkInDate: initialCheckIn, checkOutDate }: { checkInDate?: string | null; checkOutDate?: string | null }) {
  const [checkInDate, setCheckInDate] = useState(initialCheckIn ?? "");
  return (
    <div className="apartment-stay-dates">
      <div className="field">
        <label htmlFor="checkInDate">Expected check-in</label>
        <input id="checkInDate" name="checkInDate" type="date" required value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="checkOutDate">Expected check-out</label>
        <input id="checkOutDate" name="checkOutDate" type="date" required min={checkInDate || undefined} defaultValue={checkOutDate ?? ""} />
      </div>
    </div>
  );
}
