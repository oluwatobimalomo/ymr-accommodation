import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmailAttachment } from "@/db/schema/email-outbox";

export interface BookingEmailItem {
  lodgeId: string;
  lodgeName: string;
  lodgeAddress: string;
  lodgeImage?: string | null;
  apartmentName: string;
  reference: string;
  allocationLabels: string[];
  checkIn: string | null;
  checkOut: string | null;
  coordinatorName: string;
  coordinatorPhone: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function publicOrigin() {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    try {
      const url = new URL(configured.startsWith("http") ? configured : `https://${configured}`);
      if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return url.origin;
    } catch { /* Use the production fallback below. */ }
  }
  return "https://accommodation.trustlock.site";
}

export async function bookingEmailMessage(input: {
  recipientName: string;
  bookerName: string;
  reference: string;
  amount: string;
  items: BookingEmailItem[];
  gift: boolean;
}) {
  const origin = publicOrigin();
  const checkBookingUrl = `${origin}/check-booking`;
  const subject = input.gift ? `YMR Reservation Gift from ${input.bookerName}` : "Your YMR accommodation booking is confirmed";
  const heading = input.gift ? `${input.bookerName} sent you an accommodation gift` : "Your accommodation booking is complete";
  const plainItems = input.items.map((item, index) => [
    `${index + 1}. ${item.apartmentName} — ${item.lodgeName}`,
    `Address: ${item.lodgeAddress || "Please contact the lodge coordinator for directions."}`,
    item.reference ? `Ticket: ${item.reference}` : "",
    item.allocationLabels.length ? `Spaces: ${item.allocationLabels.join(", ")}` : "",
    item.checkIn ? `Expected check-in: ${item.checkIn}` : "",
    item.checkOut ? `Expected check-out: ${item.checkOut}` : "",
    item.coordinatorName || item.coordinatorPhone ? `Coordinator: ${[item.coordinatorName, item.coordinatorPhone].filter(Boolean).join(" | ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
  const text = `Hello ${input.recipientName},\n\n${heading}.\n\nYour accommodation booking for YMR 2026 themed City Takers is completed. This marks the 10th Anniversary of YMR and we can't wait to give you the best hospitality experience during this annual retreat.\n\nBooking reference: ${input.reference}\nTotal paid: ${input.amount}\n\n${plainItems}\n\nKeep this email for check-in. To view or download your ticket, visit Check Booking: ${checkBookingUrl}\n\nSee you at YMR 2026 where we will emerge as City Takers.\n\nRegards,\nYMR Accommodation`;
  const attachments: EmailAttachment[] = [];
  const logo = await readFile(join(process.cwd(), "public", "ymr-mark.png"));
  attachments.push({ filename: "ymr-mark.png", content: logo.toString("base64"), content_type: "image/png", content_id: "ymr-logo" });
  const imageSources = input.items.map((item, index) => {
    const source = item.lodgeImage ?? "";
    const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (match) {
      const contentId = `lodge-${index}`;
      const mimeType = match[1]!;
      attachments.push({ filename: `lodge-${index}.${mimeType.split("/")[1]!.replace("jpeg", "jpg")}`, content: match[2]!, content_type: mimeType, content_id: contentId });
      return `cid:${contentId}`;
    }
    return source.startsWith("https://") ? source : `${origin}/api/public/lodges/${encodeURIComponent(item.lodgeId)}/image`;
  });
  const rows = input.items.map((item, index) => {
    const imageUrl = imageSources[index]!;
    const address = item.lodgeAddress || "Please contact the lodge coordinator for directions.";
    const coordinator = [item.coordinatorName, item.coordinatorPhone].filter(Boolean).join(" | ") || "Contact support";
    return `<tr><td class="email-item" style="padding:16px 0;border-top:1px solid #e7ece9"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td class="email-photo-cell" width="160" valign="top" style="padding-right:18px"><img class="email-photo" src="${escapeHtml(imageUrl)}" width="144" height="112" alt="${escapeHtml(item.lodgeName)}" style="display:block;width:144px;height:112px;object-fit:cover;border-radius:10px;background:#f2f5f3"></td><td valign="top" style="font-size:14px;line-height:1.55;color:#43554c"><div style="font-size:11px;letter-spacing:1.5px;font-weight:700;color:#bd5b0a;text-transform:uppercase">Accommodation ${index + 1}</div><div class="email-title" style="font-size:18px;line-height:1.3;font-weight:700;color:#173b37;margin:4px 0 8px">${escapeHtml(item.apartmentName)}</div><div><strong style="color:#253a32">Lodge:</strong> ${escapeHtml(item.lodgeName)}</div><div class="email-address"><strong style="color:#253a32">Address:</strong> ${escapeHtml(address)}</div><div><strong style="color:#253a32">Coordinator:</strong> ${escapeHtml(coordinator)}</div>${item.reference ? `<div style="margin-top:5px;color:#64736b;font-size:12px">Ticket ${escapeHtml(item.reference)}</div>` : ""}${item.allocationLabels.length ? `<div style="color:#64736b;font-size:12px">Spaces: ${escapeHtml(item.allocationLabels.join(", "))}</div>` : ""}${item.checkIn ? `<div style="color:#64736b;font-size:12px">Expected check-in: ${escapeHtml(item.checkIn)}</div>` : ""}</td></tr></table></td></tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:520px){.email-outer{padding:8px 4px!important}.email-card{border-radius:10px!important}.email-pad{padding-left:16px!important;padding-right:16px!important}.email-photo-cell{width:88px!important;padding-right:10px!important}.email-photo{width:78px!important;height:80px!important}.email-title{font-size:16px!important}.email-address{font-size:12px!important;line-height:1.4!important}.email-heading{font-size:24px!important}.email-ref td{padding:10px!important}}</style></head><body style="margin:0;padding:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#202923"><table class="email-outer" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4;padding:28px 12px"><tr><td align="center"><table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#fff;border:1px solid #e1e8e3;border-radius:18px;overflow:hidden"><tr><td style="height:7px;background:#17834d;font-size:0">&nbsp;</td></tr><tr><td class="email-pad" style="padding:24px 32px 18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58" valign="middle"><img src="cid:ymr-logo" width="42" height="54" alt="YMR logo" style="display:block;object-fit:contain"></td><td valign="middle"><div style="font-size:17px;font-weight:700;color:#173b37">YMR Accommodation</div><div style="font-size:10px;letter-spacing:1.5px;color:#77847d;margin-top:4px">2026 · CITY TAKERS</div></td><td align="right" valign="middle"><span style="display:inline-block;padding:8px 13px;background:#fff2e3;border-radius:18px;color:#a9530d;font-size:12px;font-weight:700">PAID</span></td></tr></table></td></tr><tr><td class="email-pad" style="padding:18px 32px 26px;background:#f1f7f3"><div style="font-size:11px;letter-spacing:2px;color:#bd5b0a;font-weight:700;text-transform:uppercase">YMR ACCOMMODATION · 2026</div><h1 class="email-heading" style="font-size:29px;line-height:1.15;color:#173b37;margin:12px 0">${escapeHtml(heading)}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 12px">Hello ${escapeHtml(input.recipientName)},</p><p style="font-size:15px;line-height:1.65;color:#4e5f56;margin:0">Your accommodation booking for <strong>YMR 2026 themed City Takers</strong> is completed. This marks the <strong>10th Anniversary of YMR</strong>, and we can't wait to give you the best hospitality experience during this annual retreat.</p></td></tr><tr><td class="email-pad" style="padding:22px 32px 8px"><table class="email-ref" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8f6;border:1px solid #e6ece8;border-radius:12px"><tr><td style="padding:14px 16px"><div style="font-size:10px;letter-spacing:1.5px;color:#77847d;font-weight:700">BOOKING REFERENCE</div><div style="font-size:18px;font-weight:700;color:#173b37;margin-top:5px">${escapeHtml(input.reference)}</div></td><td align="right" style="padding:14px 16px"><div style="font-size:10px;letter-spacing:1.5px;color:#77847d;font-weight:700">TOTAL PAID</div><div style="font-size:18px;font-weight:700;color:#1e5b41;margin-top:5px">${escapeHtml(input.amount)}</div></td></tr></table></td></tr><tr><td class="email-pad" style="padding:16px 32px 4px"><h2 style="font-size:17px;color:#173b37;margin:0 0 4px">Your accommodation</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${rows}</table></td></tr><tr><td class="email-pad" style="padding:22px 32px 28px"><p style="font-size:14px;line-height:1.6;color:#4e5f56;margin:0 0 18px">Keep this email for check-in. To view or download your ticket, visit <a href="${escapeHtml(checkBookingUrl)}" style="color:#bd5b0a;font-weight:700">Check Booking</a>.</p><p style="font-size:15px;line-height:1.6;color:#173b37;margin:0 0 22px">See you at YMR 2026 where we will emerge as <strong>City Takers</strong>.</p><div style="border-top:1px solid #e7ece9;padding-top:18px;color:#53645a;font-size:14px">Regards,<div style="font-family:'Brush Script MT','Segoe Script',cursive;font-size:25px;font-weight:700;color:#173b37;margin-top:5px">YMR Accommodation</div></div></td></tr><tr><td style="background:#173b37;padding:14px 32px;color:#c5d1ca;font-size:11px;text-align:center">© 2026 YMR Global · City Takers</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, attachments };
}
