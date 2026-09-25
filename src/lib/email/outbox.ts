import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { emailOutbox } from "@/db/schema";

const MAX_ATTEMPTS = 5;

export async function processPendingEmails(limit = 20) {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.EMAIL_FROM;
  if (!apiKey || !configuredFrom) return { sent: 0, queued: true };
  const address = configuredFrom.match(/<([^<>]+)>/)?.[1] ?? configuredFrom;
  const from = `YMR 2026 Accommodation <${address.trim()}>`;

  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const now = new Date();
    const rows = await tx.select().from(emailOutbox)
      .where(and(or(eq(emailOutbox.status, "PENDING"), eq(emailOutbox.status, "SENDING")), lte(emailOutbox.nextAttemptAt, now), sql`${emailOutbox.attempts} < ${MAX_ATTEMPTS}`))
      .orderBy(asc(emailOutbox.createdAt)).limit(limit).for("update", { skipLocked: true });
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    await tx.update(emailOutbox).set({ status: "SENDING", attempts: sql`${emailOutbox.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + 10 * 60 * 1000) }).where(inArray(emailOutbox.id, ids));
    return rows.map((row) => ({ ...row, attempts: row.attempts + 1 }));
  });

  let sent = 0;
  for (const message of claimed) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [message.recipientEmail], subject: message.subject, text: message.textBody, html: message.htmlBody, attachments: message.attachments }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
      await db.update(emailOutbox).set({ status: "SENT", sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, message.id));
      sent += 1;
    } catch (error) {
      const failed = message.attempts >= MAX_ATTEMPTS;
      const delayMinutes = Math.min(60, 2 ** message.attempts);
      await db.update(emailOutbox).set({ status: failed ? "FAILED" : "PENDING", lastError: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.", nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000) }).where(eq(emailOutbox.id, message.id));
      console.error(`Email outbox delivery failed for ${message.dedupeKey}:`, error);
    }
  }
  return { sent, queued: false };
}
