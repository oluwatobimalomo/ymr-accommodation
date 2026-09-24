"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Snapshot { latest: { id: string; reference: string; createdAt: string } | null; openCount: number }

function playDing(context: AudioContext) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.11);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.13, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.44);
}

export function SupportNotifications() {
  const [openCount, setOpenCount] = useState(0);
  const [latest, setLatest] = useState<Snapshot["latest"]>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [notice, setNotice] = useState("");
  const lastId = useRef<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const isReady = useRef(false);

  useEffect(() => {
    let disposed = false;
    const AudioContextClass = window.AudioContext;
    const resumeAudio = () => {
      if (audio.current?.state === "suspended") void audio.current.resume().catch(() => undefined);
    };
    if (AudioContextClass) {
      audio.current = new AudioContextClass();
      // Browsers require a user gesture before playing audio. Start/resume silently
      // on the first ordinary interaction; there is no separate sound setting.
      window.addEventListener("pointerdown", resumeAudio, { once: true });
      window.addEventListener("keydown", resumeAudio, { once: true });
    }
    const poll = async () => {
      try {
        const response = await fetch("/api/admin/support/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = (await response.json()) as Snapshot;
        if (disposed) return;
        setOpenCount(snapshot.openCount);
        setLatest(snapshot.latest);
        const incomingId = snapshot.latest?.id ?? null;
        if (!isReady.current) {
          lastId.current = incomingId;
          isReady.current = true;
          return;
        }
        if (incomingId && incomingId !== lastId.current) {
          setNotice(`New support request ${snapshot.latest?.reference ?? "received"}`);
          if (audio.current?.state === "running") playDing(audio.current);
        }
        lastId.current = incomingId;
      } catch {
        // The admin UI remains usable if the alert endpoint is briefly offline.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 20000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", resumeAudio);
      window.removeEventListener("keydown", resumeAudio);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);

  async function toggleNotifications() {
    const next = !isOpen;
    setIsOpen(next);
    if (next && !latest) {
      setIsLoading(true);
      try {
        const response = await fetch("/api/admin/support/notifications", { cache: "no-store" });
        if (response.ok) {
          const snapshot = (await response.json()) as Snapshot;
          setLatest(snapshot.latest);
          setOpenCount(snapshot.openCount);
          setHasError(false);
        } else setHasError(true);
      } catch {
        // Keep the panel available and show its retry guidance if the API is down.
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    }
  }

  return (
    <div className="support-alerts">
      <button className="support-bell" type="button" aria-expanded={isOpen} aria-controls="support-notification-panel" aria-label={`Notifications, ${openCount} open support requests`} title="Notifications" onClick={() => void toggleNotifications()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {openCount > 0 && <span className="support-bell-count">{openCount > 99 ? "99+" : openCount}</span>}
      </button>
      {isOpen && <section className="support-notification-panel" id="support-notification-panel" aria-label="Support notifications">
        <div className="support-notification-heading"><strong>Notifications</strong><button type="button" onClick={() => setIsOpen(false)} aria-label="Close notifications">×</button></div>
        {isLoading ? <p>Checking for updates…</p> : hasError ? <p role="alert">Notifications couldn’t load. Close this panel and try again.</p> : latest ? <div className="support-notification-latest"><span className="eyebrow">Latest support request</span><strong>{latest.reference}</strong><small>{new Date(latest.createdAt).toLocaleString()}</small></div> : <p>No support requests yet.</p>}
        <Link href={latest ? `/admin/support/${latest.id}` : "/admin/support"} className="support-notification-link" onClick={() => setIsOpen(false)}>{latest ? "Open latest request" : "Open support inbox"}<span aria-hidden="true">→</span></Link>
        <Link href="/admin/support" className="support-notification-all" onClick={() => setIsOpen(false)}>View all support tickets</Link>
      </section>}
      {notice && <span className="sr-only" role="status">{notice}</span>}
    </div>
  );
}
