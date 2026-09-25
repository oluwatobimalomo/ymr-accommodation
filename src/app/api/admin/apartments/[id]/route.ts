import { handleAdminAction } from "@/lib/admin-action";
import { addBedspacesToRoom, addRoomToApartment, getApartmentDetail, updateApartment, updateApartmentInventory } from "@/lib/inventory/apartments";
import { setBedspaceStatus } from "@/lib/inventory/bedspaces";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/apartments/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");

    if (intent === "inventory") {
      const maximum = String(form.get("maxOrder") ?? "").trim();
      await updateApartmentInventory(actor, id, {
        priceNaira: Number(form.get("priceNaira")),
        stock: Number(form.get("stock")),
        minOrder: Number(form.get("minOrder")),
        maxOrder: maximum ? Number(maximum) : null,
        lowStockAlert: Number(form.get("lowStockAlert")),
        listed: form.get("listed") === "on",
      });
      return;
    }

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
      await updateApartment(actor, id, {
        facilityIds: form.getAll("facilityIds").map(String),
        overviewFacilityIds: form.getAll("overviewFacilityIds").map(String),
      });
      return;
    }

    if (intent === "beds") {
      await updateApartment(actor, id, {
        bedTypes: form.getAll("bedTypes").map(String),
        bedSizes: form.getAll("bedSizes").map(String),
      });
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
      checkInDate: String(form.get("checkInDate") ?? ""),
      checkOutDate: String(form.get("checkOutDate") ?? ""),
    });
  });
}
