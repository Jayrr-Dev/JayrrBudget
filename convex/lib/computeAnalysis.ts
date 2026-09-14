import {
  classifyCashFlow,
  spendCategoryLabel,
} from "./cashFlow";
import {
  addDays,
  addMonths,
  monthKey,
  periodKey,
  periodLabel,
  periodsBetween,
} from "./periods";
import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRange,
  AnalysisRankedItem,
  AnalysisSourceRow,
  AnalysisTxnPeek,
} from "./analysisTypes";
import { singularCategoryKey } from "./categoryKey";
import {
  classifySpread,
  SPREAD_DEFINITIONS,
  type SpreadName,
} from "./spreads";
import { splitTags } from "./tags";


const TOP_STACKED_CATEGORY_ROWS = 15;
const TOP_STACKED_SECTION_ROWS = 12;
const TOP_STACKED_SPREAD_ROWS = 4;
const NAMED_SHARE = 0.85;
const UNCATEGORIZED = "Uncategorized";
const PEEK_LIMIT = 120;

function peekKey(facet: string, ...parts: string[]) {
  return `${facet}:${parts.join("::")}`;
}

function pushPeek(
  map: Map<string, AnalysisTxnPeek[]>,
  key: string,
  peek: AnalysisTxnPeek,
) {
  const list = map.get(key);
  if (list) list.push(peek);
  else map.set(key, [peek]);
}

function finalizePeeks(
  map: Map<string, AnalysisTxnPeek[]>,
): Record<string, AnalysisTxnPeek[]> {
  const out: Record<string, AnalysisTxnPeek[]> = {};
  for (const [key, list] of map) {
    out[key] = list
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, PEEK_LIMIT);
  }
  return out;
}

const SPREAD_ORDER = new Map(
  SPREAD_DEFINITIONS.map((def, index) => [def.name, index]),
);

function resolveSpreadName(input: {
  spreadName?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
}): SpreadName | null {
  const fromDb = input.spreadName?.trim();
  if (
    fromDb === "Income" ||
    fromDb === "Needs" ||
    fromDb === "Wants" ||
    fromDb === "Savings"
  ) {
    return fromDb;
  }
  return classifySpread({
    section: input.sectionName,
    category: input.categoryName,
    subcategory: input.subcategoryName,
  });
}
const OTHER = "Other";
const OTHER_KEY = "other";

function chartKey(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "category";
}

export function rangeStartDate(latestDate: string, range: AnalysisRange) {
  if (range === "all") return null;
  if (range === "1w") return addDays(latestDate, -6);
  if (range === "1m") return addDays(latestDate, -29);

  const monthsBack = range === "3m" ? 2 : range === "6m" ? 5 : 11;
  return `${addMonths(monthKey(latestDate), -monthsBack)}-01`;
}

function resolveCategory(input: {
  taxonomyCategory: string | null;
  categoryDetailed: string | null;
  categoryPrimary: string | null;
}) {
  return (
    input.taxonomyCategory?.trim() ||
    input.categoryDetailed?.trim() ||
    input.categoryPrimary?.trim() ||
    UNCATEGORIZED
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function weekdayLabel(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Unknown";
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAYS[(dow + 6) % 7];
}

function spendWeekday(postedDate: string, authorizedDate: string | null) {
  const raw = authorizedDate?.trim() || postedDate;
  return weekdayLabel(raw);
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function channelLabel(
  paymentChannel: string | null,
  enrichmentChannel: string | null,
) {
  const raw = (paymentChannel ?? enrichmentChannel ?? "").trim().toLowerCase();
  if (raw === "in store" || raw === "in-store" || raw === "instore") {
    return "In store";
  }
  if (raw === "online" || raw === "web") return "Online";
  if (raw === "other" || raw === "") return "Unspecified";
  return titleCase(raw);
}

const REGION_NAMES: Record<string, string> = {
  on: "Ontario",
  ab: "Alberta",
  bc: "British Columbia",
  qc: "Quebec",
  mb: "Manitoba",
  sk: "Saskatchewan",
  ns: "Nova Scotia",
  nb: "New Brunswick",
  nl: "Newfoundland",
  pe: "PEI",
  yt: "Yukon",
  nt: "Northwest Territories",
  nu: "Nunavut",
  ca: "Canada",
};

function placeLabel(city: string | null, region: string | null) {
  const cityName = city?.trim();
  if (cityName) {
    const mapped = REGION_NAMES[cityName.toLowerCase()];
    if (mapped && cityName.length <= 3) return mapped;
    return titleCase(cityName);
  }
  const regionName = region?.trim();
  if (!regionName) return null;
  return REGION_NAMES[regionName.toLowerCase()] ?? titleCase(regionName);
}

const COUNTRY_NAMES: Record<string, string> = {
  can: "Canada",
  ca: "Canada",
  canada: "Canada",
  usa: "United States",
  us: "United States",
  "united states": "United States",
  phl: "Philippines",
  ph: "Philippines",
  philippines: "Philippines",
  gbr: "United Kingdom",
  gb: "United Kingdom",
  uk: "United Kingdom",
  de: "Germany",
  deu: "Germany",
  germany: "Germany",
  cze: "Czechia",
  cz: "Czechia",
  au: "Australia",
  aus: "Australia",
};

function countryLabel(country: string | null) {
  const raw = country?.trim();
  if (!raw) return null;
  return COUNTRY_NAMES[raw.toLowerCase()] ?? titleCase(raw);
}

const TICKET_SIZE_ORDER = [
  "Under $15",
  "$15–50",
  "$50–100",
  "$100–250",
  "$250–1,000",
  "$1,000+",
] as const;

function ticketSizeLabel(amount: number) {
  if (amount < 15) return "Under $15";
  if (amount < 50) return "$15–50";
  if (amount < 100) return "$50–100";
  if (amount < 250) return "$100–250";
  if (amount < 1000) return "$250–1,000";
  return "$1,000+";
}

function dayOfMonthLabel(isoDate: string) {
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  return String(day);
}

function weekendPart(weekday: string) {
  return weekday === "Saturday" || weekday === "Sunday" ? "Weekend" : "Weekday";
}

function merchantLabel(input: {
  companyName: string | null;
  merchantClean: string | null;
  description: string | null;
}) {
  const company = input.companyName?.trim();
  if (company) return company;
  const clean = input.merchantClean?.trim();
  if (clean) return clean;
  const description = input.description?.trim();
  if (!description) return "Unknown";
  return description.replace(/\s+/g, " ").slice(0, 42);
}

/** Prefer merchant_clean for subcategory drilldowns. */
function merchantCleanLabel(input: {
  merchantClean: string | null;
  description: string | null;
  companyName?: string | null;
  brandName?: string | null;
}) {
  const clean = input.merchantClean?.trim();
  const company = input.companyName?.trim() || input.brandName?.trim() || null;
  // Generic payment labels (Loan Payment, Credit Memo) hide the real vendor.
  if (clean && !isGenericMerchantClean(clean)) return clean;
  if (company) return company;
  if (clean) return clean;
  const description = input.description?.trim();
  if (!description) return "Unknown";
  return description.replace(/\s+/g, " ").slice(0, 42);
}

const GENERIC_MERCHANT_CLEANS = new Set([
  "loan payment",
  "loan payments",
  "credit memo",
  "payment",
  "payments",
  "payment thank you",
  "thank you",
  "cash advance",
  "cash adv",
  "transfer",
  "transfers",
]);

function isGenericMerchantClean(value: string) {
  const keyed = typeKey(value);
  if (GENERIC_MERCHANT_CLEANS.has(keyed)) return true;
  // Type aliases like "loan payment" → Personal Financing are labels, not vendors.
  if (TYPE_ALIASES[keyed]) return true;
  const singular = singularCategoryKey(value);
  return Boolean(
    GENERIC_MERCHANT_CLEANS.has(singular) || TYPE_ALIASES[singular],
  );
}

type RankBucket = { spend: number; count: number };

function emptyBucket(): RankBucket {
  return { spend: 0, count: 0 };
}

function addRank(
  map: Map<string, RankBucket>,
  name: string,
  spendDelta: number,
  countDelta = 1,
) {
  const cur = map.get(name) ?? emptyBucket();
  cur.spend += spendDelta;
  cur.count += countDelta;
  map.set(name, cur);
}

function rankMap(map: Map<string, RankBucket>, limit = 10) {
  return rankAll(map).slice(0, limit);
}

function rankAll(map: Map<string, RankBucket>): AnalysisRankedItem[] {
  return [...map.entries()]
    .map(([name, bucket]) => ({
      name,
      spend: roundMoney(bucket.spend),
      count: bucket.count,
    }))
    .filter((item) => item.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

function rankSpreads(map: Map<string, RankBucket>): AnalysisRankedItem[] {
  return rankAll(map).sort(
    (a, b) =>
      (SPREAD_ORDER.get(a.name as SpreadName) ?? 99) -
      (SPREAD_ORDER.get(b.name as SpreadName) ?? 99),
  );
}

function vendorsByName(
  names: string[],
  nested: Map<string, Map<string, RankBucket>>,
  limit = 10,
) {
  const next: Record<string, AnalysisRankedItem[]> = {};
  for (const name of names) {
    next[name] = rankAll(nested.get(name) ?? new Map()).slice(0, limit);
  }
  return next;
}

function splitNamedAndOther(ranked: AnalysisRankedItem[]) {
  const total = ranked.reduce((sum, item) => sum + item.spend, 0);
  if (ranked.length === 0 || total <= 0) {
    return {
      named: [] as AnalysisRankedItem[],
      other: [] as AnalysisRankedItem[],
    };
  }
  if (ranked.length === 1) {
    return { named: ranked, other: [] as AnalysisRankedItem[] };
  }

  const named: AnalysisRankedItem[] = [];
  let cumulative = 0;
  for (const item of ranked) {
    if (named.length > 0 && cumulative / total >= NAMED_SHARE) break;
    named.push(item);
    cumulative += item.spend;
  }
  const namedNames = new Set(named.map((item) => item.name));
  return {
    named,
    other: ranked.filter((item) => !namedNames.has(item.name)),
  };
}

function namedUntilShare(ranked: Array<[string, number]>, total: number) {
  const named = new Set<string>();
  if (total <= 0 || ranked.length === 0) return named;
  if (ranked.length === 1) {
    named.add(ranked[0][0]);
    return named;
  }
  let cumulative = 0;
  for (const [name, amount] of ranked) {
    if (named.size > 0 && cumulative / total >= NAMED_SHARE) break;
    named.add(name);
    cumulative += amount;
  }
  return named;
}

const TYPE_ALIASES: Record<string, string> = {
  "loan payments": "Personal Financing",
  "loan payment": "Personal Financing",
  "student loans": "Student Loans",
  "student loan": "Student Loans",
  "buy now pay later": "BNPL",
  "online retail": "Department & Online Stores",
  "online marketplaces": "Department & Online Stores",
  restaurants: "Dine-In",
  groceries: "Supermarkets",
  delivery: "Food Delivery",
  "gas stations": "Gas Stations",
  "e-transfer": "Interac e-Transfer",
  remittance: "Remittances",
  "international remittance": "Remittances",
  "interest charges": "Overdraft & Interest",
  interest: "Overdraft & Interest",
  saas: "Productivity & Creative",
  "hair salons and barbers": "Barbers & Salons",
  "hair salon": "Barbers & Salons",
  "hair salons": "Barbers & Salons",
  barber: "Barbers & Salons",
  barbers: "Barbers & Salons",
  gyms: "Gym Memberships",
  paycheck: "Salary & Wages",
  payroll: "Salary & Wages",
};

function typeKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function aliasTypeLabel(raw: string) {
  const keyed = typeKey(raw);
  const singular = singularCategoryKey(raw);
  const direct = TYPE_ALIASES[keyed] ?? TYPE_ALIASES[singular];
  if (direct) return direct;
  for (const [from, to] of Object.entries(TYPE_ALIASES)) {
    if (singularCategoryKey(from) === singular) return to;
  }
  return titleCase(singular || keyed);
}

function spendTypeLabel(
  typeName: string | null,
  categoryDetailed: string | null,
  category: string,
) {
  if (typeName?.trim()) {
    const trimmed = typeName.trim();
    if (
      typeKey(trimmed) !== typeKey(category) &&
      singularCategoryKey(trimmed) !== singularCategoryKey(category)
    ) {
      return trimmed;
    }
  }
  const raw = categoryDetailed?.trim();
  if (!raw) return "Unspecified";
  const mapped = aliasTypeLabel(raw);
  if (
    typeKey(mapped) !== typeKey(category) &&
    singularCategoryKey(mapped) !== singularCategoryKey(category)
  ) {
    return mapped;
  }
  return titleCase(raw);
}

function nestedAdd(
  root: Map<string, Map<string, RankBucket>>,
  outer: string,
  inner: string,
  spendDelta: number,
  countDelta = 1,
) {
  const innerMap = root.get(outer) ?? new Map<string, RankBucket>();
  addRank(innerMap, inner, spendDelta, countDelta);
  root.set(outer, innerMap);
}

function nestedMonthAdd(
  root: Map<string, Map<string, Map<string, number>>>,
  category: string,
  type: string,
  month: string,
  delta: number,
) {
  const byType = root.get(category) ?? new Map<string, Map<string, number>>();
  const byMonth = byType.get(type) ?? new Map<string, number>();
  byMonth.set(month, (byMonth.get(month) ?? 0) + delta);
  byType.set(type, byMonth);
  root.set(category, byType);
}

function uniqueSeriesKeys(labels: string[]) {
  const used = new Set<string>();
  return labels.map((label) => {
    let key = chartKey(label);
    let n = 2;
    while (used.has(key)) {
      key = `${chartKey(label)}_${n}`;
      n += 1;
    }
    used.add(key);
    return { key, label };
  });
}

function addMonthSpend(
  spendByLabel: Map<string, Map<string, number>>,
  label: string,
  month: string,
  delta: number,
) {
  const byMonth = spendByLabel.get(label) ?? new Map<string, number>();
  byMonth.set(month, (byMonth.get(month) ?? 0) + delta);
  spendByLabel.set(label, byMonth);
}

function buildStackedSeries(
  periodKeys: string[],
  spendByLabel: Map<string, Map<string, number>>,
  ranked: AnalysisRankedItem[],
  period: AnalysisPeriod,
) {
  const { named, other } = splitNamedAndOther(ranked);
  const usedKeys = new Set<string>();
  const topSeries = named.map((item) => {
    let key = chartKey(item.name);
    let n = 2;
    while (usedKeys.has(key)) {
      key = `${chartKey(item.name)}_${n}`;
      n += 1;
    }
    usedKeys.add(key);
    return { key, label: item.name };
  });
  const topByLabel = new Map(topSeries.map((item) => [item.label, item.key]));
  const series =
    other.length > 0
      ? [...topSeries, { key: OTHER_KEY, label: OTHER }]
      : topSeries;

  const monthly = periodKeys.map((month) => {
    const row: Record<string, string | number> = {
      month,
      label: periodLabel(month, period),
    };
    for (const entry of series) row[entry.key] = 0;
    for (const [name, byMonth] of spendByLabel) {
      const amount = byMonth.get(month) ?? 0;
      if (amount === 0) continue;
      const key = topByLabel.get(name) ?? OTHER_KEY;
      if (!(key in row)) continue;
      row[key] = roundMoney(Math.max(0, Number(row[key] ?? 0) + amount));
    }
    return row;
  });

  const otherByPeriod: Record<string, AnalysisRankedItem[]> = {};
  for (const month of periodKeys) {
    const items = other
      .map((item) => ({
        name: item.name,
        spend: roundMoney(spendByLabel.get(item.name)?.get(month) ?? 0),
        count: item.count,
      }))
      .filter((item) => item.spend > 0);
    if (items.length > 0) otherByPeriod[month] = items;
  }

  return { series, monthly, other, otherByPeriod };
}

/**
 * 50/30/20 mix: Needs / Wants / Savings plus Surplus.
 * Surplus = max(0, income − Needs − Wants − Savings) for that period.
 * Income itself is a separate Spread row on the breakdown chart.
 */
function buildSpreadMixSeries(
  periodKeys: string[],
  spendByLabel: Map<string, Map<string, number>>,
  incomeByPeriod: Map<string, number>,
  period: AnalysisPeriod,
) {
  const series = [
    { key: "needs", label: "Needs" },
    { key: "wants", label: "Wants" },
    { key: "savings", label: "Savings" },
    { key: "surplus", label: "Surplus" },
  ] as const;
  const spendKeys: Array<{
    name: Exclude<SpreadName, "Income">;
    key: "needs" | "wants" | "savings";
  }> = [
    { name: "Needs", key: "needs" },
    { name: "Wants", key: "wants" },
    { name: "Savings", key: "savings" },
  ];

  const monthly = periodKeys.map((month) => {
    const row: Record<string, string | number> = {
      month,
      label: periodLabel(month, period),
      needs: 0,
      wants: 0,
      savings: 0,
      surplus: 0,
    };
    let spreadSpend = 0;
    for (const { name, key } of spendKeys) {
      const amount = Math.max(0, spendByLabel.get(name)?.get(month) ?? 0);
      row[key] = roundMoney(amount);
      spreadSpend += amount;
    }
    const income = Math.max(0, incomeByPeriod.get(month) ?? 0);
    row.surplus = roundMoney(Math.max(0, income - spreadSpend));
    return row;
  });

  return {
    series: series.map((item) => ({ key: item.key, label: item.label })),
    monthly,
    other: [] as AnalysisRankedItem[],
    otherByPeriod: {} as Record<string, AnalysisRankedItem[]>,
  };
}

function nestedItemsByPeriod(
  periodKeys: string[],
  nestedMonth: Map<string, Map<string, Map<string, number>>>,
  outerToKey: Map<string, string>,
) {
  const result: Record<string, Record<string, AnalysisRankedItem[]>> = {};
  for (const month of periodKeys) {
    const byKey = new Map<string, Map<string, number>>();
    for (const [outer, inners] of nestedMonth) {
      const key = outerToKey.get(outer);
      if (!key) continue;
      const bucket = byKey.get(key) ?? new Map<string, number>();
      for (const [inner, byMonth] of inners) {
        const amount = byMonth.get(month) ?? 0;
        if (amount === 0) continue;
        bucket.set(inner, (bucket.get(inner) ?? 0) + amount);
      }
      if (bucket.size > 0) byKey.set(key, bucket);
    }
    const named: Record<string, AnalysisRankedItem[]> = {};
    for (const [key, bucket] of byKey) {
      const items = [...bucket.entries()]
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, spend]) => ({
          name,
          spend: roundMoney(spend),
          count: 0,
        }));
      if (items.length > 0) named[key] = items;
    }
    if (Object.keys(named).length > 0) result[month] = named;
  }
  return result;
}

function buildNestedStackedBars(
  outers: AnalysisRankedItem[],
  nested: Map<string, Map<string, RankBucket>>,
  outerLimit: number,
) {
  const limited = outers.slice(0, outerLimit).filter((item) => item.spend > 0);
  if (limited.length === 0) {
    return { rows: [], series: [], otherByRow: {} };
  }

  const globalSegmentSpend = new Map<string, number>();
  const topSegmentsByOuter = new Map<string, Set<string>>();

  for (const outer of limited) {
    const inner = nested.get(outer.name) ?? new Map();
    const rankedInner = [...inner.entries()]
      .filter(([, bucket]) => bucket.spend > 0)
      .map(([segment, bucket]) => [segment, bucket.spend] as [string, number])
      .sort((a, b) => b[1] - a[1]);

    for (const [segment, amount] of rankedInner) {
      globalSegmentSpend.set(
        segment,
        (globalSegmentSpend.get(segment) ?? 0) + amount,
      );
    }

    const rowTotal = rankedInner.reduce((sum, [, amount]) => sum + amount, 0);
    topSegmentsByOuter.set(outer.name, namedUntilShare(rankedInner, rowTotal));
  }

  let hasOther = false;
  for (const outer of limited) {
    const inner = nested.get(outer.name) ?? new Map();
    const topSet = topSegmentsByOuter.get(outer.name) ?? new Set<string>();
    for (const [segment, bucket] of inner) {
      if (bucket.spend > 0 && !topSet.has(segment)) {
        hasOther = true;
        break;
      }
    }
    if (hasOther) break;
  }

  const segmentUnion = new Set<string>();
  for (const topSet of topSegmentsByOuter.values()) {
    for (const segment of topSet) segmentUnion.add(segment);
  }

  let seriesLabels = [...segmentUnion].sort(
    (a, b) =>
      (globalSegmentSpend.get(b) ?? 0) - (globalSegmentSpend.get(a) ?? 0),
  );
  if (hasOther) seriesLabels.push(OTHER);

  const series = uniqueSeriesKeys(seriesLabels);
  const keyByLabel = new Map(series.map((item) => [item.label, item.key]));

  const rows = limited.map((outer) => {
    const row: Record<string, string | number> = {
      name: outer.name,
      spend: outer.spend,
    };
    for (const entry of series) row[entry.key] = 0;

    const inner = nested.get(outer.name) ?? new Map();
    const topSet = topSegmentsByOuter.get(outer.name) ?? new Set<string>();

    for (const [segment, bucket] of inner) {
      if (bucket.spend <= 0) continue;
      const label = topSet.has(segment) ? segment : OTHER;
      const key = keyByLabel.get(label);
      if (!key) continue;
      row[key] = roundMoney(Number(row[key] ?? 0) + bucket.spend);
    }
    return row;
  });

  const otherByRow: Record<string, AnalysisRankedItem[]> = {};
  for (const outer of limited) {
    const inner = nested.get(outer.name) ?? new Map();
    const topSet = topSegmentsByOuter.get(outer.name) ?? new Set<string>();
    const leftovers = [...inner.entries()]
      .filter(([segment, bucket]) => bucket.spend > 0 && !topSet.has(segment))
      .sort((a, b) => b[1].spend - a[1].spend)
      .map(([name, bucket]) => ({
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      }));
    if (leftovers.length > 0) otherByRow[outer.name] = leftovers;
  }

  return { rows, series, otherByRow };
}

function emptyAnalysis(
  range: AnalysisRange,
  period: AnalysisPeriod,
): AnalysisData {
  return {
    currency: "CAD",
    range,
    period,
    earliestDate: null,
    latestDate: null,
    transactionCount: 0,
    summary: {
      totalSpend: 0,
      totalIncome: 0,
      net: 0,
      avgPeriodSpend: 0,
      peakSpendPeriod: null,
      peakSpendAmount: 0,
      internalTransfers: 0,
      transferCount: 0,
      spendCount: 0,
      transactionCount: 0,
      transactionsPerPeriod: 0,
      incomePerPeriod: 0,
      refunds: 0,
      inboundTransfersIgnored: 0,
    },
    monthly: [],
    txnPeeks: {},
    sections: [],
    sectionMonthly: [],
    sectionSeries: [],
    sectionOther: [],
    sectionOtherByPeriod: {},
    sectionStacked: { rows: [], series: [] },
    merchantsBySection: {},
    categoriesBySection: {},
    merchantsByCategory: {},
    spreads: [],
    spreadMonthly: [],
    spreadSeries: [],
    spreadOther: [],
    spreadOtherByPeriod: {},
    spreadStacked: { rows: [], series: [] },
    merchantsBySpread: {},
    categoriesBySpread: {},
    subcategories: [],
    subcategoryMonthly: [],
    subcategorySeries: [],
    subcategoryOther: [],
    subcategoryOtherByPeriod: {},
    subcategoryStacked: { rows: [], series: [] },
    subcategoryBreakdowns: [],
    tags: [],
    tagMonthly: [],
    tagSeries: [],
    tagOther: [],
    tagOtherByPeriod: {},
    tagCategoryByPeriod: {},
    tagStacked: { rows: [], series: [] },
    tagBreakdowns: [],
    types: [],
    typeMonthly: [],
    typeSeries: [],
    typeOther: [],
    typeOtherByPeriod: {},
    typeCategoryByPeriod: {},
    typeStacked: { rows: [], series: [] },
    typeBreakdowns: [],
    categories: [],
    categoryMonthly: [],
    categorySeries: [],
    categoryOther: [],
    categoryOtherByPeriod: {},
    categoryStacked: { rows: [], series: [] },
    breakdowns: [],
    merchants: [],
    merchantMonthly: [],
    merchantSeries: [],
    merchantOther: [],
    merchantOtherByPeriod: {},
    merchantStacked: { rows: [], series: [] },
    merchantBreakdowns: [],
    places: [],
    channels: [],
    weekdays: [],
    accounts: [],
    weekendSplit: [],
    ticketSizes: [],
    dayOfMonth: [],
    habitMerchants: [],
    countries: [],
  };
}

export function computeAnalysis(args: {
  range: AnalysisRange;
  period: AnalysisPeriod;
  rows: AnalysisSourceRow[];
  earliestDate: string | null;
  latestDate: string | null;
}): AnalysisData {
  const { range, period, rows: filtered, earliestDate, latestDate } = args;

  if (!latestDate || filtered.length === 0) {
    return emptyAnalysis(range, period);
  }

  const startDate =
    range !== "all" ? rangeStartDate(latestDate, range) : earliestDate;

const currency =
      filtered.find((row) => row.currencyCode)?.currencyCode ?? "CAD";

    const filteredDates = filtered
      .map((row) => row.postedDate)
      .filter(Boolean)
      .sort();
    const rangeEarliest = filteredDates[0] ?? null;
    const rangeLatest = filteredDates[filteredDates.length - 1] ?? null;

    const monthlyMap = new Map<
      string,
      { spend: number; income: number; transfers: number }
    >();
    const categorySpend = new Map<string, RankBucket>();
    const categoryMonthSpend = new Map<string, Map<string, number>>();
    const sectionSpend = new Map<string, RankBucket>();
    const sectionMonthSpend = new Map<string, Map<string, number>>();
    const spreadSpend = new Map<string, RankBucket>();
    const spreadMonthSpend = new Map<string, Map<string, number>>();
    const subcategorySpend = new Map<string, RankBucket>();
    const subcategoryMonthSpend = new Map<string, Map<string, number>>();
    const merchantSpend = new Map<string, RankBucket>();
    const placeSpend = new Map<string, RankBucket>();
    const channelSpend = new Map<string, RankBucket>();
    const weekdaySpend = new Map<string, RankBucket>();
    const accountSpend = new Map<string, RankBucket>();
    const weekendSpend = new Map<string, RankBucket>();
    const ticketSizeSpend = new Map<string, RankBucket>();
    const dayOfMonthSpend = new Map<string, RankBucket>();
    const countrySpend = new Map<string, RankBucket>();
    const habitMerchantSpend = new Map<string, RankBucket>();
    const typeByCategory = new Map<string, Map<string, RankBucket>>();
    const categoryBySection = new Map<string, Map<string, RankBucket>>();
    const categoryBySpread = new Map<string, Map<string, RankBucket>>();
    const merchantByCategory = new Map<string, Map<string, RankBucket>>();
    const vendorBySection = new Map<string, Map<string, RankBucket>>();
    const vendorBySpread = new Map<string, Map<string, RankBucket>>();
    const vendorByCategory = new Map<string, Map<string, RankBucket>>();
    const merchantBySubcategory = new Map<string, Map<string, RankBucket>>();
    const typeMonthByCategory = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const merchantMonthBySubcategory = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const tagSpend = new Map<string, RankBucket>();
    const tagMonthSpend = new Map<string, Map<string, number>>();
    const merchantByTag = new Map<string, Map<string, RankBucket>>();
    const merchantMonthByTag = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const categoryByTag = new Map<string, Map<string, RankBucket>>();
    const categoryMonthByTag = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const typeSpend = new Map<string, RankBucket>();
    const typeMonthSpend = new Map<string, Map<string, number>>();
    const merchantByType = new Map<string, Map<string, RankBucket>>();
    const merchantMonthByType = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const categoryByType = new Map<string, Map<string, RankBucket>>();
    const categoryMonthByType = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const merchantMonthSpend = new Map<string, Map<string, number>>();
    const subcategoryByMerchant = new Map<string, Map<string, RankBucket>>();
    const subcategoryMonthByMerchant = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const txnPeekMap = new Map<string, AnalysisTxnPeek[]>();

    let totalSpend = 0;
    let totalIncome = 0;
    let internalTransfers = 0;
    let transferCount = 0;
    let spendCount = 0;
    let refunds = 0;
    let inboundTransfersIgnored = 0;

    function addCategory(
      name: string,
      month: string,
      spendDelta: number,
      countDelta = 1,
    ) {
      addRank(categorySpend, name, spendDelta, countDelta);
      const byMonth = categoryMonthSpend.get(name) ?? new Map();
      byMonth.set(month, (byMonth.get(month) ?? 0) + spendDelta);
      categoryMonthSpend.set(name, byMonth);
    }

    for (const row of filtered) {
      const major = row.amount;
      const amountMinor = Math.round(major * 100);
      const abs = Math.abs(major);
      if (abs === 0) continue;

      const month = periodKey(row.postedDate, period);
      const bucket = monthlyMap.get(month) ?? {
        spend: 0,
        income: 0,
        transfers: 0,
      };
      const signals = {
        amountMinor,
        description: row.description,
        accountType: row.accountType,
        categoryPrimary: row.categoryPrimary,
        categoryDetailed: row.categoryDetailed,
        sectionName: row.sectionName,
        categoryName: row.categoryName,
        typeName: row.typeName,
        transactionCode: row.transactionCode,
      };
      const kind = classifyCashFlow(signals);
      const category = spendCategoryLabel(
        signals,
        resolveCategory({
          taxonomyCategory: row.categoryName,
          categoryDetailed: row.categoryDetailed,
          categoryPrimary: row.categoryPrimary,
        }),
      );

      if (kind === "transfer_out") {
        bucket.transfers += abs;
        internalTransfers += abs;
        transferCount += 1;
      } else if (kind === "transfer_in") {
        inboundTransfersIgnored += abs;
      } else if (kind === "spend") {
        bucket.spend += abs;
        totalSpend += abs;
        spendCount += 1;
        addCategory(category, month, abs);
        const place = placeLabel(row.city, row.region);
        if (place) addRank(placeSpend, place, abs);
        const country = countryLabel(row.country);
        if (country) addRank(countrySpend, country, abs);
        addRank(
          channelSpend,
          channelLabel(row.paymentChannel, row.enrichmentChannel),
          abs,
        );
        const weekday = spendWeekday(row.postedDate, row.authorizedDate);
        addRank(weekdaySpend, weekday, abs);
        addRank(weekendSpend, weekendPart(weekday), abs);
        addRank(ticketSizeSpend, ticketSizeLabel(abs), abs);
        const dayLabel = dayOfMonthLabel(
          row.authorizedDate?.trim() || row.postedDate,
        );
        if (dayLabel) addRank(dayOfMonthSpend, dayLabel, abs);
        addRank(
          accountSpend,
          row.accountName?.trim() || "Unknown account",
          abs,
        );
        const type = spendTypeLabel(
          row.typeName,
          row.categoryDetailed,
          category,
        );
        const section = row.sectionName?.trim() || "Uncategorized";
        addRank(sectionSpend, section, abs);
        addMonthSpend(sectionMonthSpend, section, month, abs);
        addRank(subcategorySpend, type, abs);
        addMonthSpend(subcategoryMonthSpend, type, month, abs);
        const merchant = merchantLabel({
          companyName: row.companyName ?? row.brandName ?? null,
          merchantClean: row.merchantClean,
          description: row.description,
        });
        const cleanMerchant = merchantCleanLabel({
          merchantClean: row.merchantClean,
          description: row.description,
          companyName: row.companyName ?? row.brandName ?? null,
          brandName: row.brandName,
        });
        const spread = resolveSpreadName({
          spreadName: row.spreadName,
          sectionName: row.sectionName,
          categoryName: row.categoryName,
          subcategoryName: row.typeName,
        });
        if (spread) {
          addRank(spreadSpend, spread, abs);
          addMonthSpend(spreadMonthSpend, spread, month, abs);
          nestedAdd(categoryBySpread, spread, category, abs);
          nestedAdd(vendorBySpread, spread, cleanMerchant, abs);
        }
        addRank(merchantSpend, cleanMerchant, abs);
        addRank(habitMerchantSpend, cleanMerchant, abs);
        addMonthSpend(merchantMonthSpend, cleanMerchant, month, abs);
        nestedAdd(subcategoryByMerchant, cleanMerchant, type, abs);
        nestedMonthAdd(
          subcategoryMonthByMerchant,
          cleanMerchant,
          type,
          month,
          abs,
        );
        nestedAdd(typeByCategory, category, type, abs);
        nestedAdd(categoryBySection, section, category, abs);
        nestedAdd(merchantByCategory, category, merchant, abs);
        nestedAdd(vendorBySection, section, cleanMerchant, abs);
        nestedAdd(vendorByCategory, category, cleanMerchant, abs);
        nestedAdd(merchantBySubcategory, type, cleanMerchant, abs);
        nestedMonthAdd(typeMonthByCategory, category, type, month, abs);
        nestedMonthAdd(
          merchantMonthBySubcategory,
          type,
          cleanMerchant,
          month,
          abs,
        );
        for (const tag of splitTags(row.tags)) {
          addRank(tagSpend, tag, abs);
          addMonthSpend(tagMonthSpend, tag, month, abs);
          nestedAdd(merchantByTag, tag, cleanMerchant, abs);
          nestedMonthAdd(merchantMonthByTag, tag, cleanMerchant, month, abs);
          nestedAdd(categoryByTag, tag, category, abs);
          nestedMonthAdd(categoryMonthByTag, tag, category, month, abs);
        }
        for (const typeLabel of splitTags(row.kind)) {
          addRank(typeSpend, typeLabel, abs);
          addMonthSpend(typeMonthSpend, typeLabel, month, abs);
          nestedAdd(merchantByType, typeLabel, cleanMerchant, abs);
          nestedMonthAdd(
            merchantMonthByType,
            typeLabel,
            cleanMerchant,
            month,
            abs,
          );
          nestedAdd(categoryByType, typeLabel, category, abs);
          nestedMonthAdd(categoryMonthByType, typeLabel, category, month, abs);
        }
        {
          const peek: AnalysisTxnPeek = {
            date: row.postedDate,
            description:
              row.description?.trim() ||
              row.merchantClean?.trim() ||
              cleanMerchant,
            amount: abs,
          };
          pushPeek(txnPeekMap, peekKey("section", section), peek);
          pushPeek(txnPeekMap, peekKey("category", category), peek);
          pushPeek(txnPeekMap, peekKey("subcategory", type), peek);
          pushPeek(txnPeekMap, peekKey("merchant", cleanMerchant), peek);
          pushPeek(
            txnPeekMap,
            peekKey("section-category", section, category),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("section-merchant", section, cleanMerchant),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("category-merchant", category, cleanMerchant),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("subcategory-merchant", type, cleanMerchant),
            peek,
          );
          if (spread) {
            pushPeek(txnPeekMap, peekKey("spread", spread), peek);
            pushPeek(
              txnPeekMap,
              peekKey("spread-category", spread, category),
              peek,
            );
            pushPeek(
              txnPeekMap,
              peekKey("spread-merchant", spread, cleanMerchant),
              peek,
            );
          }
          for (const tag of splitTags(row.tags)) {
            pushPeek(txnPeekMap, peekKey("tag", tag), peek);
            pushPeek(
              txnPeekMap,
              peekKey("tag-merchant", tag, cleanMerchant),
              peek,
            );
          }
          for (const typeLabel of splitTags(row.kind)) {
            pushPeek(txnPeekMap, peekKey("type", typeLabel), peek);
            pushPeek(
              txnPeekMap,
              peekKey("type-merchant", typeLabel, cleanMerchant),
              peek,
            );
          }
        }
      } else if (kind === "refund") {
        bucket.spend -= abs;
        totalSpend -= abs;
        refunds += abs;
        addCategory(category, month, -abs);
        const type = spendTypeLabel(
          row.typeName,
          row.categoryDetailed,
          category,
        );
        const section = row.sectionName?.trim() || "Uncategorized";
        const cleanMerchant = merchantCleanLabel({
          merchantClean: row.merchantClean,
          description: row.description,
          companyName: row.companyName ?? row.brandName ?? null,
          brandName: row.brandName,
        });
        addRank(merchantSpend, cleanMerchant, -abs);
        addMonthSpend(merchantMonthSpend, cleanMerchant, month, -abs);
        nestedAdd(subcategoryByMerchant, cleanMerchant, type, -abs);
        nestedMonthAdd(
          subcategoryMonthByMerchant,
          cleanMerchant,
          type,
          month,
          -abs,
        );
        addRank(sectionSpend, section, -abs);
        addMonthSpend(sectionMonthSpend, section, month, -abs);
        addRank(subcategorySpend, type, -abs);
        addMonthSpend(subcategoryMonthSpend, type, month, -abs);
        const spread = resolveSpreadName({
          spreadName: row.spreadName,
          sectionName: row.sectionName,
          categoryName: row.categoryName,
          subcategoryName: row.typeName,
        });
        if (spread) {
          addRank(spreadSpend, spread, -abs);
          addMonthSpend(spreadMonthSpend, spread, month, -abs);
          nestedAdd(categoryBySpread, spread, category, -abs);
          nestedAdd(vendorBySpread, spread, cleanMerchant, -abs);
        }
        nestedAdd(typeByCategory, category, type, -abs);
        nestedAdd(categoryBySection, section, category, -abs);
        nestedAdd(vendorBySection, section, cleanMerchant, -abs);
        nestedAdd(vendorByCategory, category, cleanMerchant, -abs);
        nestedAdd(merchantBySubcategory, type, cleanMerchant, -abs);
        nestedMonthAdd(
          merchantMonthBySubcategory,
          type,
          cleanMerchant,
          month,
          -abs,
        );
        for (const tag of splitTags(row.tags)) {
          addRank(tagSpend, tag, -abs);
          addMonthSpend(tagMonthSpend, tag, month, -abs);
          nestedAdd(merchantByTag, tag, cleanMerchant, -abs);
          nestedMonthAdd(merchantMonthByTag, tag, cleanMerchant, month, -abs);
          nestedAdd(categoryByTag, tag, category, -abs);
          nestedMonthAdd(categoryMonthByTag, tag, category, month, -abs);
        }
        for (const typeLabel of splitTags(row.kind)) {
          addRank(typeSpend, typeLabel, -abs);
          addMonthSpend(typeMonthSpend, typeLabel, month, -abs);
          nestedAdd(merchantByType, typeLabel, cleanMerchant, -abs);
          nestedMonthAdd(
            merchantMonthByType,
            typeLabel,
            cleanMerchant,
            month,
            -abs,
          );
          nestedAdd(categoryByType, typeLabel, category, -abs);
          nestedMonthAdd(categoryMonthByType, typeLabel, category, month, -abs);
        }
        {
          const peek: AnalysisTxnPeek = {
            date: row.postedDate,
            description:
              row.description?.trim() ||
              row.merchantClean?.trim() ||
              cleanMerchant,
            amount: -abs,
          };
          pushPeek(txnPeekMap, peekKey("section", section), peek);
          pushPeek(txnPeekMap, peekKey("category", category), peek);
          pushPeek(txnPeekMap, peekKey("subcategory", type), peek);
          pushPeek(txnPeekMap, peekKey("merchant", cleanMerchant), peek);
          pushPeek(
            txnPeekMap,
            peekKey("section-category", section, category),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("section-merchant", section, cleanMerchant),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("category-merchant", category, cleanMerchant),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("subcategory-merchant", type, cleanMerchant),
            peek,
          );
          if (spread) {
            pushPeek(txnPeekMap, peekKey("spread", spread), peek);
            pushPeek(
              txnPeekMap,
              peekKey("spread-category", spread, category),
              peek,
            );
            pushPeek(
              txnPeekMap,
              peekKey("spread-merchant", spread, cleanMerchant),
              peek,
            );
          }
          for (const tag of splitTags(row.tags)) {
            pushPeek(txnPeekMap, peekKey("tag", tag), peek);
            pushPeek(
              txnPeekMap,
              peekKey("tag-merchant", tag, cleanMerchant),
              peek,
            );
          }
          for (const typeLabel of splitTags(row.kind)) {
            pushPeek(txnPeekMap, peekKey("type", typeLabel), peek);
            pushPeek(
              txnPeekMap,
              peekKey("type-merchant", typeLabel, cleanMerchant),
              peek,
            );
          }
        }
      } else {
        bucket.income += abs;
        totalIncome += abs;
        const cleanMerchant = merchantCleanLabel({
          merchantClean: row.merchantClean,
          description: row.description,
          companyName: row.companyName ?? row.brandName ?? null,
          brandName: row.brandName,
        });
        const spread =
          resolveSpreadName({
            spreadName: row.spreadName,
            sectionName: row.sectionName,
            categoryName: row.categoryName,
            subcategoryName: row.typeName,
          }) ?? "Income";
        addRank(spreadSpend, spread, abs);
        addMonthSpend(spreadMonthSpend, spread, month, abs);
        nestedAdd(categoryBySpread, spread, category, abs);
        nestedAdd(vendorBySpread, spread, cleanMerchant, abs);
        {
          const peek: AnalysisTxnPeek = {
            date: row.postedDate,
            description:
              row.description?.trim() ||
              row.merchantClean?.trim() ||
              cleanMerchant,
            amount: -abs,
          };
          pushPeek(txnPeekMap, peekKey("spread", spread), peek);
          pushPeek(
            txnPeekMap,
            peekKey("spread-category", spread, category),
            peek,
          );
          pushPeek(
            txnPeekMap,
            peekKey("spread-merchant", spread, cleanMerchant),
            peek,
          );
        }
      }

      monthlyMap.set(month, bucket);
    }

    const monthKeys =
      startDate && latestDate
        ? periodsBetween(startDate, latestDate, period)
        : [...monthlyMap.keys()].sort();

    const monthly = monthKeys.map((month) => {
      const bucket = monthlyMap.get(month) ?? {
        spend: 0,
        income: 0,
        transfers: 0,
      };
      return {
        month,
        label: periodLabel(month, period),
        spend: roundMoney(bucket.spend),
        income: roundMoney(bucket.income),
        transfers: roundMoney(bucket.transfers),
      };
    });

    let peakSpendPeriod: string | null = null;
    let peakSpendAmount = 0;
    for (const point of monthly) {
      if (point.spend > peakSpendAmount) {
        peakSpendAmount = point.spend;
        peakSpendPeriod = point.label;
      }
    }

    const periodsWithSpend = monthly.filter((point) => point.spend > 0).length;
    const avgPeriodSpend =
      periodsWithSpend > 0 ? totalSpend / periodsWithSpend : 0;
    const periodBucketCount = Math.max(monthKeys.length, 1);
    const transactionsPerPeriod = filtered.length / periodBucketCount;
    const incomePerPeriod = totalIncome / periodBucketCount;

    const categories = rankAll(categorySpend);
    const sections = rankAll(sectionSpend);
    const spreads = rankSpreads(spreadSpend);
    const subcategories = rankAll(subcategorySpend);

    const {
      series: sectionSeries,
      monthly: sectionMonthly,
      other: sectionOther,
      otherByPeriod: sectionOtherByPeriod,
    } = buildStackedSeries(monthKeys, sectionMonthSpend, sections, period);
    const incomeByPeriod = new Map(
      monthKeys.map((key) => [key, monthlyMap.get(key)?.income ?? 0]),
    );
    const {
      series: spreadSeries,
      monthly: spreadMonthly,
      other: spreadOther,
      otherByPeriod: spreadOtherByPeriod,
    } = buildSpreadMixSeries(
      monthKeys,
      spreadMonthSpend,
      incomeByPeriod,
      period,
    );
    const {
      series: subcategorySeries,
      monthly: subcategoryMonthly,
      other: subcategoryOther,
      otherByPeriod: subcategoryOtherByPeriod,
    } = buildStackedSeries(
      monthKeys,
      subcategoryMonthSpend,
      subcategories,
      period,
    );

    const tags = rankAll(tagSpend);

    const {
      series: tagSeries,
      monthly: tagMonthly,
      other: tagOther,
      otherByPeriod: tagOtherByPeriod,
    } = buildStackedSeries(monthKeys, tagMonthSpend, tags, period);

    const types = rankAll(typeSpend);

    const {
      series: typeSeries,
      monthly: typeMonthly,
      other: typeOther,
      otherByPeriod: typeOtherByPeriod,
    } = buildStackedSeries(monthKeys, typeMonthSpend, types, period);

    const merchants = rankAll(merchantSpend);

    const {
      series: merchantSeries,
      monthly: merchantMonthly,
      other: merchantOther,
      otherByPeriod: merchantOtherByPeriod,
    } = buildStackedSeries(monthKeys, merchantMonthSpend, merchants, period);

    const categoryStacked = buildNestedStackedBars(
      categories,
      typeByCategory,
      TOP_STACKED_CATEGORY_ROWS,
    );
    const sectionStacked = buildNestedStackedBars(
      sections,
      categoryBySection,
      TOP_STACKED_SECTION_ROWS,
    );
    const spreadStacked = buildNestedStackedBars(
      spreads,
      categoryBySpread,
      TOP_STACKED_SPREAD_ROWS,
    );
    const subcategoryStacked = buildNestedStackedBars(
      subcategories,
      merchantBySubcategory,
      subcategories.length,
    );
    const tagStacked = buildNestedStackedBars(tags, categoryByTag, tags.length);
    const tagKeyByName = new Map(
      tagSeries
        .filter((item) => item.key !== OTHER_KEY)
        .map((item) => [item.label, item.key]),
    );
    const tagCategoryByPeriod = nestedItemsByPeriod(
      monthKeys,
      categoryMonthByTag,
      tagKeyByName,
    );
    const typeStacked = buildNestedStackedBars(
      types,
      categoryByType,
      types.length,
    );
    const typeKeyByName = new Map(
      typeSeries
        .filter((item) => item.key !== OTHER_KEY)
        .map((item) => [item.label, item.key]),
    );
    const typeCategoryByPeriod = nestedItemsByPeriod(
      monthKeys,
      categoryMonthByType,
      typeKeyByName,
    );
    const merchantStacked = buildNestedStackedBars(
      merchants,
      subcategoryByMerchant,
      merchants.length,
    );

    const {
      series: categorySeries,
      monthly: categoryMonthly,
      other: categoryOther,
      otherByPeriod: categoryOtherByPeriod,
    } = buildStackedSeries(monthKeys, categoryMonthSpend, categories, period);

    const weekdays = WEEKDAYS.map((name) => {
      const bucket = weekdaySpend.get(name) ?? emptyBucket();
      return {
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      };
    });

    const weekendSplit = (["Weekday", "Weekend"] as const).map((name) => {
      const bucket = weekendSpend.get(name) ?? emptyBucket();
      return {
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      };
    });

    const ticketSizes = TICKET_SIZE_ORDER.map((name) => {
      const bucket = ticketSizeSpend.get(name) ?? emptyBucket();
      return {
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      };
    }).filter((item) => item.count > 0 || item.spend > 0);

    const dayOfMonth = Array.from({ length: 31 }, (_, index) => {
      const name = String(index + 1);
      const bucket = dayOfMonthSpend.get(name) ?? emptyBucket();
      return {
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      };
    });

    const habitMerchants = [...habitMerchantSpend.entries()]
      .map(([name, bucket]) => ({
        name,
        spend: roundMoney(bucket.spend),
        count: bucket.count,
      }))
      .filter((item) => item.count >= 6 && item.spend > 0)
      .sort((a, b) => b.count - a.count || b.spend - a.spend)
      .slice(0, 12);

    const breakdowns = categories.slice(0, 12).map((item) => {
      const types = rankAll(typeByCategory.get(item.name) ?? new Map());
      const {
        series: typeSeries,
        monthly: typeMonthly,
        other,
        otherByPeriod,
      } = buildStackedSeries(
        monthKeys,
        typeMonthByCategory.get(item.name) ?? new Map(),
        types,
        period,
      );
      return {
        category: item.name,
        spend: item.spend,
        types,
        merchants: rankAll(merchantByCategory.get(item.name) ?? new Map()),
        typeSeries,
        typeMonthly,
        other,
        otherByPeriod,
      };
    });

    const subcategoryBreakdowns = subcategories.map((item) => {
      const merchants = rankAll(
        merchantBySubcategory.get(item.name) ?? new Map(),
      );
      const {
        series: merchantSeries,
        monthly: merchantMonthly,
        other,
        otherByPeriod,
      } = buildStackedSeries(
        monthKeys,
        merchantMonthBySubcategory.get(item.name) ?? new Map(),
        merchants,
        period,
      );
      return {
        subcategory: item.name,
        spend: item.spend,
        merchants,
        merchantSeries,
        merchantMonthly,
        other,
        otherByPeriod,
      };
    });

    const tagBreakdowns = tags.map((item) => {
      const merchants = rankAll(merchantByTag.get(item.name) ?? new Map());
      const {
        series: merchantSeries,
        monthly: merchantMonthly,
        other,
        otherByPeriod,
      } = buildStackedSeries(
        monthKeys,
        merchantMonthByTag.get(item.name) ?? new Map(),
        merchants,
        period,
      );
      return {
        tag: item.name,
        spend: item.spend,
        merchants,
        merchantSeries,
        merchantMonthly,
        other,
        otherByPeriod,
      };
    });

    const typeBreakdowns = types.map((item) => {
      const merchants = rankAll(merchantByType.get(item.name) ?? new Map());
      const {
        series: merchantSeries,
        monthly: merchantMonthly,
        other,
        otherByPeriod,
      } = buildStackedSeries(
        monthKeys,
        merchantMonthByType.get(item.name) ?? new Map(),
        merchants,
        period,
      );
      return {
        type: item.name,
        spend: item.spend,
        merchants,
        merchantSeries,
        merchantMonthly,
        other,
        otherByPeriod,
      };
    });

    const merchantBreakdowns = merchants.map((item) => {
      const types = rankAll(subcategoryByMerchant.get(item.name) ?? new Map());
      const {
        series: typeSeries,
        monthly: typeMonthly,
        other,
        otherByPeriod,
      } = buildStackedSeries(
        monthKeys,
        subcategoryMonthByMerchant.get(item.name) ?? new Map(),
        types,
        period,
      );
      return {
        merchant: item.name,
        spend: item.spend,
        types,
        typeSeries,
        typeMonthly,
        other,
        otherByPeriod,
      };
    });

    return {
        currency,
        range,
        period,
        earliestDate: rangeEarliest,
        latestDate: rangeLatest,
        transactionCount: filtered.length,
        summary: {
          totalSpend: roundMoney(totalSpend),
          totalIncome: roundMoney(totalIncome),
          net: roundMoney(totalIncome - totalSpend),
          avgPeriodSpend: roundMoney(avgPeriodSpend),
          peakSpendPeriod,
          peakSpendAmount: roundMoney(peakSpendAmount),
          internalTransfers: roundMoney(internalTransfers),
          transferCount,
          spendCount,
          transactionCount: filtered.length,
          transactionsPerPeriod: roundMoney(transactionsPerPeriod),
          incomePerPeriod: roundMoney(incomePerPeriod),
          refunds: roundMoney(refunds),
          inboundTransfersIgnored: roundMoney(inboundTransfersIgnored),
        },
        monthly,
        txnPeeks: finalizePeeks(txnPeekMap),
        sections,
        sectionMonthly,
        sectionSeries,
        sectionOther,
        sectionOtherByPeriod,
        sectionStacked,
        merchantsBySection: vendorsByName(
          sections.map((item) => item.name),
          vendorBySection,
        ),
        categoriesBySection: vendorsByName(
          sections.map((item) => item.name),
          categoryBySection,
        ),
        merchantsByCategory: vendorsByName(
          categories.map((item) => item.name),
          vendorByCategory,
        ),
        spreads,
        spreadMonthly,
        spreadSeries,
        spreadOther,
        spreadOtherByPeriod,
        spreadStacked,
        merchantsBySpread: vendorsByName(
          spreads.map((item) => item.name),
          vendorBySpread,
        ),
        categoriesBySpread: vendorsByName(
          spreads.map((item) => item.name),
          categoryBySpread,
        ),
        subcategories,
        subcategoryMonthly,
        subcategorySeries,
        subcategoryOther,
        subcategoryOtherByPeriod,
        subcategoryStacked,
        subcategoryBreakdowns,
        tags,
        tagMonthly,
        tagSeries,
        tagOther,
        tagOtherByPeriod,
        tagCategoryByPeriod,
        tagStacked,
        tagBreakdowns,
        types,
        typeMonthly,
        typeSeries,
        typeOther,
        typeOtherByPeriod,
        typeCategoryByPeriod,
        typeStacked,
        typeBreakdowns,
        categories,
        categoryMonthly,
        categorySeries,
        categoryOther,
        categoryOtherByPeriod,
        categoryStacked,
        breakdowns,
        merchants,
        merchantMonthly,
        merchantSeries,
        merchantOther,
        merchantOtherByPeriod,
        merchantStacked,
        merchantBreakdowns,
        places: rankMap(placeSpend, 8),
        channels: rankMap(channelSpend, 6),
        weekdays,
        accounts: rankMap(accountSpend, 8),
        weekendSplit,
        ticketSizes,
        dayOfMonth,
        habitMerchants,
        countries: rankMap(countrySpend, 8),
      };

}
