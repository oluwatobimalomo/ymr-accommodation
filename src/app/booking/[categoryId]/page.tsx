import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { BookingForm } from "@/components/BookingForm";
import { getCategoryForBooking } from "@/lib/booking/queries";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { categoryId } = await params;
  const { error } = await searchParams;
  const data = await getCategoryForBooking(categoryId);
  if (!data) notFound();
  const { category, lodge, units, rooms } = data;

  return (
    <div className="stack">
      <p>
        <Link href={`/accommodation/${lodge.slug}`}>&larr; {lodge.name}</Link>
      </p>
      <h1>{category.name}</h1>
      <ErrorBanner error={error} />
      <p>
        {(category.defaultPriceMinor / 100).toLocaleString()} {" "}
        {category.pricingModel === "PER_PERSON" ? "per person" : "per unit"}
      </p>
      {category.description && <p>{category.description}</p>}

      <BookingForm
        categoryId={category.id}
        mode={category.mode}
        customerSelectsBedspace={category.customerSelectsBedspace}
        customerSelectsRoom={category.customerSelectsRoom}
        allowEntireRoomBooking={category.allowEntireRoomBooking}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          genderRestriction: r.genderRestriction,
          bedspaces: r.bedspaces.map((b) => ({ id: b.id, letter: b.letter, status: b.status })),
        }))}
        units={units.map((u) => ({ id: u.id, name: u.name, capacity: u.capacity, imageUrl: u.images[0] }))}
        action="/api/booking/create"
      />
    </div>
  );
}
