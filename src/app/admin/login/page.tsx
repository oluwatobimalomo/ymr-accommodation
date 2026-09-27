import { StaffLoginView } from "@/components/StaffLoginView";

export const metadata = { title: "Staff sign in" };

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <StaffLoginView searchParams={searchParams} loginPath="/admin/login" />;
}
