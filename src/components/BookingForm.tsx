"use client";

import { useState } from "react";
import { Bedspace } from "./Bedspace";
import { ImageThumb } from "./ImageThumb";

interface BedspaceData {
  id: string;
  letter: string;
  status: "AVAILABLE" | "BLOCKED" | "MAINTENANCE" | "RETIRED";
}
interface RoomData {
  id: string;
  name: string;
  genderRestriction: "ANY" | "MALE" | "FEMALE";
  bedspaces: BedspaceData[];
}
interface UnitData {
  id: string;
  name: string;
  capacity: number;
  imageUrl?: string;
}

interface Props {
  categoryId: string;
  mode: "PRIVATE" | "SHARED";
  customerSelectsBedspace: boolean;
  customerSelectsRoom: boolean;
  allowEntireRoomBooking: boolean;
  rooms: RoomData[];
  units: UnitData[];
  action: string;
}

interface OccupantDraft {
  bedspaceId?: string;
  roomLabel?: string;
}

export function BookingForm({
  categoryId,
  mode,
  customerSelectsBedspace,
  customerSelectsRoom,
  allowEntireRoomBooking,
  rooms,
  units,
  action,
}: Props) {
  const [selected, setSelected] = useState<OccupantDraft[]>([]);
  const [entireRoomId, setEntireRoomId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(units[0]?.id ?? null);
  const [autoCount, setAutoCount] = useState(1);
  // Only relevant when there's more than one room: which room the customer
  // is currently looking at. A single-room apartment skips this entirely
  // and behaves exactly as before. This is what keeps the page usable for
  // an apartment with many rooms (e.g. 190) - only one room's grid ever
  // renders at once, instead of rendering all of them unconditionally.
  const [viewingRoomId, setViewingRoomId] = useState<string | null>(rooms.length === 1 ? rooms[0]!.id : null);

  const usesBedspacePicker = mode === "SHARED" && customerSelectsBedspace;
  const usesAutoCount = (mode === "SHARED" && !customerSelectsBedspace) || (mode === "PRIVATE" && !customerSelectsRoom);
  const usesUnitPicker = mode === "PRIVATE" && customerSelectsRoom;
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

  const canSubmit = usesBedspacePicker ? occupantSlots.length > 0 : usesUnitPicker ? !!selectedUnitId : autoCount > 0;
  const viewingRoom = rooms.find((r) => r.id === viewingRoomId);

  return (
    <form method="post" action={action} className="stack">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="occupantCount" value={occupantSlots.length} />
      {entireRoomId && <input type="hidden" name="entireRoomId" value={entireRoomId} />}
      {usesUnitPicker && selectedUnitId && <input type="hidden" name="unitId" value={selectedUnitId} />}

      {usesBedspacePicker && needsRoomPicker && !viewingRoom && (
        <div className="stack">
          <h2>Choose a room</h2>
          <p>{rooms.length} rooms available. Pick one to see its bedspaces.</p>
          <div className="grid">
            {rooms.map((room) => {
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
          </div>
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
                    const isSelected = selected.some((s) => s.bedspaceId === b.id);
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

      {usesUnitPicker && (
        <div className="stack">
          <h2>Choose a unit</h2>
          <div className="grid">
            {units.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => setSelectedUnitId(u.id)}
                className="listing-card"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: selectedUnitId === u.id ? "var(--color-brand)" : undefined,
                  borderWidth: selectedUnitId === u.id ? "2px" : undefined,
                  font: "inherit",
                }}
              >
                <ImageThumb src={u.imageUrl} alt={u.name} />
                <div className="listing-body">
                  <h3>{u.name}</h3>
                  <p className="listing-meta">Sleeps up to {u.capacity}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(usesAutoCount || usesUnitPicker) && (
        <div className="field" style={{ maxWidth: "200px" }}>
          <label htmlFor="autoCount">Number of people</label>
          <input
            id="autoCount"
            type="number"
            min={1}
            max={usesUnitPicker ? units.find((u) => u.id === selectedUnitId)?.capacity ?? 20 : 20}
            value={autoCount}
            onChange={(e) => setAutoCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      )}

      {occupantSlots.length > 0 && (
        <div className="stack">
          <h2>Occupant details</h2>
          {occupantSlots.map((slot, i) => (
            <div key={slot.bedspaceId ?? i} className="card stack">
              <h3>
                Occupant {i + 1}
                {slot.roomLabel ? ` — ${slot.roomLabel}` : ""}
              </h3>
              {slot.bedspaceId && <input type="hidden" name={`occupant_bedspace_${i}`} value={slot.bedspaceId} />}
              <div className="field">
                <label htmlFor={`occupant_name_${i}`}>Full name</label>
                <input id={`occupant_name_${i}`} name={`occupant_name_${i}`} required autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor={`occupant_gender_${i}`}>Gender</label>
                <select id={`occupant_gender_${i}`} name={`occupant_gender_${i}`} required defaultValue="">
                  <option value="" disabled>
                    Select
                  </option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`occupant_phone_${i}`}>Phone</label>
                <input id={`occupant_phone_${i}`} name={`occupant_phone_${i}`} type="tel" autoComplete="tel" />
              </div>
              <div className="field">
                <label htmlFor={`occupant_email_${i}`}>Email</label>
                <input id={`occupant_email_${i}`} name={`occupant_email_${i}`} type="email" autoComplete="email" />
              </div>
            </div>
          ))}
        </div>
      )}

      {occupantSlots.length > 0 && (
        <div className="card stack">
          <h2>Your details</h2>
          <div className="field">
            <label htmlFor="bookerName">Full name</label>
            <input id="bookerName" name="bookerName" required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="bookerPhone">Phone</label>
            <input id="bookerPhone" name="bookerPhone" type="tel" required autoComplete="tel" />
          </div>
          <div className="field">
            <label htmlFor="bookerEmail">Email</label>
            <input id="bookerEmail" name="bookerEmail" type="email" required autoComplete="email" />
          </div>
        </div>
      )}

      <button className="btn" type="submit" disabled={!canSubmit}>
        Review and reserve
      </button>
    </form>
  );
}
