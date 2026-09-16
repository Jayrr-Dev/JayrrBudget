import { AdminGate } from "@/domains/ops/ui/AdminGate";
import { ServiceAdmin } from "@/domains/service/ui/ServiceAdmin";

export default function ServicePage() {
  return (
    <AdminGate>
      <ServiceAdmin />
    </AdminGate>
  );
}
