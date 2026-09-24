"use client";

import { useState } from "react";
import { ImageUploadInput } from "@/components/ImageUploadInput";
import { ApartmentStayDates } from "@/components/ApartmentStayDates";

interface Facility {
  id: string;
  name: string;
}

interface Props {
  lodgeId: string;
  facilities: Facility[];
  action: string;
  defaultCheckInDate?: string | null;
  defaultCheckOutDate?: string | null;
}

const BED_SPECIFICATIONS = ["6x6", "4x6", "Single Bed", "Double Bed", "Bunk Bed"];

export function ApartmentForm({ lodgeId, facilities, action, defaultCheckInDate, defaultCheckOutDate }: Props) {
  const [mode, setMode] = useState<"PRIVATE" | "SHARED">("PRIVATE");

  return (
    <form method="post" action={action} encType="multipart/form-data" className="stack apartment-form">
      <input type="hidden" name="lodgeId" value={lodgeId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="field">
        <label htmlFor="name">Apartment name</label>
        <input id="name" name="name" required placeholder="Chalet A" />
      </div>

      <ApartmentStayDates checkInDate={defaultCheckInDate} checkOutDate={defaultCheckOutDate} />

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
            <label htmlFor="priceNaira">Total apartment price for this stay (₦)</label>
            <input id="priceNaira" name="priceNaira" type="number" min="0" step="0.01" required />
          </div>
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
            <label htmlFor="bedspaceCount">Number of bedspaces per room</label>
            <input id="bedspaceCount" name="bedspaceCount" type="number" min="1" required defaultValue={4} />
          </div>
          <div className="field">
            <label htmlFor="roomCount">Number of rooms</label>
            <input id="roomCount" name="roomCount" type="number" min="1" defaultValue={1} />
            <p className="listing-meta" style={{ margin: 0 }}>
              For a single dormitory hall, leave this at 1. For many small identical rooms (e.g. 190 rooms of 4), set the
              count here and they&rsquo;ll all be created together under this one listing.
            </p>
          </div>
          <div className="field">
            <label htmlFor="priceNaira-shared">Total price per bedspace for this stay (₦)</label>
            <input id="priceNaira-shared" name="priceNaira" type="number" min="0" step="0.01" required />
          </div>
        </>
      )}

      {facilities.length > 0 && (
        <fieldset className="checkbox-field">
          <legend>Facilities</legend>
          <div className="checkbox-grid">
            {facilities.filter((f) => !["air conditioning", "bed"].includes(f.name.trim().toLowerCase())).map((f) => (
              <label className="checkbox-option" key={f.id}>
                <input type="checkbox" name="facilityIds" value={f.id} />
                <span>{f.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="checkbox-field">
        <legend>Bed specifications</legend>
        <p className="listing-meta">Choose every bed type or size available in this apartment.</p>
        <div className="checkbox-grid">
          {BED_SPECIFICATIONS.map((specification) => (
            <label className="checkbox-option" key={specification}>
              <input type="checkbox" name="bedSpecifications" value={specification} />
              <span>{specification}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="images">Photos</label>
        <ImageUploadInput id="images" />
      </div>

      <button className="btn" type="submit">
        Save apartment
      </button>
    </form>
  );
}
