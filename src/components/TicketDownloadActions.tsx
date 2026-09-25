"use client";

import { formatNaira } from "@/lib/format-currency";
import { useState } from "react";

type TicketItem = {
  sequence: number; reference: string; lodgeName: string; apartmentName: string; amountMinor: number;
  checkInDate: string | null; checkOutDate: string | null; coordinatorName: string; coordinatorPhone: string;
  accommodationStatus?: string; actualCheckInAt?: string | null; actualCheckOutAt?: string | null;
  occupants: Array<{ name: string; gender: string; allocation: string }>;
};

export interface TicketDownloadData {
  ticketId: string; guestName: string; lodgeName: string; apartmentName: string; amountMinor: number;
  paymentStatus: string; accommodationStatus: string; occupants: string[]; checkInDate?: string; checkOutDate?: string;
  coordinatorName?: string; coordinatorPhone?: string; isGift?: boolean; bookerEmail?: string; bookerPhone?: string;
  actualCheckInAt?: string | null; actualCheckOutAt?: string | null; items?: TicketItem[];
}

function escapeXml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

function wrap(value: string, max = 56) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}

function dateLabel(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function dateTimeLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function itemStayLabel(item: TicketItem) {
  const actualIn = dateTimeLabel(item.actualCheckInAt);
  const actualOut = dateTimeLabel(item.actualCheckOutAt);
  if (actualIn && actualOut) return `Checked in ${actualIn} · Checked out ${actualOut}`;
  if (actualIn) return `Checked in ${actualIn}`;
  if (actualOut) return `Checked out ${actualOut}`;
  const expected = dateLabel(item.checkInDate);
  return expected ? `Expected check-in: ${expected}` : "";
}

function makeTicketSvg(ticket: TicketDownloadData, logo: string) {
  const items: TicketItem[] = ticket.items?.length ? ticket.items : [{
    sequence: 1, reference: ticket.ticketId, lodgeName: ticket.lodgeName, apartmentName: ticket.apartmentName,
    amountMinor: ticket.amountMinor, checkInDate: ticket.checkInDate ?? null, checkOutDate: ticket.checkOutDate ?? null,
    coordinatorName: ticket.coordinatorName ?? "", coordinatorPhone: ticket.coordinatorPhone ?? "",
    accommodationStatus: ticket.accommodationStatus, actualCheckInAt: ticket.actualCheckInAt, actualCheckOutAt: ticket.actualCheckOutAt,
    occupants: ticket.occupants.map((name) => ({ name, gender: "", allocation: "" })),
  }];
  const paymentLabels: Record<string, string> = { PAID: "Paid", PENDING: "Payment pending", FAILED: "Payment failed", REFUNDED: "Refunded", CANCELLED: "Cancelled" };
  const paymentLabel = paymentLabels[ticket.paymentStatus] ?? ticket.paymentStatus.replace(/_/g, " ");
  let y = 335;
  const summaryHeight = ticket.isGift ? 110 : 0;
  if (summaryHeight) y += summaryHeight;
  const itemSvg = items.map((item, index) => {
    const guests = item.occupants.map((occupant) => `${occupant.name}${occupant.allocation ? ` · ${occupant.allocation}` : ""}`).filter(Boolean).join(", ");
    const lines = [
      ...wrap(`${item.apartmentName} · ${item.lodgeName}`, 78),
      ...(guests ? wrap(guests, 84) : []),
      ...(itemStayLabel(item) ? wrap(itemStayLabel(item), 84) : []),
      ...wrap(`Lodge Coordinator: ${item.coordinatorName || "Contact support"} | ${item.coordinatorPhone || "Support"}`, 86),
    ];
    const rowHeight = Math.max(150, 78 + lines.length * 27);
    const start = y;
    const content = lines.map((line, lineIndex) => `<text x="112" y="${start + 78 + lineIndex * 27}" font-size="${lineIndex === 0 ? 22 : 17}" font-weight="${lineIndex === 0 ? 700 : 400}" fill="${lineIndex === 0 ? "#263b34" : "#52665b"}">${escapeXml(line)}</text>`).join("");
    const markup = `<rect x="84" y="${start}" width="1032" height="${rowHeight}" rx="18" fill="#ffffff" stroke="#e2e9e4" stroke-width="2"/><text x="112" y="${start + 37}" font-size="13" font-weight="700" letter-spacing="2" fill="#b85709">ACCOMMODATION ${index + 1}</text><text x="1080" y="${start + 39}" text-anchor="end" font-size="20" font-weight="700" fill="#1e5b41">${escapeXml(formatNaira(item.amountMinor))}</text>${content}`;
    y += rowHeight + 14;
    return markup;
  }).join("");
  const height = y + 74;
  const email = ticket.bookerEmail || "";
  const phone = ticket.bookerPhone || "";
  const bookerInfo = [email, phone].filter(Boolean).join(" · ");
  const recipientSummary = ticket.isGift ? `<rect x="84" y="340" width="1032" height="86" rx="16" fill="#f5f8f6"/><text x="108" y="373" font-size="13" font-weight="700" letter-spacing="2" fill="#78847e">GIFT RECIPIENT</text><text x="108" y="403" font-size="20" font-weight="600" fill="#263b34">${escapeXml(ticket.guestName)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" font-family="Arial,sans-serif"><rect width="1200" height="100%" fill="#f4f7f5"/><rect x="40" y="40" width="1120" height="${height - 80}" rx="28" fill="#fff" stroke="#dfe7e2" stroke-width="2"/><path d="M68 42h1064" stroke="#17834d" stroke-width="8" stroke-linecap="round"/><image href="${escapeXml(logo)}" x="96" y="82" width="46" height="60" preserveAspectRatio="xMidYMid meet"/><text x="158" y="112" font-size="27" font-weight="700" fill="#173b37">YMR Accommodation</text><text x="158" y="145" font-size="14" letter-spacing="2" fill="#73817a">YMR 2026 · CITY TAKERS · 10TH ANNIVERSARY</text><rect x="980" y="88" width="120" height="40" rx="20" fill="#fff2e3"/><text x="1040" y="114" text-anchor="middle" font-size="17" font-weight="700" fill="#a9530d">${escapeXml(paymentLabel)}</text><text x="100" y="210" font-size="14" font-weight="700" letter-spacing="2" fill="#78847e">BOOKING REFERENCE</text><text x="100" y="260" font-size="38" font-weight="700" letter-spacing="1" fill="#173b37">${escapeXml(ticket.ticketId)}</text><text x="1095" y="208" text-anchor="end" font-size="14" font-weight="700" letter-spacing="2" fill="#78847e">TOTAL PAID</text><text x="1095" y="255" text-anchor="end" font-size="32" font-weight="700" fill="#1e5b41">${escapeXml(formatNaira(ticket.amountMinor))}</text><path d="M100 294h1000" stroke="#e4eae6" stroke-width="2"/><text x="100" y="326" font-size="17" font-weight="700" fill="#263b34">Booked by ${escapeXml(ticket.guestName || "Guest")}</text>${bookerInfo ? `<text x="1095" y="326" text-anchor="end" font-size="15" fill="#52665b">${escapeXml(bookerInfo)}</text>` : ""}${recipientSummary}${itemSvg}<text x="100" y="${height - 48}" font-size="13" fill="#78847e">Keep this ticket ready when you arrive · YMR Accommodation</text></svg>`;
}

async function loadLogoDataUri() {
  const response = await fetch("/ymr-mark.png");
  if (!response.ok) throw new Error("The YMR logo could not be loaded.");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The YMR logo could not be loaded."));
    reader.onerror = () => reject(new Error("The YMR logo could not be loaded."));
    reader.readAsDataURL(blob);
  });
}

async function downloadTicketImage(ticket: TicketDownloadData) {
  const logo = await loadLogoDataUri();
  const svgBlob = new Blob([makeTicketSvg(ticket, logo)], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = svgUrl;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Ticket image could not be created.")); });
    const canvas = document.createElement("canvas");
    canvas.width = image.width * 2;
    canvas.height = image.height * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Ticket image could not be created.");
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Ticket image could not be saved.")), "image/png"));
    const pngUrl = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `${ticket.ticketId}-booking-ticket.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
  } finally { URL.revokeObjectURL(svgUrl); }
}

export function TicketDownloadActions({ ticket }: { ticket: TicketDownloadData }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  async function saveImage() {
    setDownloading(true); setError("");
    try { await downloadTicketImage(ticket); }
    catch { setError("We couldn’t create the image. Please try again or use Print / Save as PDF."); }
    finally { setDownloading(false); }
  }
  return <div className="ticket-download-actions ticket-screen-only">
    <button type="button" className="btn" onClick={() => window.print()}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" /></svg>Print / Save as PDF</button>
    <button type="button" className="btn secondary" onClick={() => void saveImage()} disabled={downloading}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>{downloading ? "Preparing image…" : "Download ticket image"}</button>
    {error && <span role="alert" className="ticket-download-error">{error}</span>}
  </div>;
}
