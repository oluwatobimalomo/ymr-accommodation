"use client";

import { useId, useState } from "react";

type LodgeOption = { id: string; name: string; status?: string };

export function LodgeMultiSelect({ lodges, name = "lodgeIds", selected = [] }: { lodges: LodgeOption[]; name?: string; selected?: string[] }) {
  const [value, setValue] = useState(() => new Set(selected));
  const id = useId();
  function toggle(lodgeId: string) {
    setValue((current) => {
      const next = new Set(current);
      if (next.has(lodgeId)) next.delete(lodgeId);
      else next.add(lodgeId);
      return next;
    });
  }
  return <div className="lodge-multi-select" role="group" aria-labelledby={`${id}-label`}>
    <span id={`${id}-label`} className="lodge-multi-select-label">{value.size ? `${value.size} lodge${value.size === 1 ? "" : "s"} selected` : "Select one or more lodges"}</span>
    {lodges.length ? <div className="lodge-choice-list">{lodges.map((lodge) => {
      const active = value.has(lodge.id);
      return <button key={lodge.id} type="button" className={`lodge-choice${active ? " is-selected" : ""}`} aria-pressed={active} onClick={() => toggle(lodge.id)}>
        <span className="lodge-choice-indicator" aria-hidden="true">{active ? "✓" : "+"}</span>
        <span>{lodge.name}{lodge.status && lodge.status !== "ACTIVE" ? " · archived" : ""}</span>
      </button>;
    })}</div> : <p className="lodge-multi-select-empty">No lodges are available yet.</p>}
    {[...value].map((lodgeId) => <input key={lodgeId} type="hidden" name={name} value={lodgeId} />)}
  </div>;
}
