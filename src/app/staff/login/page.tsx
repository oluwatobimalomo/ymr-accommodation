import { StaffLoginView } from "@/components/StaffLoginView";

export const metadata = { title: "Staff sign in" };

export default function StaffLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <StaffLoginView searchParams={searchParams} loginPath="/staff/login" />;
}
