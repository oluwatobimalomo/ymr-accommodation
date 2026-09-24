import { handleAdminAction } from "@/lib/admin-action";
import { createLodge } from "@/lib/inventory/lodges";
import { filesToDataUris } from "@/lib/uploads";

export async function POST(request: Request) {
  return handleAdminAction(request, "/admin/lodges/new", async (form, actor) => {
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    const images = await filesToDataUris(files);
    await createLodge(actor, {
      eventId: String(form.get("eventId") ?? ""),
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      description: String(form.get("description") ?? ""),
      address: String(form.get("address") ?? ""),
      contactName: String(form.get("contactName") ?? ""),
      contactPhone: String(form.get("contactPhone") ?? ""),
      images,
    });
  }, "/admin/lodges");
}
