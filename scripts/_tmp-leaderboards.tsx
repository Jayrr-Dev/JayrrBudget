/** High / mid / low spend across header range period buckets. */
function RangeLeaderboardTable({
  title,
  info,
  nameLabel,
  rows,
  series,
  monthly,
  currency,
  otherByPeriod,
  transactionsForRow,
}: {
  title: string;
  info: string;
  nameLabel: string;
  rows: AnalysisRankedItem[];
  series: AnalysisCategorySeries[];
  monthly: Array<Record<string, string | number>>;
  currency: string;
  otherByPeriod?: Record<string, AnalysisRankedItem[]>;
  transactionsForRow?: (rowName: string) => AnalysisTxnPeek[];
}) {
  const showTxns = Boolean(transactionsForRow);
  const top = useMemo(() => {
    return rows
      .map((row) => {
        const key = seriesKeyForLabel(row.name, series);
        const stats = key
          ? periodSpendRange(monthly, key)
          : periodSpendRangeFromOther(otherByPeriod, row.name);
        return { name: row.name, spend: row.spend, ...stats };
      })
      .filter((row) => row.high > 0)
      .sort((a, b) => b.high - a.high || b.spend - a.spend)
      .slice(0, 10);
  }, [rows, series, monthly, otherByPeriod]);

  const grid = showTxns
    ? "grid w-fit max-w-full grid-cols-[1.5rem_minmax(7rem,14rem)_7.25rem_7.25rem_7.25rem_1.25rem] items-center gap-x-4 px-3"
    : "grid w-fit max-w-full grid-cols-[1.5rem_minmax(7rem,14rem)_7.25rem_7.25rem_7.25rem] items-center gap-x-4 px-3";

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      {top.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nothing in this range.
        </p>
      ) : (
        <div className="w-fit max-w-full overflow-x-auto rounded-lg border border-[var(--border)]">
          <div
            className={`${grid} border-b border-[var(--border)] py-2 text-xs text-[var(--muted-foreground)]`}
          >
            <span>#</span>
            <span className="min-w-0 truncate">{nameLabel}</span>
            <span className="text-right">High</span>
            <span className="text-right">Mid</span>
            <span className="text-right">Low</span>
            {showTxns ? <span className="sr-only">Info</span> : null}
          </div>
          <div>
            {top.map((row, index) => (
              <div
                key={row.name}
                className={`${grid} not-last:border-b border-[var(--border)] py-2.5 text-sm`}
              >
                <span className="text-[var(--muted-foreground)] tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate font-medium text-[var(--foreground)]">
                  {row.name}
                </span>
                <span className="text-right font-mono tabular-nums text-[var(--foreground)]">
                  {formatMoney(row.high, currency)}
                </span>
                <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {formatMoney(row.mid, currency)}
                </span>
                <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {formatMoney(row.low, currency)}
                </span>
                {showTxns ? (
                  <RowTxnsPopover
                    label={row.name}
                    currency={currency}
                    transactions={transactionsForRow?.(row.name) ?? []}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Like Summary, but spend/count divided by header period buckets. */
function AverageLeaderboardTable({
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
  const canExpand = Boolean(vendorsByRow);
  const showTxns = Boolean(transactionsForRow);
  const grid = [
    "grid w-full items-center gap-x-3 px-3",
    `grid-cols-[1.5rem_minmax(0,1fr)_9rem_5.5rem${canExpand ? "_1rem" : ""}${showTxns ? "_1.25rem" : ""}]`,
  ].join(" ");

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5">
      <ChartTitle title={title} info={info} />
      {top.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nothing in this range.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <div
            className={`${grid} border-b border-[var(--border)] py-2 text-xs text-[var(--muted-foreground)]`}
          >
            <span>#</span>
            <span className="min-w-0 truncate">{nameLabel}</span>
            <span className="text-right">{meta.avgCostLabel}</span>
            <span className="text-right">{meta.avgCountLabel}</span>
            {canExpand ? <span /> : null}
            {showTxns ? <span className="sr-only">Info</span> : null}
          </div>
          <div>
            {top.map((row, index) => {
              const vendors = vendorsByRow?.[row.name] ?? [];
              const isOpen = canExpand && openName === row.name;
              const avgCost = row.spend / divisor;
              const avgCount = (row.count ?? 0) / divisor;
              const mainCells = (
                <>
                  <span className="text-[var(--muted-foreground)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    {row.name}
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums">
                    {formatMoney(avgCost, currency)}
                  </span>
                  <span className="text-right font-mono text-sm tabular-nums text-[var(--muted-foreground)]">
                    {formatAvgCount(avgCount)}
                  </span>
                  {canExpand ? (
                    <ChevronDownIcon
                      className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  ) : null}
                </>
              );
              return (
                <div
                  key={row.name}
                  className="not-last:border-b border-[var(--border)]"
                >
                  <div className={`${grid} py-2.5 text-sm`}>
                    {canExpand ? (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenName((current) =>
                            current === row.name ? null : row.name,
                          )
                        }
                        className="contents text-left"
                      >
                        {mainCells}
                      </button>
                    ) : (
                      mainCells
                    )}
                    {showTxns ? (
                      <RowTxnsPopover
                        label={row.name}
                        currency={currency}
                        transactions={transactionsForRow?.(row.name) ?? []}
                      />
                    ) : null}
                  </div>
                  {isOpen ? (
                    vendors.length === 0 ? (
                      <p
                        className={`${grid} pb-2.5 text-sm text-[var(--muted-foreground)]`}
                      >
                        <span />
                        <span className="col-span-3">No vendors listed.</span>
                        <span />
                      </p>
                    ) : (
                      <div className="pb-2">
                        {vendors.slice(0, 8).map((vendor) => (
                          <div
                            key={vendor.name}
                            className={`${grid} py-1 text-sm`}
                          >
                            <span />
                            <span className="min-w-0 truncate text-[var(--muted-foreground)]">
                              {vendor.name}
                            </span>
                            <span className="text-right font-mono tabular-nums">
                              {formatMoney(vendor.spend / divisor, currency)}
                            </span>
                            <span className="text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                              {formatAvgCount((vendor.count ?? 0) / divisor)}
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
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
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
