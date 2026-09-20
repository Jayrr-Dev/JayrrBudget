"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  sanitizeUserAiRuleText,
  USER_AI_RULE_MAX_LENGTH,
  USER_AI_RULES_MAX,
} from "@/domains/statements/domain/userAiRules";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Info, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function StatementAiRulesDialog({ open, onOpenChange }: Props) {
  const saved = useQuery(api.aiRules.get, open ? {} : "skip");
  const setRules = useMutation(api.aiRules.set).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.aiRules.get, {});
      if (current === undefined) return;
      localStore.setQuery(
        api.aiRules.get,
        {},
        {
          rules: args.rules,
          updatedAt: current.updatedAt ?? Date.now(),
        },
      );
    },
  );
  const [nextRule, setNextRule] = useState("");
  const [saving, setSaving] = useState(false);
  const rules = saved?.rules ?? [];
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  async function persist(next: string[], success: string) {
    setSaving(true);
    try {
      await setRules({ rules: next });
      toast.success(success);
    } catch (error) {
      toast.error("Could not save rules", {
        description: errorMessage(error, "Save failed"),
      });
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    const clipped = sanitizeUserAiRuleText(nextRule);
    if (!clipped) return;
    const current = rulesRef.current;
    if (current.length >= USER_AI_RULES_MAX) {
      toast.error(`Max ${USER_AI_RULES_MAX} rules`);
      return;
    }
    if (current.some((rule) => rule.toLowerCase() === clipped.toLowerCase())) {
      toast.error("That rule is already listed");
      return;
    }
    setNextRule("");
    void persist([...current, clipped], "Rule saved");
  }

  function removeRule(index: number) {
    const next = rulesRef.current.filter((_, ruleIndex) => ruleIndex !== index);
    void persist(next, "Rule removed");
  }

  const loading = open && saved === undefined;
  const draftChars = nextRule.length;
  const atRuleCap = rules.length >= USER_AI_RULES_MAX;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setNextRule("");
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="gap-6 p-6 sm:max-w-md">
        <DialogHeader className="gap-0 pr-8">
          <DialogTitle className="flex items-center gap-2">
            Classify Rules
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full max-md:size-11 text-accent hover:text-primary"
                  aria-label="About classify rules"
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                className="w-80 gap-0 p-3.5"
              >
                <PopoverHeader className="gap-1.5">
                  <PopoverTitle>What these do</PopoverTitle>
                  <PopoverDescription className="leading-relaxed">
                    Hints Jev uses when Classify labels a bank line.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>ACME payroll is income</li>
                    <li>Costco is Groceries, not Shopping</li>
                    <li>They do not add new sections or categories</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Extra instructions for Classify. Up to {USER_AI_RULES_MAX} rules,{" "}
            {USER_AI_RULE_MAX_LENGTH} characters each. Rules save as you add or
            remove them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  id="classify-rule-input"
                  value={nextRule}
                  onChange={(event) => setNextRule(event.target.value)}
                  placeholder="Add a rule…"
                  maxLength={USER_AI_RULE_MAX_LENGTH}
                  disabled={atRuleCap || saving}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addRule();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Add rule"
                  onClick={addRule}
                  disabled={!nextRule.trim() || atRuleCap || saving}
                >
                  <PlusIcon className="text-accent" />
                </Button>
              </div>
              <div className="flex items-center justify-between px-1 text-xs tabular-nums text-muted-foreground">
                <span>
                  {rules.length}/{USER_AI_RULES_MAX} rules
                  {atRuleCap ? " · full" : null}
                </span>
                <span
                  className={
                    draftChars >= USER_AI_RULE_MAX_LENGTH
                      ? "text-foreground"
                      : undefined
                  }
                >
                  {draftChars}/{USER_AI_RULE_MAX_LENGTH}
                </span>
              </div>
            </div>

            {rules.length === 0 ? (
              <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 px-4 py-6">
                <p className="text-sm text-muted-foreground">No rules yet</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    document.getElementById("classify-rule-input")?.focus()
                  }
                >
                  Add a rule
                </Button>
              </div>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1.5">
                {rules.map((rule, index) => (
                  <li
                    key={`${index}-${rule.slice(0, 24)}`}
                    className="flex items-start gap-2 rounded-md px-2.5 py-2 hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 text-sm leading-relaxed">
                      {rule}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove rule ${index + 1}`}
                      disabled={saving}
                      onClick={() => removeRule(index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
