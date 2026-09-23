"use client";

export type BedspaceState =
  | "available"
  | "selected"
  | "occupied"
  | "held"
  | "blocked"
  | "maintenance";

const LABEL: Record<BedspaceState, string> = {
  available: "Available",
  selected: "Selected",
  occupied: "Occupied",
  held: "Held",
  blocked: "Blocked",
  maintenance: "Maintenance",
};

/** Each state has its own icon AND text, so meaning never depends on color alone. */
function Icon({ state }: { state: BedspaceState }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (state) {
    case "available":
      return <svg {...common}><circle cx="8" cy="8" r="5.5" /></svg>;
    case "selected":
      return <svg {...common}><path d="M3 8.5l3.5 3.5L13 4.5" /></svg>;
    case "occupied":
      return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case "held":
      return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5l2 1" /></svg>;
    case "blocked":
      return <svg {...common}><circle cx="8" cy="8" r="5.5" /><path d="M4 12L12 4" /></svg>;
    case "maintenance":
      return <svg {...common}><path d="M9.5 3a3.5 3.5 0 00-3.2 4.9L3 11.2 4.8 13l3.3-3.3A3.5 3.5 0 109.5 3z" /></svg>;
  }
}

interface Props {
  letter: string;
  state: BedspaceState;
  roomName?: string;
  onSelect?: () => void;
}

export function Bedspace({ letter, state, roomName, onSelect }: Props) {
  const interactive = state === "available" || state === "selected";
  const label = `${roomName ? roomName + ", " : ""}Bedspace ${letter}, ${LABEL[state]}`;
  const inner = (
    <>
      <span className="letter">{letter}</span>
      <span className="state">
        <Icon state={state} />
        {LABEL[state]}
      </span>
    </>
  );
  if (!interactive || !onSelect) {
    return (
      <div className="bed" data-state={state} role="img" aria-label={label}>
        {inner}
      </div>
    );
  }
  return (
    <button type="button" className="bed" data-state={state} aria-pressed={state === "selected"} aria-label={label} onClick={onSelect}>
      {inner}
    </button>
  );
}

export const BEDSPACE_STATES = Object.keys(LABEL) as BedspaceState[];
