import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookingOrders, bookings, inventoryHolds, paymentTransactions, privateUnitAllocations, supportTicketMessages, supportTickets } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import type { VerifyTransactionResult } from "./paystack";

/**
 * Writes a support ticket using the CALLER'S transaction, not a new one.
 * createTicket() in src/lib/support/tickets.ts opens its own transaction,
 * which cannot be called from inside another transaction on the same
 * connection without deadlocking - this inlines the same two inserts
 * against the passed-in `tx` instead.
 */
async function createTicketInTx(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    bookingId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    category: "PAYMENT" | "ALLOCATION";
    subject: string;
    description: string;
  },
) {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const reference = `TKT-${Date.now().toString(36).toUpperCase()}-${suffix}`;
  const [ticket] = await tx
    .insert(supportTickets)
    .values({
      reference,
      bookingId: input.bookingId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      category: input.category,
      subject: input.subject,
      description: input.description,
    })
    .returning();
  await tx.insert(supportTicketMessages).values({
    ticketId: ticket!.id,
    authorLabel: "System",
    isStaff: true,
    body: input.description,
  });
}

export interface ConfirmPaymentOutcome {
  status: "confirmed" | "already_confirmed" | "amount_mismatch" | "booking_not_found" | "not_successful" | "needs_manual_review";
}

/**
 * The single idempotent confirmation path called from BOTH the webhook and
 * the browser-callback verification (see the research notes this app was
 * built from) — both routes must converge here so a booking is never
 * double-fulfilled no matter which one fires first, or if both do.
 *
 * This function trusts nothing from the caller except a Paystack-verified
 * result (never a raw webhook payload or an unverified browser redirect);
 * amount and currency are re-checked here against the booking's own
 * expected values before anything is marked paid.
 */
export async function confirmPaymentFromVerifiedResult(verified: VerifyTransactionResult): Promise<ConfirmPaymentOutcome> {
  if (verified.status !== "success") return { status: "not_successful" };

  const db = getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(bookingOrders).where(eq(bookingOrders.reference, verified.reference)).for("update").limit(1);
    if (order) return confirmOrderPayment(tx, order, verified);

    // Callback and webhook confirmation serialize on this one booking row.
    // The second process sees the committed state after it obtains the lock.
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.reference, verified.reference))
      .for("update")
      .limit(1);
    if (!booking) return { status: "booking_not_found" };

    const [existingTransaction] = await tx
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.paystackTransactionId, verified.paystackTransactionId))
      .limit(1);
    if (existingTransaction) {
      if (existingTransaction.bookingId !== booking.id) {
        throw new Error("Paystack transaction is already associated with a different booking.");
      }
      return { status: existingTransaction.status === "AMOUNT_MISMATCH" ? "amount_mismatch" : "already_confirmed" };
    }

    // Idempotent: a second webhook delivery, or the callback firing after
    // the webhook already landed, must be a safe no-op, not a re-charge.
    if (booking.paymentStatus === "PAID") return { status: "already_confirmed" };

    // Compare against requestedAmountMinor, NOT amountMinor: if the Paystack
    // account is configured so the customer bears the transaction fee,
    // amountMinor is the fee-inclusive gross total actually collected, which
    // will legitimately differ from what the booking asked for by a variable
    // fee amount. requestedAmountMinor is what we actually asked Paystack
    // for at initialize time, and is what must match the booking exactly.
    if (verified.requestedAmountMinor !== booking.amountMinor || verified.currency !== booking.currency) {
      await tx.insert(paymentTransactions).values({
        bookingId: booking.id,
        reference: verified.reference,
        paystackTransactionId: verified.paystackTransactionId,
        amountMinor: verified.amountMinor,
        currency: verified.currency,
        status: "AMOUNT_MISMATCH",
        gatewayResponse: verified.gatewayResponse,
        rawPayload: verified.raw,
      });
      await createTicketInTx(tx, {
        bookingId: booking.id,
        customerName: booking.bookerName,
        customerEmail: booking.bookerEmail,
        customerPhone: booking.bookerPhone,
        category: "PAYMENT",
        subject: `Amount mismatch on ${booking.reference}`,
        description: `Paystack reported ${verified.amountMinor} ${verified.currency}, but the booking expects ${booking.amountMinor} ${booking.currency}. This needs manual review before confirming payment.`,
      });
      await recordAudit(tx, {
        actor: null,
        action: "payment.amount_mismatch",
        entityType: "booking",
        entityId: booking.id,
        before: { paymentStatus: booking.paymentStatus },
        after: { outcome: "amount_mismatch", expected: booking.amountMinor, requested: verified.requestedAmountMinor, received: verified.amountMinor, currency: verified.currency },
      });
      return { status: "amount_mismatch" };
    }

    if (booking.paymentStatus === "CANCELLED") {
      // Money arrived after the hold expired and the bedspace may already
      // belong to someone else. Do not silently re-claim it — flag for a
      // human. See README: this is a documented, deliberately simple
      // handling of a rare edge case rather than automated reallocation.
      await tx.insert(paymentTransactions).values({
        bookingId: booking.id,
        reference: verified.reference,
        paystackTransactionId: verified.paystackTransactionId,
        amountMinor: verified.amountMinor,
        currency: verified.currency,
        status: "SUCCESS",
        gatewayResponse: verified.gatewayResponse,
        paidAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
        rawPayload: verified.raw,
      });
      await tx.update(bookings).set({ paymentStatus: "PAID", allocationStatus: "NOT_ALLOCATED", updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await createTicketInTx(tx, {
        bookingId: booking.id,
        customerName: booking.bookerName,
        customerEmail: booking.bookerEmail,
        customerPhone: booking.bookerPhone,
        category: "ALLOCATION",
        subject: `Payment received after hold expired: ${booking.reference}`,
        description: "Payment succeeded after this booking's temporary hold had already expired and its inventory was released. The customer has paid — please manually reallocate accommodation for them or process a refund.",
      });
      await recordAudit(tx, {
        actor: null,
        action: "payment.confirmed_needs_reallocation",
        entityType: "booking",
        entityId: booking.id,
        before: { paymentStatus: booking.paymentStatus, accommodationStatus: booking.accommodationStatus },
        after: { paymentStatus: "PAID", accommodationStatus: booking.accommodationStatus, allocationStatus: "NOT_ALLOCATED", outcome: "needs_manual_review" },
      });
      return { status: "needs_manual_review" };
    }

    await tx.insert(paymentTransactions).values({
      bookingId: booking.id,
      reference: verified.reference,
      paystackTransactionId: verified.paystackTransactionId,
      amountMinor: verified.amountMinor,
      currency: verified.currency,
      status: "SUCCESS",
      gatewayResponse: verified.gatewayResponse,
      paidAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
      rawPayload: verified.raw,
    });
    await tx
      .update(bookings)
      .set({ paymentStatus: "PAID", accommodationStatus: "ALLOCATED", allocationStatus: "FULLY_ALLOCATED", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));
    // The hold's job (protecting the bedspace until payment) is done; the
    // permanent record is booking_occupants, so the hold row is no longer needed.
    await tx.delete(inventoryHolds).where(eq(inventoryHolds.bookingId, booking.id));

    await recordAudit(tx, {
      actor: null,
      action: "payment.confirmed",
      entityType: "booking",
      entityId: booking.id,
      before: { paymentStatus: booking.paymentStatus, accommodationStatus: booking.accommodationStatus },
      after: { paymentStatus: "PAID", accommodationStatus: "ALLOCATED", allocationStatus: "FULLY_ALLOCATED", reference: verified.reference },
    });
    return { status: "confirmed" };
  });
}

async function confirmOrderPayment(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  order: typeof bookingOrders.$inferSelect,
  verified: VerifyTransactionResult,
): Promise<ConfirmPaymentOutcome> {
  const orderBookings = await tx.select().from(bookings).where(eq(bookings.checkoutOrderId, order.id)).orderBy(bookings.createdAt);
  const primary = orderBookings[0];
  if (!primary) return { status: "booking_not_found" };

  const [existingTransaction] = await tx.select().from(paymentTransactions)
    .where(eq(paymentTransactions.paystackTransactionId, verified.paystackTransactionId)).limit(1);
  if (existingTransaction) {
    if (existingTransaction.checkoutOrderId !== order.id) throw new Error("Paystack transaction is already associated with a different checkout.");
    return { status: existingTransaction.status === "AMOUNT_MISMATCH" ? "amount_mismatch" : "already_confirmed" };
  }
  if (order.paymentStatus === "PAID") return { status: "already_confirmed" };

  if (verified.requestedAmountMinor !== order.amountMinor || verified.currency !== order.currency) {
    await tx.insert(paymentTransactions).values({
      bookingId: primary.id, checkoutOrderId: order.id, reference: verified.reference,
      paystackTransactionId: verified.paystackTransactionId, amountMinor: verified.amountMinor,
      currency: verified.currency, status: "AMOUNT_MISMATCH", gatewayResponse: verified.gatewayResponse, rawPayload: verified.raw,
    });
    await createTicketInTx(tx, {
      bookingId: primary.id, customerName: order.bookerName, customerEmail: order.bookerEmail, customerPhone: order.bookerPhone,
      category: "PAYMENT", subject: `Amount mismatch on checkout ${order.reference}`,
      description: `Paystack reported ${verified.amountMinor} ${verified.currency}, but checkout expects ${order.amountMinor} ${order.currency}. This needs manual review before confirming payment.`,
    });
    await recordAudit(tx, { actor: null, action: "payment.amount_mismatch", entityType: "booking_order", entityId: order.id,
      before: { paymentStatus: order.paymentStatus }, after: { outcome: "amount_mismatch", expected: order.amountMinor, received: verified.amountMinor, currency: verified.currency } });
    return { status: "amount_mismatch" };
  }

  const expired = orderBookings.some((booking) => booking.paymentStatus === "CANCELLED");
  await tx.insert(paymentTransactions).values({
    bookingId: primary.id, checkoutOrderId: order.id, reference: verified.reference,
    paystackTransactionId: verified.paystackTransactionId, amountMinor: verified.amountMinor,
    currency: verified.currency, status: "SUCCESS", gatewayResponse: verified.gatewayResponse,
    paidAt: verified.paidAt ? new Date(verified.paidAt) : new Date(), rawPayload: verified.raw,
  });

  if (expired) {
    await tx.update(bookingOrders).set({ paymentStatus: "PAID", updatedAt: new Date() }).where(eq(bookingOrders.id, order.id));
    await tx.update(bookings).set({ paymentStatus: "PAID", allocationStatus: "NOT_ALLOCATED", updatedAt: new Date() }).where(eq(bookings.checkoutOrderId, order.id));
    await tx.delete(inventoryHolds).where(inArray(inventoryHolds.bookingId, orderBookings.map((booking) => booking.id)));
    await tx.update(privateUnitAllocations).set({ releasedAt: new Date(), releaseReason: "checkout payment received after hold expiry" })
      .where(and(inArray(privateUnitAllocations.bookingId, orderBookings.map((booking) => booking.id)), isNull(privateUnitAllocations.releasedAt)));
    await createTicketInTx(tx, {
      bookingId: primary.id, customerName: order.bookerName, customerEmail: order.bookerEmail, customerPhone: order.bookerPhone,
      category: "ALLOCATION", subject: `Payment received after a reservation expired: ${order.reference}`,
      description: "Payment succeeded after one or more temporary inventory holds expired. Please review every accommodation in this checkout, manually reallocate unavailable inventory, or process a refund.",
    });
    return { status: "needs_manual_review" };
  }

  await tx.update(bookingOrders).set({ paymentStatus: "PAID", updatedAt: new Date() }).where(eq(bookingOrders.id, order.id));
  await tx.update(bookings).set({ paymentStatus: "PAID", accommodationStatus: "ALLOCATED", allocationStatus: "FULLY_ALLOCATED", updatedAt: new Date() }).where(eq(bookings.checkoutOrderId, order.id));
  await tx.delete(inventoryHolds).where(inArray(inventoryHolds.bookingId, orderBookings.map((booking) => booking.id)));
  await recordAudit(tx, { actor: null, action: "payment.confirmed", entityType: "booking_order", entityId: order.id,
    before: { paymentStatus: order.paymentStatus }, after: { paymentStatus: "PAID", reference: verified.reference, bookingCount: orderBookings.length } });
  return { status: "confirmed" };
}
