import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorBanner } from "@/components/AdminChrome";
import { BookingForm } from "@/components/BookingForm";
import { getCategoryForBooking } from "@/lib/booking/queries";
import { formatNaira } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";

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
  const { category, lodge, rooms } = data;

  return (
    <div className="stack guest-experience-page guest-booking-page">
      <p>
        <Link className="guest-back-link" href={`/accommodation/${lodge.slug}`}>&larr; {lodge.name}</Link>
      </p>
      <div className="page-intro guest-editorial-intro guest-booking-intro">
        <span className="eyebrow">Your stay · {lodge.name}</span>
        <h1>{category.name}</h1>
      </div>
      <ErrorBanner error={error} />
      <section className="booking-offer-summary" aria-label="Stay details">
        <div className="booking-offer-price">
          <span className="eyebrow">Starting from</span>
          <p><span className="booking-price">{formatNaira(category.defaultPriceMinor)}</span>{" "}
          <span className="price-unit">{category.pricingModel === "PER_PERSON" ? "per person" : "per apartment"}</span></p>
        </div>
        {category.checkInDate && category.checkOutDate && <p className="stay-date-panel"><span aria-hidden="true">▣</span><span><strong>Your retreat stay</strong><small>{formatDateOnly(category.checkInDate)} – {formatDateOnly(category.checkOutDate)}</small></span></p>}
        {category.description && <p className="booking-offer-description">{category.description}</p>}
      </section>

      <BookingForm
        categoryId={category.id}
        mode={category.mode}
        pricingModel={category.pricingModel}
        priceMinor={category.defaultPriceMinor}
        customerSelectsBedspace={category.customerSelectsBedspace}
        customerSelectsRoom={category.customerSelectsRoom}
        allowEntireRoomBooking={category.allowEntireRoomBooking}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          genderRestriction: r.genderRestriction,
          bedspaces: r.bedspaces.map((b) => ({ id: b.id, letter: b.letter, status: b.status })),
        }))}
        action="/api/booking/create"
      />
    </div>
  );
}
