import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav, ErrorBanner } from "@/components/AdminChrome";
import { ApartmentForm } from "@/components/ApartmentForm";
import { requireActor } from "@/lib/auth/require";
import { listFacilities } from "@/lib/inventory/facilities";
import { getLodge } from "@/lib/inventory/lodges";

export const dynamic = "force-dynamic";

export default async function NewApartmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireActor();
  const { id } = await params;
  const { error } = await searchParams;
  const lodge = await getLodge(id);
  if (!lodge) notFound();
  const facilities = await listFacilities();

  return (
    <div className="stack">
      <AdminNav />
      <p>
        <Link href={`/admin/lodges/${id}`}>&larr; {lodge.name}</Link>
      </p>
      <h1>Add an apartment</h1>
      <ErrorBanner error={error} />
      <div className="card">
        <ApartmentForm lodgeId={id} facilities={facilities} action="/api/admin/apartments" />
      </div>
    </div>
  );
}
