"use client";

import { useEffect, useState } from "react";

const BAG_KEY = "ymr-accommodation-bag-v1";
type SavedItem = { name?: string; quantity?: number };

export function SavedBagNotice() {
  const [items, setItems] = useState<SavedItem[]>([]);
  useEffect(() => {
    const read = () => {
      try { setItems(JSON.parse(localStorage.getItem(BAG_KEY) ?? "[]") as SavedItem[]); }
      catch { setItems([]); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("ymr-bag-updated", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("ymr-bag-updated", read); };
  }, []);
  const count = items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
  if (!count) return null;
  return <aside className="saved-bag-notice" role="status"><strong>Your bag is saved · {count} item{count === 1 ? "" : "s"}</strong><span>{items.map((item) => `${item.name ?? "Accommodation"} × ${item.quantity ?? 1}`).join(" · ")}</span><small>Open any lodge to review your bag and continue checkout.</small></aside>;
}
