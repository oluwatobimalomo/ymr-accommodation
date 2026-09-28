import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { getCurrentActor } from "@/lib/auth/session";
import { ForbiddenError, type Actor } from "@/lib/authz/authorize";
import { safeErrorMessage } from "@/lib/safe-error";

const successNoticeByIntent: Record<string, string> = {
  create: "record-created",
  update: "changes-saved",
  approve: "access-approved",
  reject: "access-declined",
  status: "status-updated",
  images: "photos-saved",
  inventory: "inventory-saved",
  facilities: "facilities-saved",
  beds: "beds-saved",
  "add-bedspaces": "bedspaces-added",
  "add-room": "room-added",
  "bedspace-status": "status-updated",
  pricing: "pricing-saved",
  capacity: "capacity-saved",
  cancel: "booking-cancelled",
  "check-in": "guest-checked-in",
  "check-out": "guest-checked-out",
  reallocate: "guest-reallocated",
  "issue-key": "key-issued",
  "return-key": "key-returned",
  "missing-key": "key-marked-missing",
  reply: "reply-sent",
};

/**
 * Wraps an admin mutation route handler with the checks every one of them
 * needs: same-origin (CSRF), signed in, and a friendly redirect back to the
 * originating page with an error message instead of a raw stack trace,
 * per the brief's error-handling requirement (no SQLSTATE-style errors).
 */
export async function handleAdminAction(
  request: Request,
  redirectTo: string,
  action: (form: FormData, actor: Actor) => Promise<void>,
  redirectSuccessTo = redirectTo,
): Promise<Response> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const actor = await getCurrentActor();
  if (!actor) return NextResponse.redirect(new URL("/admin/login", request.url), 303);

  const form = await request.formData();
  try {
    await action(form, actor);
    const successUrl = new URL(redirectSuccessTo, request.url);
    const intent = String(form.get("intent") ?? "");
    const notice = redirectTo === "/admin/staff" && intent === "create"
      ? "staff-access-saved"
      : successNoticeByIntent[intent] ?? "changes-saved";
    successUrl.searchParams.set("saved", notice);
    return NextResponse.redirect(successUrl, 303);
  } catch (e) {
    const message = e instanceof ForbiddenError ? "You don't have permission to do this." : safeErrorMessage(e);
    const url = new URL(redirectTo, request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}
