from pathlib import Path
import re

path = Path("src/domains/analysis/ui/AnalysisDashboard.tsx")
text = path.read_text(encoding="utf-8")

old_sig = """function AverageLeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  period,
  periodCount,
  vendorsByRow,
  transactionsForRow,
  transactionsForVendor,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  period: AnalysisPeriod;
  periodCount: number;
  vendorsByRow?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
  transactionsForVendor?: (
    rowName: string,
    vendorName: string,
  ) => AnalysisTxnPeek[];
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const meta = ANALYSIS_PERIOD_META[period];
  const divisor = Math.max(periodCount, 1);
  const top = rows.slice(0, 10);
  const topAvgCost = top.reduce((sum, row) => sum + row.spend, 0) / divisor;
  const topAvgCount =
    top.reduce((sum, row) => sum + (row.count ?? 0), 0) / divisor;
  const canExpand = Boolean(vendorsByRow);"""

new_sig = """function AverageLeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  currency,
  period,
  periodCount,
  vendorsByRow,
  transactionsForRow,
  transactionsForVendor,
  footer,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  currency: string;
  period: AnalysisPeriod;
  periodCount: number;
  vendorsByRow?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
  transactionsForVendor?: (
    rowName: string,
    vendorName: string,
  ) => AnalysisTxnPeek[];
  /** Replaces the default "Top N" sum footer when set. */
  footer?: {
    label: string;
    avgCost: number;
    avgCount?: number | null;
  };
}) {
  const [openName, setOpenName] = useState<string | null>(null);
  const meta = ANALYSIS_PERIOD_META[period];
  const divisor = Math.max(periodCount, 1);
  const top = rows.slice(0, 10);
  const topAvgCost = top.reduce((sum, row) => sum + row.spend, 0) / divisor;
  const topAvgCount =
    top.reduce((sum, row) => sum + (row.count ?? 0), 0) / divisor;
  const footerLabel = footer?.label ?? `Top ${top.length}`;
  const footerAvgCost = footer?.avgCost ?? topAvgCost;
  const footerAvgCount = footer != null ? footer.avgCount : topAvgCount;
  const canExpand = Boolean(vendorsByRow);"""

if old_sig not in text:
    raise SystemExit("sig not found")
text = text.replace(old_sig, new_sig, 1)

old_footer = """          <div
            className={`${grid} border-t border-[var(--border)] py-2 text-sm font-medium`}
          >
            <span />
            <span className="min-w-0 truncate">Top {top.length}</span>
            <span className="text-right font-mono tabular-nums">
              {formatMoney(topAvgCost, currency)}
            </span>
            <span className="text-right font-mono tabular-nums">
              {formatAvgCount(topAvgCount)}
            </span>
            {canExpand ? <span /> : null}
            {showTxns ? <span /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function MainTab({"""

new_footer = """          <div
            className={`${grid} border-t border-[var(--border)] py-2 text-sm font-medium`}
          >
            <span />
            <span className="min-w-0 truncate">{footerLabel}</span>
            <span className="text-right font-mono tabular-nums">
              {formatMoney(footerAvgCost, currency)}
            </span>
            <span className="text-right font-mono tabular-nums">
              {footerAvgCount == null ? "—" : formatAvgCount(footerAvgCount)}
            </span>
            {canExpand ? <span /> : null}
            {showTxns ? <span /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function MainTab({"""

# Only replace the AverageLeaderboardTable footer (first Top {top.length} after that fn)
avg_start = text.find("function AverageLeaderboardTable(")
main_start = text.find("function MainTab({", avg_start)
chunk = text[avg_start:main_start]
if "Top {top.length}" not in chunk:
    raise SystemExit("footer Top N not found in AverageLeaderboardTable")
chunk2 = chunk.replace(
    """            <span className="min-w-0 truncate">Top {top.length}</span>
            <span className="text-right font-mono tabular-nums">
              {formatMoney(topAvgCost, currency)}
            </span>
            <span className="text-right font-mono tabular-nums">
              {formatAvgCount(topAvgCount)}
            </span>""",
    """            <span className="min-w-0 truncate">{footerLabel}</span>
            <span className="text-right font-mono tabular-nums">
              {formatMoney(footerAvgCost, currency)}
            </span>
            <span className="text-right font-mono tabular-nums">
              {footerAvgCount == null ? "—" : formatAvgCount(footerAvgCount)}
            </span>""",
    1,
)
text = text[:avg_start] + chunk2 + text[main_start:]

# Ensure call site has footer + clean info (idempotent)
text = re.sub(
    r'(title="Average by spread"\s+info=\{`Total amount and transaction count for each spread \(Income \+ Needs / Wants / Savings\), divided by \$\{periodCount\} \$\{periodMeta\.nounPlural\} in this range \(same buckets as the \$\{periodMeta\.label\.toLowerCase\(\)\} charts\)\.)[^`]*(`\}\s+nameLabel="Spread")',
    r"\1 Footer is average Surplus (income - Needs - Wants - Savings).\2",
    text,
    count=1,
)

if 'title="Average by spread"' in text and "footer={{" not in text[text.find('title="Average by spread"') : text.find('title="Average by spread"') + 800]:
    raise SystemExit("footer prop missing on Average by spread call site")

path.write_text(text, encoding="utf-8")
print("ok")
