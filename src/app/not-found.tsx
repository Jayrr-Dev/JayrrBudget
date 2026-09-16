import { AppShell } from "@/components/layout/AppShell";
import { NotFoundScreen } from "@/domains/ledger-ai/ui/NotFoundScreen";

export default function NotFound() {
  return (
    <AppShell>
      <NotFoundScreen />
    </AppShell>
  );
}
