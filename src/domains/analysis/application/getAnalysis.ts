import { eq } from "drizzle-orm";
import { classifyCashFlow, spendCategoryLabel } from "@/domains/analysis/domain/cashFlow";
import {
  addDays,
  addMonths,
  monthKey,
  periodKey,
  periodLabel,
  periodsBetween,
} from "@/domains/analysis/domain/periods";
import type {
  AnalysisData,
  AnalysisPeriod,
  AnalysisRankedItem,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { singularCategoryKey } from "@/domains/statements/application/categoryVocabulary";
import { splitTags } from "@/domains/transactions/domain/tags";
import { getDb } from "@/shared/db";
import { accounts, transactions } from "@/shared/db/schema";

export type GetAnalysisResult =
  | { ok: true; data: AnalysisData }
  | { ok: false; status: number; error: string };

const TOP_STACKED_CATEGORY_ROWS = 15;
const TOP_STACKED_SECTION_ROWS = 12;
const NAMED_SHARE = 0.85;
const UNCATEGORIZED = "Uncategorized";
const OTHER = "Other";
const OTHER_KEY = "other";

function chartKey(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "category";
}

function rangeStartDate(latestDate: string, range: AnalysisRange) {
  if (range === "all") return null;
  if (range === "1w") return addDays(latestDate, -6);
  if (range === "1m") return addDays(latestDate, -29);

  const monthsBack =
    range === "3m" ? 2 : range === "6m" ? 5 : 11;
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
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "Unknown";
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return WEEKDAYS[(dow + 6) % 7];
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
}) {
  const clean = input.merchantClean?.trim();
  if (clean) return clean;
  const description = input.description?.trim();
  if (!description) return "Unknown";
  return description.replace(/\s+/g, " ").slice(0, 42);
}

function addRank(map: Map<string, number>, name: string, delta: number) {
  map.set(name, (map.get(name) ?? 0) + delta);
}

function rankMap(map: Map<string, number>, limit = 10) {
  return rankAll(map).slice(0, limit);
}

function rankAll(map: Map<string, number>): AnalysisRankedItem[] {
  return [...map.entries()]
    .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
    .filter((item) => item.spend > 0)
    .sort((a, b) => b.spend - a.spend);
}

function splitNamedAndOther(ranked: AnalysisRankedItem[]) {
  const total = ranked.reduce((sum, item) => sum + item.spend, 0);
  if (ranked.length === 0 || total <= 0) {
    return { named: [] as AnalysisRankedItem[], other: [] as AnalysisRankedItem[] };
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

function namedUntilShare(
  ranked: Array<[string, number]>,
  total: number,
) {
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
  root: Map<string, Map<string, number>>,
  outer: string,
  inner: string,
  delta: number,
) {
  const innerMap = root.get(outer) ?? new Map<string, number>();
  innerMap.set(inner, (innerMap.get(inner) ?? 0) + delta);
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
      }))
      .filter((item) => item.spend > 0);
    if (items.length > 0) otherByPeriod[month] = items;
  }

  return { series, monthly, other, otherByPeriod };
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
        .map(([name, spend]) => ({ name, spend: roundMoney(spend) }));
      if (items.length > 0) named[key] = items;
    }
    if (Object.keys(named).length > 0) result[month] = named;
  }
  return result;
}

function buildNestedStackedBars(
  outers: AnalysisRankedItem[],
  nested: Map<string, Map<string, number>>,
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
      .filter(([, amount]) => amount > 0)
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
    for (const [segment, amount] of inner) {
      if (amount > 0 && !topSet.has(segment)) {
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
    (a, b) => (globalSegmentSpend.get(b) ?? 0) - (globalSegmentSpend.get(a) ?? 0),
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

    for (const [segment, amount] of inner) {
      if (amount <= 0) continue;
      const label = topSet.has(segment) ? segment : OTHER;
      const key = keyByLabel.get(label);
      if (!key) continue;
      row[key] = roundMoney(Number(row[key] ?? 0) + amount);
    }
    return row;
  });

  const otherByRow: Record<string, AnalysisRankedItem[]> = {};
  for (const outer of limited) {
    const inner = nested.get(outer.name) ?? new Map();
    const topSet = topSegmentsByOuter.get(outer.name) ?? new Set<string>();
    const leftovers = [...inner.entries()]
      .filter(([segment, amount]) => amount > 0 && !topSet.has(segment))
      .sort((a, b) => b[1] - a[1])
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }));
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
      refunds: 0,
      inboundTransfersIgnored: 0,
    },
    monthly: [],
    sections: [],
    sectionMonthly: [],
    sectionSeries: [],
    sectionOther: [],
    sectionOtherByPeriod: {},
    sectionStacked: { rows: [], series: [] },
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
  };
}

export async function getAnalysis(
  range: AnalysisRange = "12m",
  period: AnalysisPeriod = "monthly",
): Promise<GetAnalysisResult> {
  try {
    const db = getDb();

    const rows = await db
      .select({
        id: transactions.id,
        description: transactions.description,
        accountName: accounts.name,
        accountType: accounts.type,
        amount: transactions.amount,
        currencyCode: transactions.currency,
        postedDate: transactions.posted,
        categoryPrimary: transactions.categoryPrimary,
        categoryDetailed: transactions.categoryDetailed,
        transactionCode: transactions.txnCode,
        paymentChannel: transactions.channel,
        city: transactions.city,
        region: transactions.region,
        merchantClean: transactions.merchantClean,
        enrichmentChannel: transactions.channel,
        sectionName: transactions.section,
        categoryName: transactions.category,
        typeName: transactions.subcategory,
        companyName: transactions.company,
        brandName: transactions.brand,
        tags: transactions.tags,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.accountId, transactions.accountId));

    if (rows.length === 0) {
      return { ok: true, data: emptyAnalysis(range, period) };
    }

    const sortedDates = rows
      .map((row) => row.postedDate)
      .filter(Boolean)
      .sort();
    const earliestDate = sortedDates[0] ?? null;
    const latestDate = sortedDates[sortedDates.length - 1] ?? null;
    const startDate =
      latestDate && range !== "all"
        ? rangeStartDate(latestDate, range)
        : earliestDate;

    const filtered = rows.filter((row) => {
      if (!startDate || range === "all") return true;
      return row.postedDate >= startDate;
    });

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
    const categorySpend = new Map<string, number>();
    const categoryMonthSpend = new Map<string, Map<string, number>>();
    const sectionSpend = new Map<string, number>();
    const sectionMonthSpend = new Map<string, Map<string, number>>();
    const subcategorySpend = new Map<string, number>();
    const subcategoryMonthSpend = new Map<string, Map<string, number>>();
    const merchantSpend = new Map<string, number>();
    const placeSpend = new Map<string, number>();
    const channelSpend = new Map<string, number>();
    const weekdaySpend = new Map<string, number>();
    const accountSpend = new Map<string, number>();
    const typeByCategory = new Map<string, Map<string, number>>();
    const categoryBySection = new Map<string, Map<string, number>>();
    const merchantByCategory = new Map<string, Map<string, number>>();
    const merchantBySubcategory = new Map<string, Map<string, number>>();
    const typeMonthByCategory = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const merchantMonthBySubcategory = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const tagSpend = new Map<string, number>();
    const tagMonthSpend = new Map<string, Map<string, number>>();
    const merchantByTag = new Map<string, Map<string, number>>();
    const merchantMonthByTag = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const categoryByTag = new Map<string, Map<string, number>>();
    const categoryMonthByTag = new Map<
      string,
      Map<string, Map<string, number>>
    >();
    const merchantMonthSpend = new Map<string, Map<string, number>>();
    const subcategoryByMerchant = new Map<string, Map<string, number>>();
    const subcategoryMonthByMerchant = new Map<
      string,
      Map<string, Map<string, number>>
    >();

    let totalSpend = 0;
    let totalIncome = 0;
    let internalTransfers = 0;
    let transferCount = 0;
    let spendCount = 0;
    let refunds = 0;
    let inboundTransfersIgnored = 0;

    function addCategory(name: string, month: string, delta: number) {
      categorySpend.set(name, (categorySpend.get(name) ?? 0) + delta);
      const byMonth = categoryMonthSpend.get(name) ?? new Map();
      byMonth.set(month, (byMonth.get(month) ?? 0) + delta);
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
        addRank(
          channelSpend,
          channelLabel(row.paymentChannel, row.enrichmentChannel),
          abs,
        );
        addRank(weekdaySpend, weekdayLabel(row.postedDate), abs);
        addRank(accountSpend, row.accountName?.trim() || "Unknown account", abs);
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
        });
        addRank(merchantSpend, cleanMerchant, abs);
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
        nestedAdd(typeByCategory, category, type, -abs);
        nestedAdd(categoryBySection, section, category, -abs);
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
      } else {
        bucket.income += abs;
        totalIncome += abs;
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

    const categories = [...categorySpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const sections = [...sectionSpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const subcategories = [...subcategorySpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const {
      series: sectionSeries,
      monthly: sectionMonthly,
      other: sectionOther,
      otherByPeriod: sectionOtherByPeriod,
    } = buildStackedSeries(
      monthKeys,
      sectionMonthSpend,
      sections,
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

    const tags = [...tagSpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const {
      series: tagSeries,
      monthly: tagMonthly,
      other: tagOther,
      otherByPeriod: tagOtherByPeriod,
    } = buildStackedSeries(
      monthKeys,
      tagMonthSpend,
      tags,
      period,
    );

    const merchants = [...merchantSpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const {
      series: merchantSeries,
      monthly: merchantMonthly,
      other: merchantOther,
      otherByPeriod: merchantOtherByPeriod,
    } = buildStackedSeries(
      monthKeys,
      merchantMonthSpend,
      merchants,
      period,
    );

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
    const subcategoryStacked = buildNestedStackedBars(
      subcategories,
      merchantBySubcategory,
      subcategories.length,
    );
    const tagStacked = buildNestedStackedBars(
      tags,
      categoryByTag,
      tags.length,
    );
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
    } = buildStackedSeries(
      monthKeys,
      categoryMonthSpend,
      categories,
      period,
    );

    const weekdays = WEEKDAYS.map((name) => ({
      name,
      spend: roundMoney(weekdaySpend.get(name) ?? 0),
    })).filter((item) => item.spend > 0);

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
      ok: true,
      data: {
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
          refunds: roundMoney(refunds),
          inboundTransfersIgnored: roundMoney(inboundTransfersIgnored),
        },
        monthly,
        sections,
        sectionMonthly,
        sectionSeries,
        sectionOther,
        sectionOtherByPeriod,
        sectionStacked,
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
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Database unavailable. Run npm run db:push first.",
    };
  }
}

export function parseAnalysisRange(value: string | null): AnalysisRange {
  if (
    value === "1w" ||
    value === "1m" ||
    value === "3m" ||
    value === "6m" ||
    value === "12m" ||
    value === "all"
  ) {
    return value;
  }
  return "12m";
}
