import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { LodgeMultiSelect } from "@/components/LodgeMultiSelect";
import { requireActor } from "@/lib/auth/require";
import { getStaffDirectory } from "@/lib/admin/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff access" };

export default async function AdminStaffPage({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const actor = await requireActor();
  let directory: Awaited<ReturnType<typeof getStaffDirectory>>;
  try { directory = await getStaffDirectory(actor); } catch { notFound(); }
  const params = await searchParams;
  return <div className="admin-page stack staff-access-page">
    <header className="admin-page-heading staff-access-heading"><div><span className="eyebrow">Administration</span><h1>Staff access</h1><p>Review access requests and manage operational staff.</p></div></header>
    <div className="staff-page-status"><ErrorBanner error={params.error} />
      {params.created && <div className="staff-access-success" role="status">Staff access saved.</div>}
    </div>
    <div className="staff-access-grid">
      <section className="card staff-access-create">
        <div className="staff-access-card-heading"><span className="staff-access-kicker">Administrator setup</span><h2>Add a staff member</h2></div>
        <p className="listing-meta">Coordinators need lodge assignments. Overseers automatically see operations across all lodges. Neither role can access financial records.</p>
        <form method="post" action="/api/admin/staff" className="staff-create-form">
          <input type="hidden" name="intent" value="create" />
          <label className="field"><span>Full name</span><input name="name" required minLength={2} maxLength={120} /></label>
          <label className="field"><span>Email address</span><input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
          <label className="field"><span>Initial password (12+ characters)</span><input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <label className="field"><span>Role</span><select name="roleKey" required defaultValue="accommodation_officer">{directory.roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}</select></label>
          <div className="staff-lodge-field"><span className="staff-field-label">Lodge assignments</span><LodgeMultiSelect lodges={directory.lodges} /><small>For a Lodge Coordinator. Overseers automatically cover every lodge.</small></div>
          <button className="btn" type="submit">Create staff account</button>
        </form>
        <div className="staff-self-register"><strong>Let staff request access themselves</strong><span>Share this registration link with staff. They set their own password and remain pending until approval.</span><a href="/staff">/staff ↗</a></div>
      </section>

      <section className="card staff-access-directory-panel">
        <section className="staff-directory-section" aria-labelledby="staff-pending-heading">
          <div className="staff-section-title"><div><span className="staff-access-kicker">Approval queue</span><h2 id="staff-pending-heading">Access requests</h2></div><span className="staff-count-badge">{directory.requests.length} pending</span></div>
          {directory.requests.length ? <div className="staff-request-list">{directory.requests.map((request) => <article className="staff-request-card" key={request.id}>
            <div className="staff-identity"><strong>{request.name}</strong><span>{request.email}</span><small>Requested {directory.roles.find((role) => role.key === request.requestedRole)?.name ?? request.requestedRole} · {request.createdAt.toLocaleDateString()}</small></div>
            <form method="post" action="/api/admin/staff" className="staff-approval-form">
              <input type="hidden" name="intent" value="approve" /><input type="hidden" name="requestId" value={request.id} />
              <label className="field"><span>Approve as</span><select name="roleKey" defaultValue={request.requestedRole}>{directory.roles.filter((role) => role.key === "accommodation_officer" || role.key === "accommodation_overseer").map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}</select></label>
              <div className="staff-lodge-field"><span className="staff-field-label">Assign lodges (Coordinators only)</span><LodgeMultiSelect lodges={directory.lodges} /><small>Leave unselected for an Overseer; they automatically cover all lodges.</small></div>
              <div className="staff-approval-actions"><button className="btn" type="submit">Approve access</button></div>
            </form>
            <form method="post" action="/api/admin/staff" className="staff-reject-form"><input type="hidden" name="intent" value="reject" /><input type="hidden" name="requestId" value={request.id} /><button className="btn secondary" type="submit">Decline request</button></form>
          </article>)}</div> : <p className="staff-empty-state">No access requests are waiting for review.</p>}
        </section>
        <section className="staff-directory-section" aria-labelledby="staff-accounts-heading">
          <div className="staff-section-title"><div><span className="staff-access-kicker">Current team</span><h2 id="staff-accounts-heading">Staff accounts</h2></div><span className="staff-count-badge">{directory.staff.length} accounts</span></div>
          <div className="staff-directory">{directory.staff.map((member) => <article className="staff-directory-row" key={member.id}>
            <div className="staff-identity"><strong>{member.name}</strong><span>{member.email}</span><small>{member.roleKey ? directory.roles.find((role) => role.key === member.roleKey)?.name ?? member.roleKey : "No role assigned"} · {member.status}</small></div>
            {member.roleKey === "super_admin" ? <p className="listing-meta">Super Admin accounts are managed separately.</p> : <details className="staff-edit-details"><summary>Edit access</summary><form method="post" action="/api/admin/staff" className="staff-update-form">
              <input type="hidden" name="intent" value="update" /><input type="hidden" name="userId" value={member.id} />
              <label className="field"><span>Name</span><input name="name" required minLength={2} maxLength={120} defaultValue={member.name} /></label>
              <label className="field"><span>Role</span><select name="roleKey" required defaultValue={member.roleKey ?? "support_agent"}>{directory.roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}</select></label>
              <label className="field"><span>Account status</span><select name="status" defaultValue={member.status}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label>
              <div className="staff-lodge-field"><span className="staff-field-label">Assigned lodges</span><LodgeMultiSelect lodges={directory.lodges} selected={member.lodgeIds} /><small>Only applies to Lodge Coordinators.</small></div>
              <button className="btn secondary" type="submit">Save access</button>
            </form></details>}
          </article>)}</div>
        </section>
      </section>
    </div>
  </div>;
}
