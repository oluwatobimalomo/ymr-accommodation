"use client";

import { useState } from "react";
import { Bedspace, BEDSPACE_STATES, type BedspaceState } from "./Bedspace";

/** Preview only: shows how selection toggles while the other states stay fixed. */
export function BedspaceDemo() {
  const [picked, setPicked] = useState(false);
  return (
    <div className="bed-row">
      {BEDSPACE_STATES.map((s, i) => {
        const letter = String.fromCharCode(65 + i);
        const state: BedspaceState = s === "selected" || s === "available" ? (picked ? "selected" : "available") : s;
        const toggles = s === "selected" || s === "available";
        return (
          <Bedspace
            key={s}
            letter={letter}
            state={state}
            roomName="Room 1"
            onSelect={toggles ? () => setPicked((p) => !p) : undefined}
          />
        );
      })}
    </div>
  );
}
