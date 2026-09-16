import { AdminGate } from "@/domains/ops/ui/AdminGate";
import { RevenueDashboard } from "@/domains/revenue/ui/RevenueDashboard";

export default function RevenuePage() {
  return (
    <AdminGate>
      <RevenueDashboard />
    </AdminGate>
  );
}
