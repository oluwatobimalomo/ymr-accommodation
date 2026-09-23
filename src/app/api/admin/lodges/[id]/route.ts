import { getLodge, setLodgeStatus, updateLodge } from "@/lib/inventory/lodges";
import { handleAdminAction } from "@/lib/admin-action";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleAdminAction(request, `/admin/lodges/${id}`, async (form, actor) => {
    const intent = String(form.get("intent") ?? "update");

    if (intent === "status") {
      const status = String(form.get("status")) as "ACTIVE" | "INACTIVE";
      await setLodgeStatus(actor, id, status);
      return;
    }

    if (intent === "images") {
      const lodge = await getLodge(id);
      if (!lodge) throw new Error("That lodge could not be found.");
      const keep = new Set(form.getAll("keepImage").map(String));
      const remaining = lodge.images.filter((_, i) => keep.has(String(i)));
      const files = form.getAll("images").filter((f): f is File => f instanceof File);
      const newImages = await filesToDataUris(files);
      await updateLodge(actor, id, { images: [...remaining, ...newImages] });
      return;
    }

    const proximityRaw = String(form.get("proximityKm") ?? "").trim();
    await updateLodge(actor, id, {
      name: String(form.get("name") ?? ""),
      address: String(form.get("address") ?? ""),
      proximityKm: proximityRaw === "" ? null : proximityRaw,
      contactName: String(form.get("contactName") ?? ""),
      contactPhone: String(form.get("contactPhone") ?? ""),
    });
  });
}
