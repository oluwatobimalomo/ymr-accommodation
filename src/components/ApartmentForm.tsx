"use client";

import { useState } from "react";

interface Facility {
  id: string;
  name: string;
}

interface Props {
  lodgeId: string;
  facilities: Facility[];
  action: string;
}

export function ApartmentForm({ lodgeId, facilities, action }: Props) {
  const [mode, setMode] = useState<"PRIVATE" | "SHARED">("PRIVATE");

  return (
    <form method="post" action={action} encType="multipart/form-data" className="stack">
      <input type="hidden" name="lodgeId" value={lodgeId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="field">
        <label htmlFor="name">Apartment name</label>
        <input id="name" name="name" required placeholder="Chalet A" />
      </div>

      <div className="field">
        <label htmlFor="mode-select">Mode</label>
        <select id="mode-select" value={mode} onChange={(e) => setMode(e.target.value as "PRIVATE" | "SHARED")}>
          <option value="PRIVATE">Private</option>
          <option value="SHARED">Shared</option>
        </select>
      </div>

      {mode === "PRIVATE" ? (
        <>
          <div className="field">
            <label htmlFor="priceNaira">Price</label>
            <input id="priceNaira" name="priceNaira" type="number" min="0" step="0.01" required />
          </div>
          {facilities.length > 0 && (
            <div className="field">
              <label>Amenities</label>
              {facilities.map((f) => (
                <label key={f.id} style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" name="facilityIds" value={f.id} />
                  {f.name}
                </label>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="genderRestriction">Gender</label>
            <select id="genderRestriction" name="genderRestriction" defaultValue="ANY">
              <option value="ANY">Any</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="bedspaceCount">Number of bedspaces</label>
            <input id="bedspaceCount" name="bedspaceCount" type="number" min="1" required defaultValue={4} />
          </div>
          <div className="field">
            <label htmlFor="priceNaira-shared">Price per bedspace</label>
            <input id="priceNaira-shared" name="priceNaira" type="number" min="0" step="0.01" required />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="images">Photos</label>
        <input id="images" name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple />
      </div>

      <button className="btn" type="submit">
        Save apartment
      </button>
    </form>
  );
}
