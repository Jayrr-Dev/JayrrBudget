"use client";

import { MerchantsPanel } from "@/domains/merchants/ui/MerchantsPanel";

export default function MerchantsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-[var(--border)] pb-6">
        <h1 className="type-page">Merchants</h1>
        <p className="type-lead">
          Stores and payees you spend with. Fix a name once; it updates
          everywhere.
        </p>
      </header>
      <MerchantsPanel />
    </div>
  );
}
