import { NextResponse } from "next/server";
import { confirmPaymentFromVerifiedResult } from "@/lib/payments/confirm-payment";
import { createPaymentReturnProof, paymentReturnCookieName } from "@/lib/payments/payment-return-proof";
import { verifyTransaction } from "@/lib/payments/paystack";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const url = new URL(request.url);
  const callbackReference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  const ticketUrl = new URL(`/booking/reference/${encodeURIComponent(reference)}`, url.origin);

  if (!reference || callbackReference !== reference) {
    ticketUrl.searchParams.set("error", "payment");
    return NextResponse.redirect(ticketUrl, 303);
  }

  try {
    const verified = await verifyTransaction(reference);
    const outcome = await confirmPaymentFromVerifiedResult(verified);
    if (outcome.status !== "confirmed" && outcome.status !== "already_confirmed") {
      console.error(`Payment callback for ${reference} did not confirm (${outcome.status}).`);
      ticketUrl.searchParams.set("error", "payment");
      return NextResponse.redirect(ticketUrl, 303);
    }

    const proof = createPaymentReturnProof(reference);
    const response = NextResponse.redirect(ticketUrl, 303);
    response.cookies.set(paymentReturnCookieName(reference), proof.value, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: ticketUrl.pathname,
      maxAge: proof.maxAge,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error(`Payment callback verification threw for ${reference}:`, error);
    ticketUrl.searchParams.set("error", "payment");
    return NextResponse.redirect(ticketUrl, 303);
  }
}
