import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth/origin";
import { getCurrentActor } from "@/lib/auth/session";
import { createApartment } from "@/lib/inventory/apartments";
import { safeErrorMessage } from "@/lib/safe-error";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const actor = await getCurrentActor();
  if (!actor) return NextResponse.redirect(new URL("/admin/login", request.url), 303);

  const form = await request.formData();
  const lodgeId = String(form.get("lodgeId") ?? "");
  const backTo = `/admin/lodges/${lodgeId}/apartments/new`;

  try {
    const mode = String(form.get("mode")) as "PRIVATE" | "SHARED";
    const checkInDate = String(form.get("checkInDate") ?? "").trim();
    const checkOutDate = String(form.get("checkOutDate") ?? "").trim();
    if (!checkInDate || !checkOutDate) throw new Error("Choose both the check-in and check-out dates.");
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    const images = await filesToDataUris(files);

    await createApartment(actor, {
      lodgeId,
      name: String(form.get("name") ?? ""),
      mode,
      priceNaira: Number(form.get("priceNaira") ?? 0),
      checkInDate,
      checkOutDate,
      images,
      facilityIds: form.getAll("facilityIds").map(String),
      bedTypes: form.getAll("bedTypes").map(String),
      bedSizes: form.getAll("bedSizes").map(String),
      overviewFacilityIds: form.getAll("overviewFacilityIds").map(String),
      genderRestriction: mode === "SHARED" ? (String(form.get("genderRestriction")) as "ANY" | "MALE" | "FEMALE") : undefined,
      bedspaceCount: mode === "SHARED" ? Number(form.get("bedspaceCount") ?? 0) : undefined,
      roomCount: mode === "SHARED" ? Number(form.get("roomCount") ?? 1) : undefined,
    });

    return NextResponse.redirect(new URL(`/admin/lodges/${lodgeId}?success=apartment-created`, request.url), 303);
  } catch (e) {
    return NextResponse.redirect(new URL(`${backTo}?error=${encodeURIComponent(safeErrorMessage(e))}`, request.url), 303);
  }
}
