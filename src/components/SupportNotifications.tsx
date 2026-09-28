"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface Snapshot {
  latest: { id: string; reference: string; createdAt: string } | null;
  openCount: number;
  staffAccess: {
    latest: { id: string; name: string; requestedRole: string; status: string; createdAt: string } | null;
    pendingCount: number;
  } | null;
}

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
  const [staffAccess, setStaffAccess] = useState<Snapshot["staffAccess"]>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [notice, setNotice] = useState("");
  const [panelPosition, setPanelPosition] = useState<CSSProperties | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const lastIds = useRef<{ support: string | null; staff: string | null } | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const audioUnlocked = useRef(false);
  const soundPending = useRef(false);

  useEffect(() => {
    let disposed = false;
    const AudioContextClass = window.AudioContext;
    const playPendingSound = (context: AudioContext) => {
      if (!audioUnlocked.current || !soundPending.current) return;
      if (context.state === "running") {
        soundPending.current = false;
        playDing(context);
      } else {
        void context.resume().then(() => {
          if (audioUnlocked.current && soundPending.current && context.state === "running") {
            soundPending.current = false;
            playDing(context);
          }
        }).catch(() => undefined);
      }
    };
    const unlockAudio = () => {
      const context = audio.current;
      if (!context) return;
      const markUnlocked = () => {
        if (context.state !== "running") return;
        audioUnlocked.current = true;
        window.removeEventListener("pointerdown", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
        playPendingSound(context);
      };
      if (context.state === "running") markUnlocked();
      else void context.resume().then(markUnlocked).catch(() => undefined);
    };
    if (AudioContextClass) {
      audio.current = new AudioContextClass();
      // Browsers require a user gesture before sound. Keep trying until a gesture
      // successfully unlocks the context; a rejected first attempt must not mute
      // every later notification for the rest of the session.
      window.addEventListener("pointerdown", unlockAudio);
      window.addEventListener("keydown", unlockAudio);
    }
    const acceptSnapshot = (snapshot: Snapshot) => {
      if (disposed) return;
      setHasError(false);
      setOpenCount(snapshot.openCount);
      setLatest(snapshot.latest);
      setStaffAccess(snapshot.staffAccess ?? null);
      const incomingIds = {
        support: snapshot.latest?.id ?? null,
        staff: snapshot.staffAccess?.latest?.id ?? null,
      };
      const previousIds = lastIds.current;
      if (!previousIds) {
        lastIds.current = incomingIds;
        return;
      }
      const newSupport = !!incomingIds.support && incomingIds.support !== previousIds.support;
      const newStaffRequest = !!incomingIds.staff && incomingIds.staff !== previousIds.staff;
      if (newSupport || newStaffRequest) {
        setNotice(newSupport
          ? `New support request ${snapshot.latest?.reference ?? "received"}`
          : `New staff access request from ${snapshot.staffAccess?.latest?.name ?? "staff member"}`);
        soundPending.current = true;
        if (audio.current) playPendingSound(audio.current);
      }
      lastIds.current = incomingIds;
    };
    const poll = async () => {
      try {
        const response = await fetch("/api/admin/support/notifications", { cache: "no-store" });
        if (!response.ok) throw new Error("Notification request failed");
        const snapshot = (await response.json()) as Snapshot;
        acceptSnapshot(snapshot);
      } catch {
        if (!disposed) setHasError(true);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 20000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      void audio.current?.close();
      audio.current = null;
      audioUnlocked.current = false;
      soundPending.current = false;
    };
  }, []);

  async function toggleNotifications() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setIsLoading(true);
      setHasError(false);
      try {
        const response = await fetch("/api/admin/support/notifications", { cache: "no-store" });
        if (!response.ok) throw new Error("Notification request failed");
        const snapshot = (await response.json()) as Snapshot;
        setLatest(snapshot.latest);
        setOpenCount(snapshot.openCount);
        setStaffAccess(snapshot.staffAccess ?? null);
      } catch {
        // Keep the panel available and show its retry guidance if the API is down.
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    }
  }

  const pendingStaffCount = staffAccess?.pendingCount ?? 0;
  const notificationCount = openCount + pendingStaffCount;

  function positionPanel() {
    const anchor = bellRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const gutter = 12;
    const width = Math.min(360, window.innerWidth - gutter * 2);
    let top = anchor.bottom + 12;
    const availableBelow = window.innerHeight - top - gutter;
    if (availableBelow < 220) {
      const panelHeight = Math.min(panelRef.current?.offsetHeight ?? 420, window.innerHeight - gutter * 2);
      top = Math.max(gutter, anchor.top - panelHeight - 12);
    }
    const left = Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter));
    setPanelPosition({ top, left, width, maxHeight: `calc(100dvh - ${top + gutter}px)` });
  }

  useEffect(() => {
    if (!isOpen) return;
    positionPanel();
    const reposition = () => positionPanel();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen, isLoading]);

  return (
    <div className="support-alerts">
      <button ref={bellRef} className="support-bell" type="button" aria-expanded={isOpen} aria-controls="support-notification-panel" aria-label={`Notifications, ${openCount} open support requests${pendingStaffCount ? `, ${pendingStaffCount} pending staff access requests` : ""}`} title="Notifications" onClick={() => void toggleNotifications()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {notificationCount > 0 && <span className="support-bell-count">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>
      {isOpen && panelPosition && typeof document !== "undefined" && createPortal(<section ref={panelRef} style={panelPosition} className="support-notification-panel" id="support-notification-panel" aria-label="Notifications">
        <div className="support-notification-heading"><strong>Notifications</strong><button type="button" onClick={() => setIsOpen(false)} aria-label="Close notifications">×</button></div>
        {isLoading ? <p>Checking for updates…</p> : hasError ? <p role="alert">Notifications couldn’t load. Close this panel and try again.</p> : latest ? <div className="support-notification-latest"><span className="eyebrow">Latest support request</span><strong>{latest.reference}</strong><small>{new Date(latest.createdAt).toLocaleString()}</small></div> : <p>No support requests yet.</p>}
        {staffAccess?.latest && <div className="support-notification-latest"><span className="eyebrow">Latest staff access request</span><strong>{staffAccess.latest.name}</strong><small>{staffAccess.latest.requestedRole.replace(/_/g, " ")} · {staffAccess.latest.status.toLowerCase()}</small></div>}
        {staffAccess && pendingStaffCount > 0 && <p>{pendingStaffCount} staff access request{pendingStaffCount === 1 ? "" : "s"} pending review.</p>}
        <Link href={latest ? `/admin/support/${latest.id}` : "/admin/support"} className="support-notification-link" onClick={() => setIsOpen(false)}>{latest ? "Open latest support request" : "Open support inbox"}<span aria-hidden="true">→</span></Link>
        {staffAccess && <Link href="/admin/staff" className="support-notification-all" onClick={() => setIsOpen(false)}>Review staff access</Link>}
        <Link href="/admin/support" className="support-notification-all" onClick={() => setIsOpen(false)}>View all support tickets</Link>
      </section>, document.body)}
      {notice && <span className="sr-only" role="status">{notice}</span>}
    </div>
  );
}
