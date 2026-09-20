"use client";

import { Button } from "@/components/ui/button";
import { StatementAiRulesDialog } from "@/domains/statements/ui/StatementAiRulesDialog";
import { ListChecks } from "lucide-react";
import { useState } from "react";

export function StatementAiRulesButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ListChecks data-icon="inline-start" />
        Classify Rules
      </Button>
      <StatementAiRulesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
