"use client";

import { formatNaira } from "@/lib/format-currency";
import { useState } from "react";

export interface TicketDownloadData {
  ticketId: string;
  guestName: string;
  lodgeName: string;
  apartmentName: string;
  amountMinor: number;
  paymentStatus: string;
  accommodationStatus: string;
  occupants: string[];
  checkInDate?: string;
  checkOutDate?: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
  isGift?: boolean;
  bookerEmail?: string;
  bookerPhone?: string;
  items?: Array<{ sequence: number; reference: string; lodgeName: string; apartmentName: string; amountMinor: number; checkInDate: string | null; checkOutDate: string | null; coordinatorName: string; coordinatorPhone: string; occupants: Array<{ name: string; gender: string; allocation: string }> }>;
}

function escapeXml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]!);
}

function wrap(value: string, max = 42) {
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

function dateLabel(value?: string) {
  if (!value) return "To be confirmed";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

function makeTicketSvg(ticket: TicketDownloadData) {
  const guests = ticket.occupants.length ? ticket.occupants : [ticket.guestName];
  const items = ticket.items ?? [];
  const guestRows = ticket.isGift ? guests.map((guest, index) => `<text x="104" y="${660 + index * 39}" font-size="22" fill="#243b34"><tspan fill="#b85709" font-weight="700">${String(index + 1).padStart(2, "0")}</tspan><tspan dx="22">${escapeXml(guest)}</tspan></text>`).join("") : "";
  const guestPanelBottom = ticket.isGift ? Math.max(760, 665 + guests.length * 39) : 610;
  const paymentLabels: Record<string, string> = { PAID: "Paid", PENDING: "Payment pending", FAILED: "Payment failed", REFUNDED: "Refunded", CANCELLED: "Cancelled" };
  const paymentLabel = paymentLabels[ticket.paymentStatus] ?? ticket.paymentStatus.replace(/_/g, " ");
  const stayLabel = ticket.accommodationStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const coordinatorBase = guestPanelBottom + 60;
  const itemRows = items.length ? items.map((item, index) => {
    const y = coordinatorBase + 42 + index * 112;
    const guestsForItem = item.occupants.map((guest) => `${guest.name}${guest.allocation ? ` · ${guest.allocation}` : ""}`).join(", ");
    return `<text x="100" y="${y}" font-size="15" font-weight="700" letter-spacing="2" fill="#b85709">ITEM ${index + 1}</text><text x="100" y="${y + 30}" font-size="23" font-weight="700" fill="#263b34">${escapeXml(item.apartmentName)} · ${escapeXml(item.lodgeName)}</text><text x="100" y="${y + 58}" font-size="18" fill="#52665b">${escapeXml(dateLabel(item.checkInDate ?? undefined))} – ${escapeXml(dateLabel(item.checkOutDate ?? undefined))} · ${escapeXml(guestsForItem || "Guest details pending")}</text><text x="1100" y="${y + 30}" text-anchor="end" font-size="22" font-weight="700" fill="#1e5b41">${escapeXml(formatNaira(item.amountMinor))}</text><text x="100" y="${y + 86}" font-size="16" fill="#52665b">Lodge Coordinator: ${escapeXml(item.coordinatorName || "Contact support")} | ${escapeXml(item.coordinatorPhone || "Support")}</text>`;
  }).join("") : "";
  const itemSectionHeight = items.length ? items.length * 112 + 22 : 0;
  const contactY = coordinatorBase + 42 + itemSectionHeight;
  const coordinatorInline = `Lodge Coordinator: ${ticket.coordinatorName?.trim() || "Contact support"} | ${ticket.coordinatorPhone?.trim() || "Support"}`;
  const coordinatorLines = items.length ? [] : wrap(coordinatorInline, 78);
  const coordinatorSvg = coordinatorLines.map((line, index) => `<text x="100" y="${contactY + index * 25}" font-size="19" fill="#263b34">${escapeXml(line)}</text>`).join("");
  const contactTop = contactY + coordinatorLines.length * 25 + 28;
  const contactLines = [ticket.guestName, ticket.bookerEmail, ticket.bookerPhone].filter(Boolean).flatMap((line) => wrap(line!, 72));
  const contactSvg = contactLines.map((line, index) => `<text x="100" y="${contactTop + index * 24}" font-size="18" fill="#263b34">${escapeXml(line)}</text>`).join("");
  const height = contactTop + contactLines.length * 24 + 45;
  const fields: [string, string, number, number][] = [
    ["BOOKED BY", ticket.guestName || "Guest", 100, 385],
    ["EMAIL / PHONE", [ticket.bookerEmail, ticket.bookerPhone].filter(Boolean).join(" · ") || "On file", 635, 385],
    ["CHECK-IN", dateLabel(ticket.checkInDate), 100, 475],
    ["CHECK-OUT", dateLabel(ticket.checkOutDate), 635, 475],
    ["PAYMENT", paymentLabel, 100, 565],
    ["STAY STATUS", stayLabel, 635, 565],
  ];
  const fieldSvg = fields.map(([label, value, x, y]) => `<text x="${x}" y="${y}" font-size="15" font-weight="700" letter-spacing="2" fill="#78847e">${escapeXml(label)}</text>${wrap(value, 34).map((line, index) => `<text x="${x}" y="${y + 31 + index * 27}" font-size="23" font-weight="600" fill="#263b34">${escapeXml(line)}</text>`).join("")}`).join("");
  const guestPanelSvg = ticket.isGift ? `<rect x="85" y="610" width="1030" height="${guestPanelBottom - 610}" rx="18" fill="#f5f8f6"/><text x="105" y="645" font-size="15" font-weight="700" letter-spacing="2" fill="#78847e">RECIPIENT DETAILS</text>${guestRows}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" font-family="Arial,sans-serif"><rect width="1200" height="100%" fill="#f4f7f5"/><rect x="40" y="40" width="1120" height="${height - 80}" rx="28" fill="#ffffff" stroke="#dfe7e2" stroke-width="2"/><path d="M68 42h1064" stroke="#17834d" stroke-width="8" stroke-linecap="round"/><text x="100" y="120" font-size="27" font-weight="700" fill="#173b37">YMR Accommodation</text><text x="100" y="153" font-size="15" letter-spacing="2" fill="#73817a">YOUNG MINISTERS RETREAT · BOOKING TICKET</text><rect x="980" y="87" width="120" height="40" rx="20" fill="#fff2e3"/><text x="1040" y="113" text-anchor="middle" font-size="17" font-weight="700" fill="#a9530d">${escapeXml(paymentLabel)}</text><text x="100" y="220" font-size="15" font-weight="700" letter-spacing="2" fill="#78847e">TICKET ID</text><text x="100" y="278" font-size="44" font-weight="700" letter-spacing="2" fill="#173b37">${escapeXml(ticket.ticketId)}</text><text x="1095" y="220" text-anchor="end" font-size="15" font-weight="700" letter-spacing="2" fill="#78847e">TOTAL AMOUNT</text><text x="1095" y="275" text-anchor="end" font-size="36" font-weight="700" fill="#1e5b41">${escapeXml(formatNaira(ticket.amountMinor))}</text><path d="M100 322h1000" stroke="#e4eae6" stroke-width="2"/>${fieldSvg}${guestPanelSvg}<path d="M100 ${guestPanelBottom + 25}h1000" stroke="#e4eae6" stroke-width="2"/><text x="100" y="${coordinatorBase}" font-size="15" font-weight="700" letter-spacing="2" fill="#a9530d">ACCOMMODATION BY LODGE</text>${itemRows}${coordinatorSvg}<text x="100" y="${contactTop - 12}" font-size="15" font-weight="700" letter-spacing="2" fill="#a9530d">BOOKER CONTACT</text>${contactSvg}</svg>`;
}

async function downloadTicketImage(ticket: TicketDownloadData) {
  const svgBlob = new Blob([makeTicketSvg(ticket)], { type: "image/svg+xml;charset=utf-8" });
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
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function TicketDownloadActions({ ticket }: { ticket: TicketDownloadData }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function saveImage() {
    setDownloading(true);
    setError("");
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
