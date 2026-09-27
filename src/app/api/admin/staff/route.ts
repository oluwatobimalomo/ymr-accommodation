import { handleAdminAction } from "@/lib/admin-action";
import { approveStaffAccessRequest, createStaffUser, rejectStaffAccessRequest, updateStaffUser } from "@/lib/admin/staff";

export async function POST(request: Request) {
  return handleAdminAction(request, "/admin/staff", async (form, actor) => {
    const intent = String(form.get("intent") ?? "");
    const lodgeIds = form.getAll("lodgeIds").map(String);
    if (intent === "create") {
      await createStaffUser(actor, { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), roleKey: String(form.get("roleKey") ?? ""), lodgeIds });
      return;
    }
    if (intent === "update") {
      await updateStaffUser(actor, { userId: String(form.get("userId") ?? ""), name: String(form.get("name") ?? ""), roleKey: String(form.get("roleKey") ?? ""), lodgeIds, status: String(form.get("status") ?? "") });
      return;
    }
    if (intent === "approve") {
      await approveStaffAccessRequest(actor, { requestId: String(form.get("requestId") ?? ""), roleKey: String(form.get("roleKey") ?? ""), lodgeIds });
      return;
    }
    if (intent === "reject") {
      await rejectStaffAccessRequest(actor, String(form.get("requestId") ?? ""));
      return;
    }
    throw new Error("Choose a valid staff action.");
  }, "/admin/staff?created=1");
}
