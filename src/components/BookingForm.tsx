"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bedspace } from "./Bedspace";
import { formatNaira } from "@/lib/format-currency";

interface BedspaceData {
  id: string;
  letter: string;
  status: "AVAILABLE" | "HELD" | "OCCUPIED" | "BLOCKED" | "MAINTENANCE" | "RETIRED";
}
interface RoomData {
  id: string;
  name: string;
  genderRestriction: "ANY" | "MALE" | "FEMALE";
  bedspaces: BedspaceData[];
}
interface Props {
  categoryId: string;
  mode: "PRIVATE" | "SHARED";
  pricingModel: "PER_UNIT" | "PER_PERSON";
  priceMinor: number;
  customerSelectsBedspace: boolean;
  customerSelectsRoom: boolean;
  allowEntireRoomBooking: boolean;
  rooms: RoomData[];
  action: string;
}

interface OccupantDraft {
  bedspaceId?: string;
  roomLabel?: string;
}

export function BookingForm({
  categoryId,
  mode,
  pricingModel,
  priceMinor,
  customerSelectsBedspace,
  customerSelectsRoom,
  allowEntireRoomBooking,
  rooms,
  action,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<OccupantDraft[]>([]);
  const [entireRoomId, setEntireRoomId] = useState<string | null>(null);
  const [autoCount, setAutoCount] = useState(1);
  const [isGiftBooking, setIsGiftBooking] = useState(false);
  const [bookerName, setBookerName] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [bookerEmail, setBookerEmail] = useState("");
  const [bookerGender, setBookerGender] = useState<"MALE" | "FEMALE" | "">("");
  // Only relevant when there's more than one room: which room the customer
  // is currently looking at. A single-room apartment skips this entirely
  // and behaves exactly as before. This is what keeps the page usable for
  // an apartment with many rooms (e.g. 190) - only one room's grid ever
  // renders at once, instead of rendering all of them unconditionally.
  const [viewingRoomId, setViewingRoomId] = useState<string | null>(rooms.length === 1 ? rooms[0]!.id : null);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomPage, setRoomPage] = useState(1);

  // Refresh derived availability while this tab is visible. A slightly
  // slower cadence avoids repeated full server renders in dormant tabs.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [router]);

  // If a different customer takes a bedspace that this visitor selected,
  // remove it from their draft instead of leaving a stale selected tile.
  useEffect(() => {
    const availableIds = new Set(
      rooms.flatMap((room) => room.bedspaces.filter((bedspace) => bedspace.status === "AVAILABLE").map((bedspace) => bedspace.id)),
    );
    setSelected((prev) => prev.filter((slot) => !slot.bedspaceId || availableIds.has(slot.bedspaceId)));
    setEntireRoomId((prev) => {
      if (!prev) return null;
      const room = rooms.find((candidate) => candidate.id === prev);
      return room && room.bedspaces.length > 0 && room.bedspaces.every((bedspace) => bedspace.status === "AVAILABLE") ? prev : null;
    });
  }, [rooms]);

  const usesBedspacePicker = mode === "SHARED" && customerSelectsBedspace;
  const usesAutoCount = mode === "SHARED" && !customerSelectsBedspace;
  // A private listing is already the accommodation the guest selected. The
  // underlying unit is allocated automatically, so there is no second picker.
  const needsRoomPicker = usesBedspacePicker && rooms.length > 1;

  const occupantSlots: OccupantDraft[] = usesBedspacePicker ? selected : Array.from({ length: autoCount }, () => ({}));

  function toggleBedspace(roomName: string, bedspace: BedspaceData) {
    if (entireRoomId) return; // entire-room mode replaces individual picking
    setSelected((prev) => {
      const exists = prev.find((p) => p.bedspaceId === bedspace.id);
      if (exists) return prev.filter((p) => p.bedspaceId !== bedspace.id);
      return [...prev, { bedspaceId: bedspace.id, roomLabel: roomName }];
    });
  }

  function toggleEntireRoom(room: RoomData) {
    if (entireRoomId === room.id) {
      setEntireRoomId(null);
      setSelected([]);
      return;
    }
    setEntireRoomId(room.id);
    setSelected(room.bedspaces.map((b) => ({ bedspaceId: b.id, roomLabel: room.name })));
  }

  const canSubmit = usesBedspacePicker ? occupantSlots.length > 0 : autoCount > 0;
  const viewingRoom = rooms.find((r) => r.id === viewingRoomId);
  const matchingRooms = rooms.filter((room) => room.name.toLocaleLowerCase().includes(roomSearch.trim().toLocaleLowerCase()));
  const roomPageCount = Math.max(1, Math.ceil(matchingRooms.length / 12));
  const visibleRooms = matchingRooms.slice((roomPage - 1) * 12, roomPage * 12);
  const totalMinor = pricingModel === "PER_PERSON" ? priceMinor * occupantSlots.length : priceMinor;

  return (
    <form method="post" action={action} className="stack">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="occupantCount" value={occupantSlots.length} />
      {entireRoomId && <input type="hidden" name="entireRoomId" value={entireRoomId} />}

      {usesBedspacePicker && needsRoomPicker && !viewingRoom && (
        <div className="stack">
          <div className="room-picker-heading"><div><h2>Choose a room</h2><p>{rooms.length} rooms. Search by room name, then choose one to see its bedspaces.</p></div><span>{matchingRooms.length} shown</span></div>
          <label className="room-search"><span className="sr-only">Search rooms</span><input type="search" value={roomSearch} onChange={(event) => { setRoomSearch(event.target.value); setRoomPage(1); }} placeholder="Search rooms…" /></label>
          {matchingRooms.length === 0 ? <p className="empty-state">No rooms match “{roomSearch}”. Try another name.</p> : <div className="grid accommodation-listing-grid room-picker-grid">
            {visibleRooms.map((room) => {
              const availableCount = room.bedspaces.filter((b) => b.status === "AVAILABLE").length;
              return (
                <button
                  type="button"
                  key={room.id}
                  className="listing-card"
                  style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                  onClick={() => setViewingRoomId(room.id)}
                >
                  <div className="listing-body">
                    <h3>{room.name}</h3>
                    <p className="listing-meta">
                      {availableCount} of {room.bedspaces.length} available
                    </p>
                  </div>
                </button>
              );
            })}
          </div>}
          {matchingRooms.length > 0 && <nav className="room-pagination" aria-label="Room pages"><span>Showing {(roomPage - 1) * 12 + 1}–{Math.min(roomPage * 12, matchingRooms.length)} of {matchingRooms.length}</span><div><button type="button" className="btn secondary" disabled={roomPage <= 1} onClick={() => setRoomPage((page) => page - 1)}>Previous</button><button type="button" className="btn secondary" disabled={roomPage >= roomPageCount} onClick={() => setRoomPage((page) => page + 1)}>Next</button></div></nav>}
        </div>
      )}

      {usesBedspacePicker && viewingRoom && (
        <div className="stack">
          <h2>Choose your bedspace{occupantSlots.length !== 1 ? "(s)" : ""}</h2>
          <p>Select one bedspace per person. Selected spaces turn into occupant fields below.</p>
          {needsRoomPicker && (
            <button type="button" className="btn secondary" onClick={() => setViewingRoomId(null)} style={{ alignSelf: "flex-start" }}>
              &larr; Choose a different room
            </button>
          )}
          {(() => {
            const room = viewingRoom;
            const allFree = room.bedspaces.every((b) => b.status === "AVAILABLE");
            return (
              <div className="card stack">
                <h3>{room.name}</h3>
                <div className="bed-row">
                  {room.bedspaces.map((b) => {
                    const isSelected = b.status === "AVAILABLE" && selected.some((s) => s.bedspaceId === b.id);
                    const state = isSelected ? "selected" : b.status === "AVAILABLE" ? "available" : b.status.toLowerCase();
                    return (
                      <Bedspace
                        key={b.id}
                        letter={b.letter}
                        state={state as "available" | "selected" | "occupied" | "held" | "blocked" | "maintenance"}
                        roomName={room.name}
                        onSelect={
                          b.status === "AVAILABLE" && !entireRoomId ? () => toggleBedspace(room.name, b) : undefined
                        }
                      />
                    );
                  })}
                </div>
                {allowEntireRoomBooking && allFree && room.bedspaces.length > 0 && (
                  <button type="button" className="btn secondary" onClick={() => toggleEntireRoom(room)}>
                    {entireRoomId === room.id ? "Cancel entire-room booking" : `Book entire room (${room.bedspaces.length} spaces)`}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {usesAutoCount && (
        <div className="field" style={{ maxWidth: "200px" }}>
          <label htmlFor="autoCount">Number of people</label>
          <input
            id="autoCount"
            type="number"
            min={1}
            max={20}
            value={autoCount}
            onChange={(e) => setAutoCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}

      {occupantSlots.length > 0 && (
        <div className="card stack booking-details-card">
          <h2>Your details</h2>
          <div className="field">
            <label htmlFor="bookerName">Full name</label>
            <input id="bookerName" name="bookerName" required autoComplete="name" value={bookerName} onChange={(event) => setBookerName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bookerPhone">Phone</label>
            <input id="bookerPhone" name="bookerPhone" type="tel" required autoComplete="tel" value={bookerPhone} onChange={(event) => setBookerPhone(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bookerEmail">Email</label>
            <input id="bookerEmail" name="bookerEmail" type="email" required autoComplete="email" value={bookerEmail} onChange={(event) => setBookerEmail(event.target.value)} />
          </div>
          <label className="gift-booking-toggle"><input type="checkbox" checked={isGiftBooking} onChange={(event) => setIsGiftBooking(event.target.checked)} /> <span><strong>Gift this to someone</strong><small>Enter their details so their reservation ticket can be sent to them.</small></span></label>
          {mode === "SHARED" && !isGiftBooking && occupantSlots.length === 1 && <div className="field"><label htmlFor="bookerGender">Your gender</label><select id="bookerGender" required value={bookerGender} onChange={(event) => setBookerGender(event.target.value as "MALE" | "FEMALE" | "")}><option value="" disabled>Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></div>}
        </div>
      )}

      {occupantSlots.length > 0 && (isGiftBooking || occupantSlots.length > 1) && (
        <div className="stack">
          <h2>Occupant details</h2>
          {occupantSlots.map((slot, i) => (
            <div key={slot.bedspaceId ?? i} className="card stack booking-details-card">
              <h3>{isGiftBooking ? "Recipient" : `Occupant ${i + 1}`}{slot.roomLabel ? ` — ${slot.roomLabel}` : ""}</h3>
              {slot.bedspaceId && <input type="hidden" name={`occupant_bedspace_${i}`} value={slot.bedspaceId} />}
              <div className="field"><label htmlFor={`occupant_name_${i}`}>{isGiftBooking ? "Recipient name" : "Full name"}</label><input id={`occupant_name_${i}`} name={`occupant_name_${i}`} required autoComplete="name" /></div>
              {mode === "SHARED" ? <div className="field"><label htmlFor={`occupant_gender_${i}`}>Gender</label><select id={`occupant_gender_${i}`} name={`occupant_gender_${i}`} required defaultValue=""><option value="" disabled>Select</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></div> : <input type="hidden" name={`occupant_gender_${i}`} value="UNSPECIFIED" />}
              <div className="field"><label htmlFor={`occupant_phone_${i}`}>{isGiftBooking ? "Recipient phone number" : "Phone"}</label><input id={`occupant_phone_${i}`} name={`occupant_phone_${i}`} type="tel" autoComplete="tel" required={isGiftBooking} /></div>
              <div className="field"><label htmlFor={`occupant_email_${i}`}>{isGiftBooking ? "Recipient email" : "Email"}</label><input id={`occupant_email_${i}`} name={`occupant_email_${i}`} type="email" autoComplete="email" required={isGiftBooking} /></div>
            </div>
          ))}
        </div>
      )}

      {occupantSlots.length === 1 && !isGiftBooking && <><input type="hidden" name="occupant_name_0" value={bookerName} /><input type="hidden" name="occupant_gender_0" value={mode === "SHARED" ? bookerGender : "UNSPECIFIED"} /><input type="hidden" name="occupant_phone_0" value={bookerPhone} /><input type="hidden" name="occupant_email_0" value={bookerEmail} /></>}

      <div className="booking-total" aria-live="polite">
        <span><strong>{occupantSlots.length ? (pricingModel === "PER_PERSON" ? "Estimated total" : "Accommodation total") : "Your total"}</strong><small>{occupantSlots.length ? (pricingModel === "PER_PERSON" ? `${occupantSlots.length} guest${occupantSlots.length === 1 ? "" : "s"} × ${formatNaira(priceMinor)} per person` : "For this accommodation") : "Select bedspaces to calculate your total."}</small></span>
        <strong>{occupantSlots.length ? formatNaira(totalMinor) : "—"}</strong>
      </div>

      <button className="btn" type="submit" disabled={!canSubmit}>
        Review and reserve
      </button>
    </form>
  );
}
