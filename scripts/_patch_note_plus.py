from pathlib import Path

p = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
t = p.read_text(encoding="utf-8")

if "addScratchNoteRow" not in t.split('from "lucide-react"')[0]:
    t = t.replace(
        'import { formatMoney } from "@/domains/dashboard/domain/money";\n',
        'import { formatMoney } from "@/domains/dashboard/domain/money";\n'
        'import { addScratchNoteRow } from "@/domains/scratch-note/scratchNoteStore";\n',
        1,
    )

t = t.replace(
    'import { ChevronDownIcon } from "lucide-react";',
    'import { ChevronDownIcon, PlusIcon } from "lucide-react";',
    1,
)

t = t.replace(
    "grid-cols-[1.5rem_minmax(0,1fr)_9rem_4rem_3.75rem",
    "grid-cols-[1.75rem_minmax(0,1fr)_9rem_4rem_3.75rem",
)
t = t.replace(
    "grid-cols-[1.5rem_minmax(0,1fr)_9rem_5.5rem",
    "grid-cols-[1.75rem_minmax(0,1fr)_9rem_5.5rem",
)

old_vendor = """                        {vendors.map((vendor) => (
                          <div
                            key={vendor.name}
                            className={`${grid} py-1 text-sm`}
                          >
                            <span />
                            <span className="min-w-0 truncate text-[var(--muted-foreground)]">
                              {vendor.name}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {formatMoney(vendor.spend, currency)}
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {vendor.count ?? 0}
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatShare(vendor.spend, row.spend)}
                            </span>
                            {canExpand ? <span /> : null}
                            {showTxns ? (
                              <RowTxnsPopover
                                label={vendor.name}
                                currency={currency}
                                transactions={
                                  transactionsForVendor?.(
                                    row.name,
                                    vendor.name,
                                  ) ?? []
                                }
                              />
                            ) : null}
                          </div>
                        ))}"""

new_vendor = """                        {vendors.map((vendor) => (
                          <div
                            key={vendor.name}
                            className={`${grid} py-1 text-sm`}
                          >
                            <button
                              type="button"
                              title={`Add ${vendor.name} to note`}
                              aria-label={`Add ${vendor.name} to note`}
                              className="inline-flex size-5 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                              onClick={(event) => {
                                event.stopPropagation();
                                addScratchNoteRow({
                                  name: vendor.name,
                                  spend: vendor.spend,
                                  count: vendor.count ?? 0,
                                  currency,
                                  parent: row.name,
                                });
                              }}
                            >
                              <PlusIcon className="size-3.5" strokeWidth={2} />
                            </button>
                            <span className="min-w-0 truncate text-[var(--muted-foreground)]">
                              {vendor.name}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {formatMoney(vendor.spend, currency)}
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {vendor.count ?? 0}
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatShare(vendor.spend, row.spend)}
                            </span>
                            {canExpand ? <span /> : null}
                            {showTxns ? (
                              <RowTxnsPopover
                                label={vendor.name}
                                currency={currency}
                                transactions={
                                  transactionsForVendor?.(
                                    row.name,
                                    vendor.name,
                                  ) ?? []
                                }
                              />
                            ) : null}
                          </div>
                        ))}"""

if old_vendor not in t:
    raise SystemExit("Leaderboard vendor block not found")
t = t.replace(old_vendor, new_vendor, 1)

p.write_text(t, encoding="utf-8")
print("patched ok")
print("addScratch count", t.count("addScratchNoteRow"))
print("PlusIcon import", "PlusIcon" in t.split("from \"lucide-react\"")[0] or "PlusIcon" in t)
