import { handleAdminAction } from "@/lib/admin-action";
import { addBedspacesToRoom, addRoomToApartment, getApartmentDetail, updateApartment } from "@/lib/inventory/apartments";
import { setBedspaceStatus } from "@/lib/inventory/bedspaces";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/apartments/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");

    if (intent === "images") {
      const detail = await getApartmentDetail(id);
      if (!detail) throw new Error("That apartment could not be found.");
      const keep = new Set(form.getAll("keepImage").map(String));
      const remaining = detail.unit.images.filter((_, i) => keep.has(String(i)));
      const files = form.getAll("images").filter((f): f is File => f instanceof File);
      const newImages = await filesToDataUris(files);
      await updateApartment(actor, id, { images: [...remaining, ...newImages] });
      return;
    }

    if (intent === "facilities") {
      await updateApartment(actor, id, { facilityIds: form.getAll("facilityIds").map(String) });
      return;
    }

    if (intent === "add-bedspaces") {
      const roomId = String(form.get("roomId") ?? "");
      await addBedspacesToRoom(actor, roomId, Number(form.get("addCount") ?? 0));
      return;
    }

    if (intent === "add-room") {
      await addRoomToApartment(actor, id, Number(form.get("bedspaceCount") ?? 0));
      return;
    }

    if (intent === "bedspace-status") {
      const bedspaceId = String(form.get("bedspaceId") ?? "");
      const status = String(form.get("status")) as "AVAILABLE" | "BLOCKED" | "MAINTENANCE" | "RETIRED";
      await setBedspaceStatus(actor, bedspaceId, status);
      return;
    }

    await updateApartment(actor, id, {
      name: String(form.get("name") ?? ""),
      priceNaira: Number(form.get("priceNaira") ?? 0),
    });
  });
}
