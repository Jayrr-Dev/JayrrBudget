import { AppShell } from "@/components/layout/AppShell";

export default function SaasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
