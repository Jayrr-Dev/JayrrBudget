import { AdminGate } from "@/domains/ops/ui/AdminGate";
import { UsersDashboard } from "@/domains/user-metrics/ui/UsersDashboard";

export default function UsersPage() {
  return (
    <AdminGate>
      <UsersDashboard />
    </AdminGate>
  );
}
