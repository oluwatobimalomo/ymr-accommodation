"use client";

import { useEffect } from "react";

export function ClearBagOnSuccess() {
  useEffect(() => {
    try { localStorage.removeItem("ymr-accommodation-bag-v1"); } catch { /* Storage may be disabled in the browser. */ }
  }, []);
  return null;
}
