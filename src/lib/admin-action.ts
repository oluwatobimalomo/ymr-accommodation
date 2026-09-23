import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { getCurrentActor } from "@/lib/auth/session";
import { ForbiddenError, type Actor } from "@/lib/authz/authorize";
import { safeErrorMessage } from "@/lib/safe-error";

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
): Promise<Response> {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const actor = await getCurrentActor();
  if (!actor) return NextResponse.redirect(new URL("/admin/login", request.url), 303);

  const form = await request.formData();
  try {
    await action(form, actor);
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (e) {
    const message = e instanceof ForbiddenError ? "You don't have permission to do this." : safeErrorMessage(e);
    const url = new URL(redirectTo, request.url);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }
}
