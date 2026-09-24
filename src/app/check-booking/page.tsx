import { BookingLookup } from "@/components/BookingLookup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check my booking" };

export default function CheckBookingPage() {
  return <BookingLookup />;
}
