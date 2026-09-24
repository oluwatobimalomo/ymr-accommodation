"use client";

import { useState } from "react";

interface Facility { id: string; name: string; }

export function ApartmentAmenitiesForm({ action, facilities, initialFacilityIds, initialOverviewIds }: { action: string; facilities: Facility[]; initialFacilityIds: string[]; initialOverviewIds: string[] }) {
  const [selected, setSelected] = useState(initialFacilityIds);
  const [overview, setOverview] = useState(initialOverviewIds);
  return <form method="post" action={action} className="stack">
    <input type="hidden" name="intent" value="facilities" />
    {facilities.filter((facility) => !["air conditioning", "bed"].includes(facility.name.trim().toLowerCase())).map((facility) => <div key={facility.id} className="amenity-admin-row">
      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
        <input type="checkbox" name="facilityIds" value={facility.id} checked={selected.includes(facility.id)} onChange={(event) => { setSelected((current) => event.target.checked ? [...current, facility.id] : current.filter((id) => id !== facility.id)); if (!event.target.checked) setOverview((current) => current.filter((id) => id !== facility.id)); }} />
        {facility.name}
      </label>
      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
        <input type="checkbox" name="overviewFacilityIds" value={facility.id} checked={overview.includes(facility.id)} disabled={!selected.includes(facility.id)} onChange={(event) => setOverview((current) => event.target.checked ? [...current, facility.id] : current.filter((id) => id !== facility.id))} />
        Show in overview
      </label>
    </div>)}
    <p className="listing-meta">Choose which selected amenities appear on the apartment card.</p>
    <button className="btn secondary" type="submit">Save amenities</button>
  </form>;
}
