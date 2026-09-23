import { handleAdminAction } from "@/lib/admin-action";
import { getUnit, setUnitFacilities, setUnitStatus, updateUnit, updateUnitCapacity } from "@/lib/inventory/units";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/units/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");
    if (intent === "capacity") {
      await updateUnitCapacity(actor, id, Number(form.get("capacity") ?? 0), String(form.get("reason") ?? ""));
      return;
    }
    if (intent === "status") {
      await setUnitStatus(
        actor,
        id,
        String(form.get("status")) as "ACTIVE" | "INACTIVE" | "MAINTENANCE",
        String(form.get("reason") ?? ""),
      );
      return;
    }
    if (intent === "facilities") {
      await setUnitFacilities(actor, id, form.getAll("facilityIds").map(String));
      return;
    }
    if (intent === "images") {
      const unit = await getUnit(id);
      if (!unit) throw new Error("That unit could not be found.");
      const keep = new Set(form.getAll("keepImage").map(String));
      const remaining = unit.images.filter((_, i) => keep.has(String(i)));
      const files = form.getAll("images").filter((f): f is File => f instanceof File);
      const newImages = await filesToDataUris(files);
      await updateUnit(actor, id, { images: [...remaining, ...newImages] });
      return;
    }
    await updateUnit(actor, id, {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
    });
  });
}
