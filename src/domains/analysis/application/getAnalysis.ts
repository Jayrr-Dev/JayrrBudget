import { and, eq, inArray } from "drizzle-orm";
import { classifyCashFlow, spendCategoryLabel } from "@/domains/analysis/domain/cashFlow";
import type {
  AnalysisData,
  AnalysisRange,
} from "@/domains/analysis/domain/types";
import { singularCategoryKey } from "@/domains/statements/application/categoryVocabulary";
import { toMajor } from "@/shared/db/money";
import { getDb } from "@/shared/db";
import {
  accounts,
  entities,
  taxonomyNodes,
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEnrichment,
  transactionEntities,
  transactionLabels,
  transactionLocations,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";

export type GetAnalysisResult =
  | { ok: true; data: AnalysisData }
  | { ok: false; status: number; error: string };

const TOP_STACK_CATEGORIES = 6;
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

function monthKey(isoDate: string) {
  return isoDate.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function addMonths(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthsBetween(start: string, end: string) {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
    if (out.length > 240) break;
  }
  return out;
}

function addDays(isoDate: string, delta: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function addRank(map: Map<string, number>, name: string, delta: number) {
  map.set(name, (map.get(name) ?? 0) + delta);
}

function rankMap(map: Map<string, number>, limit = 10) {
  return [...map.entries()]
    .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
    .filter((item) => item.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

const TYPE_ALIASES: Record<string, string> = {
  "loan payments": "Loan Payment",
  "loan payment": "Loan Payment",
  "student loans": "Student Loan",
  "student loan": "Student Loan",
  "buy now pay later": "BNPL",
  "online retail": "Online Marketplaces",
  "online marketplaces": "Online Marketplaces",
  restaurants: "Restaurants",
  groceries: "Groceries",
  delivery: "Delivery",
  "gas stations": "Gas Stations",
  "e-transfer": "E-Transfer",
  remittance: "Remittance",
  "international remittance": "Remittance",
  "interest charges": "Interest",
  interest: "Interest",
  saas: "SaaS",
  "hair salons and barbers": "Hair Salons",
  "hair salon": "Hair Salons",
  "hair salons": "Hair Salons",
  barber: "Barbers",
  barbers: "Barbers",
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
  const raw = (typeName ?? categoryDetailed ?? "").trim();
  if (!raw) return "Unspecified";
  const mapped = aliasTypeLabel(raw);
  if (
    typeKey(mapped) === typeKey(category) ||
    singularCategoryKey(mapped) === singularCategoryKey(category)
  ) {
    return "Unspecified";
  }
  return mapped;
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

function emptyAnalysis(range: AnalysisRange): AnalysisData {
  return {
    currency: "CAD",
    range,
    earliestDate: null,
    latestDate: null,
    transactionCount: 0,
    summary: {
      totalSpend: 0,
      totalIncome: 0,
      net: 0,
      avgMonthlySpend: 0,
      peakSpendMonth: null,
      peakSpendAmount: 0,
      internalTransfers: 0,
      transferCount: 0,
      spendCount: 0,
      refunds: 0,
      inboundTransfersIgnored: 0,
    },
    monthly: [],
    categories: [],
    categoryMonthly: [],
    categorySeries: [],
    breakdowns: [],
    merchants: [],
    places: [],
    channels: [],
    weekdays: [],
    accounts: [],
  };
}

export async function getAnalysis(
  range: AnalysisRange = "12m",
): Promise<GetAnalysisResult> {
  try {
    const db = getDb();

    const rows = await db
      .select({
        id: transactions.id,
        description: transactions.description,
        accountName: accounts.name,
        accountType: accounts.type,
        amountMinor: transactionAmounts.amountMinor,
        currencyCode: transactionAmounts.currencyCode,
        postedDate: transactionDates.postedDate,
        categoryPrimary: transactionBankCategories.categoryPrimary,
        categoryDetailed: transactionBankCategories.categoryDetailed,
        transactionCode: transactionPaymentRefs.transactionCode,
        paymentChannel: transactionPaymentRefs.paymentChannel,
        city: transactionLocations.city,
        region: transactionLocations.region,
        merchantClean: transactionEnrichment.merchantClean,
        enrichmentChannel: transactionEnrichment.channel,
      })
      .from(transactions)
      .innerJoin(
        transactionAmounts,
        eq(transactionAmounts.transactionId, transactions.id),
      )
      .innerJoin(accounts, eq(accounts.accountId, transactions.accountId))
      .innerJoin(
        transactionDates,
        eq(transactionDates.transactionId, transactions.id),
      )
      .leftJoin(
        transactionBankCategories,
        eq(transactionBankCategories.transactionId, transactions.id),
      )
      .leftJoin(
        transactionPaymentRefs,
        eq(transactionPaymentRefs.transactionId, transactions.id),
      )
      .leftJoin(
        transactionLocations,
        eq(transactionLocations.transactionId, transactions.id),
      )
      .leftJoin(
        transactionEnrichment,
        eq(transactionEnrichment.transactionId, transactions.id),
      );

    if (rows.length === 0) {
      return { ok: true, data: emptyAnalysis(range) };
    }

    const ids = rows.map((row) => row.id);
    const labelRows = await db
      .select({
        transactionId: transactionLabels.transactionId,
        role: transactionLabels.role,
        name: taxonomyNodes.name,
      })
      .from(transactionLabels)
      .innerJoin(
        taxonomyNodes,
        eq(taxonomyNodes.id, transactionLabels.nodeId),
      )
      .where(
        and(
          inArray(transactionLabels.transactionId, ids),
          inArray(transactionLabels.role, ["section", "category", "type"]),
        ),
      );

    const treeByTxn = new Map<
      number,
      {
        sectionName: string | null;
        categoryName: string | null;
        typeName: string | null;
      }
    >();
    for (const label of labelRows) {
      const tree = treeByTxn.get(label.transactionId) ?? {
        sectionName: null,
        categoryName: null,
        typeName: null,
      };
      if (label.role === "section") tree.sectionName = label.name;
      if (label.role === "category") tree.categoryName = label.name;
      if (label.role === "type") tree.typeName = label.name;
      treeByTxn.set(label.transactionId, tree);
    }

    const entityRows = await db
      .select({
        transactionId: transactionEntities.transactionId,
        displayName: entities.displayName,
        role: transactionEntities.role,
      })
      .from(transactionEntities)
      .innerJoin(entities, eq(entities.id, transactionEntities.entityId))
      .where(
        and(
          inArray(transactionEntities.transactionId, ids),
          inArray(transactionEntities.role, ["company", "brand"]),
        ),
      );

    const companyByTxn = new Map<number, string>();
    const brandByTxn = new Map<number, string>();
    for (const row of entityRows) {
      if (!row.displayName) continue;
      if (row.role === "company") companyByTxn.set(row.transactionId, row.displayName);
      if (row.role === "brand") brandByTxn.set(row.transactionId, row.displayName);
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
    const merchantSpend = new Map<string, number>();
    const placeSpend = new Map<string, number>();
    const channelSpend = new Map<string, number>();
    const weekdaySpend = new Map<string, number>();
    const accountSpend = new Map<string, number>();
    const typeByCategory = new Map<string, Map<string, number>>();
    const merchantByCategory = new Map<string, Map<string, number>>();
    const typeMonthByCategory = new Map<
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
      const major = toMajor(row.amountMinor);
      const abs = Math.abs(major);
      if (abs === 0) continue;

      const month = monthKey(row.postedDate);
      const bucket = monthlyMap.get(month) ?? {
        spend: 0,
        income: 0,
        transfers: 0,
      };
      const tree = treeByTxn.get(row.id) ?? {
        sectionName: null,
        categoryName: null,
        typeName: null,
      };
      const signals = {
        amountMinor: row.amountMinor,
        description: row.description,
        accountType: row.accountType,
        categoryPrimary: row.categoryPrimary,
        categoryDetailed: row.categoryDetailed,
        sectionName: tree.sectionName,
        categoryName: tree.categoryName,
        typeName: tree.typeName,
        transactionCode: row.transactionCode,
      };
      const kind = classifyCashFlow(signals);
      const category = spendCategoryLabel(
        signals,
        resolveCategory({
          taxonomyCategory: tree.categoryName,
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
        addRank(
          merchantSpend,
          merchantLabel({
            companyName:
              companyByTxn.get(row.id) ?? brandByTxn.get(row.id) ?? null,
            merchantClean: row.merchantClean,
            description: row.description,
          }),
          abs,
        );
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
          tree.typeName,
          row.categoryDetailed,
          category,
        );
        const merchant = merchantLabel({
          companyName:
            companyByTxn.get(row.id) ?? brandByTxn.get(row.id) ?? null,
          merchantClean: row.merchantClean,
          description: row.description,
        });
        nestedAdd(typeByCategory, category, type, abs);
        nestedAdd(merchantByCategory, category, merchant, abs);
        nestedMonthAdd(typeMonthByCategory, category, type, month, abs);
      } else if (kind === "refund") {
        bucket.spend -= abs;
        totalSpend -= abs;
        refunds += abs;
        addCategory(category, month, -abs);
      } else {
        bucket.income += abs;
        totalIncome += abs;
      }

      monthlyMap.set(month, bucket);
    }

    const latestMonth = latestDate ? monthKey(latestDate) : null;
    const startMonth = startDate ? monthKey(startDate) : null;
    const monthKeys =
      startMonth && latestMonth
        ? monthsBetween(startMonth, latestMonth)
        : [...monthlyMap.keys()].sort();

    const monthly = monthKeys.map((month) => {
      const bucket = monthlyMap.get(month) ?? {
        spend: 0,
        income: 0,
        transfers: 0,
      };
      return {
        month,
        label: monthLabel(month),
        spend: roundMoney(bucket.spend),
        income: roundMoney(bucket.income),
        transfers: roundMoney(bucket.transfers),
      };
    });

    let peakSpendMonth: string | null = null;
    let peakSpendAmount = 0;
    for (const point of monthly) {
      if (point.spend > peakSpendAmount) {
        peakSpendAmount = point.spend;
        peakSpendMonth = point.label;
      }
    }

    const monthsWithSpend = monthly.filter((point) => point.spend > 0).length;
    const avgMonthlySpend =
      monthsWithSpend > 0 ? totalSpend / monthsWithSpend : 0;

    const categories = [...categorySpend.entries()]
      .map(([name, spend]) => ({ name, spend: roundMoney(spend) }))
      .filter((item) => item.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    const usedKeys = new Set<string>();
    const topSeries = categories.slice(0, TOP_STACK_CATEGORIES).map((item) => {
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
    const hasOther = categories.some((item) => !topByLabel.has(item.name));
    const categorySeries = hasOther
      ? [...topSeries, { key: OTHER_KEY, label: OTHER }]
      : topSeries;

    const categoryMonthly = monthKeys.map((month) => {
      const row: Record<string, string | number> = {
        month,
        label: monthLabel(month),
      };
      for (const series of categorySeries) row[series.key] = 0;
      for (const [name, byMonth] of categoryMonthSpend) {
        const amount = byMonth.get(month) ?? 0;
        if (amount === 0) continue;
        const key = topByLabel.get(name) ?? OTHER_KEY;
        if (!(key in row)) continue;
        row[key] = roundMoney(Math.max(0, Number(row[key] ?? 0) + amount));
      }
      return row;
    });

    const weekdays = WEEKDAYS.map((name) => ({
      name,
      spend: roundMoney(weekdaySpend.get(name) ?? 0),
    })).filter((item) => item.spend > 0);

    const breakdowns = categories.slice(0, 12).map((item) => {
      const types = rankMap(typeByCategory.get(item.name) ?? new Map(), 8);
      const typeSeries = uniqueSeriesKeys(types.slice(0, 6).map((row) => row.name));
      const topTypeSet = new Set(typeSeries.map((row) => row.label));
      const hasOtherType = types.some((row) => !topTypeSet.has(row.name));
      const series = hasOtherType
        ? [...typeSeries, { key: OTHER_KEY, label: OTHER }]
        : typeSeries;
      const byLabel = new Map(typeSeries.map((row) => [row.label, row.key]));
      const monthMap = typeMonthByCategory.get(item.name) ?? new Map();
      const typeMonthly = monthKeys.map((month) => {
        const row: Record<string, string | number> = {
          month,
          label: monthLabel(month),
        };
        for (const entry of series) row[entry.key] = 0;
        for (const [typeName, byMonth] of monthMap) {
          const amount = byMonth.get(month) ?? 0;
          if (amount === 0) continue;
          const key = byLabel.get(typeName) ?? OTHER_KEY;
          if (!(key in row)) continue;
          row[key] = roundMoney(Math.max(0, Number(row[key] ?? 0) + amount));
        }
        return row;
      });
      return {
        category: item.name,
        spend: item.spend,
        types,
        merchants: rankMap(merchantByCategory.get(item.name) ?? new Map(), 8),
        typeSeries: series,
        typeMonthly,
      };
    });

    return {
      ok: true,
      data: {
        currency,
        range,
        earliestDate: rangeEarliest,
        latestDate: rangeLatest,
        transactionCount: filtered.length,
        summary: {
          totalSpend: roundMoney(totalSpend),
          totalIncome: roundMoney(totalIncome),
          net: roundMoney(totalIncome - totalSpend),
          avgMonthlySpend: roundMoney(avgMonthlySpend),
          peakSpendMonth,
          peakSpendAmount: roundMoney(peakSpendAmount),
          internalTransfers: roundMoney(internalTransfers),
          transferCount,
          spendCount,
          refunds: roundMoney(refunds),
          inboundTransfersIgnored: roundMoney(inboundTransfersIgnored),
        },
        monthly,
        categories,
        categoryMonthly,
        categorySeries,
        breakdowns,
        merchants: rankMap(merchantSpend, 8),
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
