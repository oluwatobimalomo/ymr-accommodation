import Link from "next/link";
import { ImageThumb } from "@/components/ImageThumb";
import { listActiveLodges } from "@/lib/booking/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accommodation" };

export default async function AccommodationPage() {
  const lodges = await listActiveLodges();
  return (
    <div className="stack">
      <h1>Accommodation</h1>
      {lodges.length === 0 ? (
        <p>Accommodation options will appear here once booking opens.</p>
      ) : (
        <div className="grid">
          {lodges.map((lodge) => (
            <Link key={lodge.id} href={`/accommodation/${lodge.slug}`} className="listing-card">
              <ImageThumb src={lodge.images[0]} alt={lodge.name} aspect="4/3" />
              <div className="listing-body">
                <h3>{lodge.name}</h3>
                <p className="listing-meta">{lodge.description || lodge.address || "See available rooms"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
