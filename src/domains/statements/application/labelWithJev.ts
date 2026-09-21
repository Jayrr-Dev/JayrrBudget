import {
  askJev,
  isJevConfigured,
  JEV_MAX_CHOICE_OPTIONS,
  type JevAnswer,
  type JevChoiceAnswer,
  type JevQuestion,
} from "@/shared/ai/jev.server";
import { mapPool } from "@/shared/ai/openRouter";
import {
  normalizedLabel,
  type CategoryProfile,
} from "@convex/lib/categorization";
import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";
import { TXN_CODES } from "@convex/lib/txnCodes";

/**
 * Categorize description groups with TypeSafe Jev Choice.
 *
 * One call picks the section and the small fields for several lines.
 * The next call asks only the category under that section, then only
 * the subcategory under that category. Tags are left off this pass.
 * The bank line lives in state once. Jev does not write new taxonomy leaves.
 */

const LOG_LABEL = "categorization:jev";
/** Lines per cascade. Small enough that section + one branch fits Jev. */
const SLICE = 8;
/** Cascades in flight. */
const PARALLEL = 3;
const TAG_THRESHOLD = 0.85;
const MAX_TAGS = 3;
const NONE_OPTION = "(none of these)";

export type TaxonomyPath = {
  key: string;
  section: string;
  category: string;
  subcategory: string | null;
};

export type ClassificationCatalog = {
  sections: Array<{ name: string; description: string }>;
  categories: Array<{
    name: string;
    description: string;
    sectionName: string | null;
    subcategoryNames: string[];
  }>;
  subcategories: Array<{
    name: string;
    description: string;
    categoryName: string | null;
    sectionName: string | null;
  }>;
};

export type JevLabelGroup = {
  key: string;
  description: string;
  amount: number;
};

export type JevLabelResult = {
  matches: Array<{ key: string; profile: CategoryProfile }>;
  /** Group keys Jev could not label; caller may retry. */
  failed: string[];
  error?: string;
};

const SPREAD_HINTS: Record<string, string> = {
  needs: "Essentials: housing, groceries, utilities, transit, insurance, debt",
  wants: "Discretionary: dining out, entertainment, shopping, hobbies",
  savings: "Saving or investing money",
  income: "Real income received (salary, refund of tax, interest earned)",
};

const TYPE_HINTS: Record<string, string> = {
  expense: "Money out for goods, services, fees, or interest",
  income: "Money in that was earned or received as income",
  transfer:
    "Default for moving money: a payment on your own card or account. Not a wire.",
};

const TXN_CODE_HINTS: Record<(typeof TXN_CODES)[number], string> = {
  purchase: "One-off purchase of goods or services",
  payment:
    "Default for a transfer: paying your own card, bill, or account. Skip this only for a global money transfer or a real person's name.",
  refund: "Money back for an earlier purchase (keeps the purchase category)",
  fee: "Bank, service, ATM, or foreign-exchange fee",
  interest: "Interest charged or earned",
  cash_advance: "Cash advance or ATM withdrawal on credit",
  transfer:
    "Only a global money transfer, or a transfer that names a real person. A plain INTERNET TRANSFER, cheque, or wire with no name is a payment.",
  subscription:
    "Recurring plan named as such (streaming, software, membership)",
  statement: "Statement-level line such as opening/closing balance",
  other: "None of the above fits",
};

const NOT_A_PERSON_NAME = new Set([
  "account",
  "acct",
  "atm",
  "bank",
  "bill",
  "card",
  "cards",
  "cheque",
  "chequing",
  "checking",
  "chq",
  "cibc",
  "credit",
  "debit",
  "deposit",
  "fee",
  "from",
  "global",
  "interac",
  "internet",
  "loc",
  "mastercard",
  "mbna",
  "money",
  "paiement",
  "pay",
  "payment",
  "savings",
  "self",
  "send",
  "sent",
  "thank",
  "to",
  "transfer",
  "transfers",
  "transit",
  "visa",
  "wire",
  "you",
]);

function isGlobalTransfer(description: string) {
  return /global\s+money|\bcibc\s+global\b|\binternet\s+global\b/i.test(
    description,
  );
}

/** A real person's name after to/from, or right after an e-transfer. Account and card are not names. */
function hasPersonName(description: string) {
  const text = description.replace(/[*#\d]+/g, " ");
  const markers =
    /\b(?:to|from|sent|send)\b[\s*#:.-]+([A-Za-z][A-Za-z']{1,})(?:[\s*#:.-]+([A-Za-z][A-Za-z']{1,}))?|\be-?\s*t(?:ransfer|fr)\b[\s*#:.-]+([A-Za-z][A-Za-z']{1,})(?:[\s*#:.-]+([A-Za-z][A-Za-z']{1,}))?/gi;
  for (const match of text.matchAll(markers)) {
    const words = [match[1], match[2], match[3], match[4]].filter(
      (word): word is string => Boolean(word),
    );
    if (words.some((word) => !NOT_A_PERSON_NAME.has(word.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function externalLeaf(paths: TaxonomyPath[], subcategory: string) {
  const leaf = normalizedLabel(subcategory);
  return (
    paths.find(
      (path) =>
        normalizedLabel(path.section) === "transfers" &&
        normalizedLabel(path.category) === "external transfers" &&
        normalizedLabel(path.subcategory ?? "") === leaf,
    ) ?? null
  );
}

function isPlainInternetTransfer(description: string) {
  const text = description.trim();
  if (!/^internet\s+transfer\b/i.test(text)) return false;
  if (isGlobalTransfer(text)) return false;
  if (hasPersonName(text)) return false;
  return true;
}

function isCardBillPayment(description: string) {
  return /\b(?:payment\s+thank\s+you|paiement\s+merci)\b/i.test(description);
}

function accountPaymentPath(paths: TaxonomyPath[]) {
  return (
    paths.find(
      (path) =>
        normalizedLabel(path.section) === "transfers" &&
        normalizedLabel(path.category) === "account transfers" &&
        normalizedLabel(path.subcategory ?? "") === "credit card payoffs",
    ) ?? null
  );
}

const CHANNEL_CRITERIA: Record<string, string> = {
  online: "Description clearly shows an online/web/app purchase",
  in_store: "Description clearly shows a physical store or location",
  other: "Cannot tell from the description",
};

function choiceAnswer(
  answers: Record<string, JevAnswer>,
  name: string,
): JevChoiceAnswer {
  const answer = answers[name];
  if (!answer || answer.type !== "choice") {
    throw new Error(`Jev did not return a choice for "${name}"`);
  }
  return answer;
}

function noulAnswer(answers: Record<string, JevAnswer>, name: string) {
  const answer = answers[name];
  return answer?.type === "noul" ? answer.noul : 0;
}

function hintFor(map: Record<string, string>, value: string) {
  return map[normalizedLabel(value)] ?? null;
}

function toCriteria(values: string[], hints: Record<string, string>) {
  const criteria: Record<string, string | null> = {};
  for (const value of values) criteria[value] = hintFor(hints, value);
  return criteria;
}

function rubric(description: string, extra?: string[]) {
  const lead = description.trim();
  const bits = extra?.filter(Boolean) ?? [];
  if (lead && bits.length) return `${lead}. Also: ${bits.join(", ")}`;
  if (lead) return lead;
  if (bits.length) return bits.join(", ");
  return null;
}

function findByName<T extends { name: string }>(rows: T[], name: string) {
  const key = normalizedLabel(name);
  return rows.find((row) => normalizedLabel(row.name) === key) ?? null;
}

function findPath(
  paths: TaxonomyPath[],
  section: string,
  category: string,
  subcategory: string | null,
) {
  return (
    paths.find(
      (path) =>
        normalizedLabel(path.section) === normalizedLabel(section) &&
        normalizedLabel(path.category) === normalizedLabel(category) &&
        (subcategory == null
          ? path.subcategory == null
          : path.subcategory != null &&
            normalizedLabel(path.subcategory) === normalizedLabel(subcategory)),
    ) ?? null
  );
}

function assertChoiceCount(label: string, count: number) {
  if (count === 0) throw new Error(`${label} catalog is empty`);
  if (count > JEV_MAX_CHOICE_OPTIONS) {
    throw new Error(
      `${label} has ${count} options; Jev supports at most ${JEV_MAX_CHOICE_OPTIONS}.`,
    );
  }
}

function classifyRulesClause(rules: string[]) {
  if (!rules.length) return "";
  return " When a classify rule in state.classify_rules matches this bank line, apply it to the pick. Rules cannot invent a section or category.";
}

function lineCue(prefix: string) {
  if (!prefix) return "This bank line";
  return `Line ${prefix.slice(0, -1)}`;
}

function categoriesUnder(
  catalog: ClassificationCatalog,
  sectionName: string,
) {
  return catalog.categories.filter(
    (row) =>
      row.sectionName != null &&
      normalizedLabel(row.sectionName) === normalizedLabel(sectionName),
  );
}

function leavesUnder(
  catalog: ClassificationCatalog,
  sectionName: string,
  categoryName: string,
) {
  return catalog.subcategories.filter(
    (row) =>
      row.sectionName != null &&
      row.categoryName != null &&
      normalizedLabel(row.sectionName) === normalizedLabel(sectionName) &&
      normalizedLabel(row.categoryName) === normalizedLabel(categoryName),
  );
}

/** Section and the small fields. Category and subcategory are a later call. */
function buildCoreQuestions(params: {
  catalog: ClassificationCatalog;
  spreads: string[];
  types: string[];
  ownerRules: string[];
  prefix: string;
}) {
  const sections = params.catalog.sections.filter((row) => row.name.trim());
  assertChoiceCount("Sections", sections.length);
  const sectionCriteria: Record<string, string | null> = {};
  for (const section of sections) {
    sectionCriteria[section.name] = rubric(section.description);
  }
  const cue = lineCue(params.prefix);
  const rulesNote = classifyRulesClause(params.ownerRules);
  const name = (key: string) => `${params.prefix}${key}`;
  const questions: Record<string, JevQuestion> = {
    [name("section")]: {
      type: "choice",
      instructions:
        `${cue}. Which section fits? The description in state is the evidence. Refunds keep the purchase section. PAYMENT / THANK YOU / PAIEMENT is the owner paying the card bill: Transfers, never Income.` +
        rulesNote,
      criteria: sectionCriteria,
    },
    [name("spread")]: {
      type: "choice",
      instructions: `${cue}. Which spending bucket? Income only for real income. A card payment or self-transfer is not income.`,
      criteria: toCriteria(params.spreads, SPREAD_HINTS),
    },
    [name("transactionType")]: {
      type: "choice",
      instructions: `${cue}. What kind of money movement? A card payment or self-transfer is a Transfer even when money comes in.`,
      criteria: toCriteria(params.types, TYPE_HINTS),
    },
    [name("txnCode")]: {
      type: "choice",
      instructions: `${cue}. What kind of line? Do not infer a subscription from the merchant alone. A transfer defaults to payment. Use transfer only for a global money transfer or a real person's name.`,
      criteria: { ...TXN_CODE_HINTS },
    },
    [name("channel")]: {
      type: "choice",
      instructions: `${cue}. How was this purchase made?`,
      criteria: { ...CHANNEL_CRITERIA },
    },
  };
  const categoriesBySection = sections.map((section) =>
    categoriesUnder(params.catalog, section.name),
  );
  return { sections, categoriesBySection, tagNames: [] as string[], questions };
}

function branchQuestions(params: {
  catalog: ClassificationCatalog;
  sections: ClassificationCatalog["sections"];
  categoriesBySection: ClassificationCatalog["categories"][];
  answers: Record<string, JevAnswer>;
  prefix: string;
}) {
  const name = (key: string) => `${params.prefix}${key}`;
  const cue = lineCue(params.prefix);
  const questions: Record<string, JevQuestion> = {};
  const sectionPick = choiceAnswer(params.answers, name("section")).choice;
  const sectionIndex = params.sections.findIndex(
    (row) => normalizedLabel(row.name) === normalizedLabel(sectionPick),
  );
  const section = sectionIndex >= 0 ? params.sections[sectionIndex] : undefined;
  const categories =
    sectionIndex >= 0 ? (params.categoriesBySection[sectionIndex] ?? []) : [];
  if (!section || categories.length < 2) return questions;
  const criteria: Record<string, string | null> = {};
  for (const category of categories) {
    criteria[category.name] = rubric(category.description);
  }
  const transferDefault =
    normalizedLabel(section.name) === "transfers"
      ? " Default to Account Transfers. External Transfers only for a global money transfer or a real person's name."
      : "";
  questions[name(`category_${sectionIndex}`)] = {
    type: "choice",
    instructions: `${cue}. Which category under "${section.name}" fits?${transferDefault}`,
    criteria,
  };
  return questions;
}

function subcategoryQuestion(params: {
  catalog: ClassificationCatalog;
  sections: ClassificationCatalog["sections"];
  categoriesBySection: ClassificationCatalog["categories"][];
  answers: Record<string, JevAnswer>;
  prefix: string;
}) {
  const name = (key: string) => `${params.prefix}${key}`;
  const cue = lineCue(params.prefix);
  const sectionPick = choiceAnswer(params.answers, name("section")).choice;
  const sectionIndex = params.sections.findIndex(
    (row) => normalizedLabel(row.name) === normalizedLabel(sectionPick),
  );
  const section = sectionIndex >= 0 ? params.sections[sectionIndex] : undefined;
  const categories =
    sectionIndex >= 0 ? (params.categoriesBySection[sectionIndex] ?? []) : [];
  if (!section || !categories.length) return null;
  const categoryName =
    categories.length === 1
      ? categories[0]!.name
      : choiceAnswer(params.answers, name(`category_${sectionIndex}`)).choice;
  const category = findByName(categories, categoryName);
  if (!category) return null;
  const categoryIndex = categories.findIndex(
    (row) => normalizedLabel(row.name) === normalizedLabel(category.name),
  );
  const leaves = leavesUnder(params.catalog, section.name, category.name);
  if (!leaves.length || categoryIndex < 0) return null;
  const paymentDefault =
    normalizedLabel(section.name) === "transfers" &&
    normalizedLabel(category.name) === "account transfers"
      ? " Default to Credit Card Payoffs. A plain INTERNET TRANSFER is a payment, not a wire."
      : normalizedLabel(section.name) === "transfers" &&
          normalizedLabel(category.name) === "external transfers"
        ? " Only a global money transfer (Remittances) or a real person's name (Interac e-Transfer)."
        : "";
  const criteria: Record<string, string | null> = {};
  for (const leaf of leaves.slice(0, JEV_MAX_CHOICE_OPTIONS - 1)) {
    criteria[leaf.name] = rubric(leaf.description);
  }
  criteria[NONE_OPTION] = "No listed subcategory fits this line";
  const question: JevQuestion = {
    type: "choice",
    instructions: `${cue}. Which subcategory under "${section.name} > ${category.name}" fits?${paymentDefault}`,
    criteria,
  };
  return {
    key: name(`subcategory_${sectionIndex}_${categoryIndex}`),
    question,
  };
}

function profileFromAnswers(params: {
  group: JevLabelGroup;
  answers: Record<string, JevAnswer>;
  prefix: string;
  paths: TaxonomyPath[];
  catalog: ClassificationCatalog;
  sections: ClassificationCatalog["sections"];
  categoriesBySection: ClassificationCatalog["categories"][];
  tagNames: string[];
  types: string[];
}): CategoryProfile {
  const name = (key: string) => `${params.prefix}${key}`;
  const sectionPick = choiceAnswer(params.answers, name("section")).choice;
  const sectionIndex = params.sections.findIndex(
    (row) => normalizedLabel(row.name) === normalizedLabel(sectionPick),
  );
  const section = sectionIndex >= 0 ? params.sections[sectionIndex] : undefined;
  if (!section || sectionIndex < 0) {
    throw new Error(`Jev chose unknown section "${sectionPick}"`);
  }

  const categories = params.categoriesBySection[sectionIndex] ?? [];
  if (!categories.length) {
    throw new Error(`No categories under section "${section.name}"`);
  }
  const categoryName =
    categories.length === 1
      ? categories[0]!.name
      : choiceAnswer(params.answers, name(`category_${sectionIndex}`)).choice;
  const category = findByName(categories, categoryName);
  if (!category) {
    throw new Error(`Jev chose unknown category "${categoryName}"`);
  }
  const categoryIndex = categories.findIndex(
    (row) => normalizedLabel(row.name) === normalizedLabel(category.name),
  );

  const leaves = params.catalog.subcategories.filter(
    (row) =>
      row.sectionName != null &&
      row.categoryName != null &&
      normalizedLabel(row.sectionName) === normalizedLabel(section.name) &&
      normalizedLabel(row.categoryName) === normalizedLabel(category.name),
  );
  let subcategoryName: string | null = null;
  if (leaves.length > 0 && categoryIndex >= 0) {
    const subPick = choiceAnswer(
      params.answers,
      name(`subcategory_${sectionIndex}_${categoryIndex}`),
    ).choice;
    if (subPick !== NONE_OPTION) {
      subcategoryName = findByName(leaves, subPick)?.name ?? null;
    }
  }

  const path =
    (subcategoryName
      ? findPath(params.paths, section.name, category.name, subcategoryName)
      : null) ??
    findPath(params.paths, section.name, category.name, null) ??
    findPath(params.paths, section.name, category.name, subcategoryName);
  if (!path) {
    throw new Error(
      `No catalog path for ${section.name} > ${category.name}${subcategoryName ? ` > ${subcategoryName}` : ""}`,
    );
  }

  const tags = params.tagNames
    .map((tag, index) => ({
      tag,
      p: noulAnswer(params.answers, name(`tag_${index}`)),
    }))
    .filter((entry) => entry.p >= TAG_THRESHOLD)
    .sort((a, b) => b.p - a.p)
    .slice(0, MAX_TAGS)
    .map((entry) => entry.tag);

  let txnCode = choiceAnswer(params.answers, name("txnCode")).choice;
  let spread = choiceAnswer(params.answers, name("spread")).choice;
  let transactionType = choiceAnswer(params.answers, name("transactionType")).choice;
  let resolvedPath = path;
  const sectionKey = normalizedLabel(resolvedPath.section);
  const categoryKey = normalizedLabel(resolvedPath.category);
  const transferLike =
    sectionKey === "transfers" ||
    txnCode === "payment" ||
    txnCode === "transfer";
  const description = params.group.description;
  const globalTransfer = isGlobalTransfer(description);
  const namedPerson = hasPersonName(description);
  if (transferLike && sectionKey === "transfers" && categoryKey !== "atm") {
    if (globalTransfer) {
      const remittance = externalLeaf(params.paths, "remittances");
      if (remittance) resolvedPath = remittance;
      txnCode = "transfer";
    } else if (namedPerson) {
      if (categoryKey !== "external transfers" && categoryKey !== "money transfers") {
        const interac = externalLeaf(params.paths, "interac e-transfer");
        if (interac) resolvedPath = interac;
      }
      txnCode = "transfer";
    } else {
      if (categoryKey === "external transfers" || categoryKey === "money transfers") {
        const paymentPath = accountPaymentPath(params.paths);
        if (paymentPath) resolvedPath = paymentPath;
      }
      txnCode = "payment";
    }
  }
  if (isPlainInternetTransfer(description) || isCardBillPayment(description)) {
    const paymentPath = accountPaymentPath(params.paths);
    if (paymentPath) resolvedPath = paymentPath;
    txnCode = "payment";
  }
  if (transferLike) {
    if (params.types.includes("Transfer")) transactionType = "Transfer";
    if (normalizedLabel(spread) === "income") spread = "Needs";
  }

  return {
    merchant:
      cleanMerchantDescriptor(params.group.description) ??
      params.group.description.trim().slice(0, 80),
    pathKey: resolvedPath.key,
    spread,
    transactionType,
    txnCode,
    channel: choiceAnswer(params.answers, name("channel")).choice,
    tags,
  };
}

/** Plain internet transfers and card-bill payments. Jev is not asked. */
export function presetTransferProfile(params: {
  description: string;
  paths: TaxonomyPath[];
  types: string[];
}): CategoryProfile | null {
  if (
    !isPlainInternetTransfer(params.description) &&
    !isCardBillPayment(params.description)
  ) {
    return null;
  }
  const path = accountPaymentPath(params.paths);
  if (!path) return null;
  const transactionType = params.types.includes("Transfer")
    ? "Transfer"
    : (params.types[0] ?? "Transfer");
  return {
    merchant:
      cleanMerchantDescriptor(params.description) ??
      params.description.trim().slice(0, 80),
    pathKey: path.key,
    spread: "Needs",
    transactionType,
    txnCode: "payment",
    channel: "other",
    tags: [],
  };
}

/** Classification always uses Jev when the key is set. */
export function shouldUseJevCategorization() {
  return isJevConfigured();
}

export async function labelGroupsWithJev(params: {
  groups: JevLabelGroup[];
  paths: TaxonomyPath[];
  catalog: ClassificationCatalog;
  spreads: string[];
  types: string[];
  tags: string[];
  ownerRules: string[];
  deadline: number;
  onMatch?: (match: { key: string; profile: CategoryProfile }) => void;
}): Promise<JevLabelResult> {
  const result: JevLabelResult = { matches: [], failed: [] };
  if (!params.catalog.sections.length) {
    return {
      matches: [],
      failed: params.groups.map((group) => group.key),
      error: "Classification catalog is empty. Add sections first.",
    };
  }

  const slices: JevLabelGroup[][] = [];
  for (let start = 0; start < params.groups.length; start += SLICE) {
    slices.push(params.groups.slice(start, start + SLICE));
  }
  await mapPool(slices, PARALLEL, async (slice) => {
    await labelSlice(slice, params, result);
  });

  return result;
}

function batchState(slice: JevLabelGroup[], ownerRules: string[]) {
  const state: Record<string, unknown> = {
    lines: slice.map((group, index) => ({
      id: `g${index}`,
      description: group.description,
      direction: group.amount < 0 ? "money in" : "money out",
    })),
  };
  if (ownerRules.length) {
    state.classify_rules = {
      note: "Owner classify rules for this ledger. Apply when they match the bank line. They do not invent new sections or categories.",
      rules: ownerRules,
    };
  }
  return state;
}

function shouldSplit(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("JEV_API_KEY")) return false;
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) return false;
  return true;
}

async function labelSlice(
  slice: JevLabelGroup[],
  params: {
    paths: TaxonomyPath[];
    catalog: ClassificationCatalog;
    spreads: string[];
    types: string[];
    ownerRules: string[];
    deadline: number;
    onMatch?: (match: { key: string; profile: CategoryProfile }) => void;
  },
  result: JevLabelResult,
) {
  if (!slice.length) return;
  if (params.deadline - Date.now() < 1000) {
    for (const group of slice) result.failed.push(group.key);
    result.error ??= "Categorization paused at its time limit.";
    return;
  }
  try {
    await labelSliceCascade(slice, params, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Jev categorization failed";
    if (slice.length === 1 || !shouldSplit(error)) {
      for (const group of slice) result.failed.push(group.key);
      result.error ??= message;
      console.warn(`[${LOG_LABEL}] batch of ${slice.length} failed: ${message}`);
      return;
    }
    console.warn(`[${LOG_LABEL}] batch of ${slice.length} split: ${message}`);
    const mid = Math.ceil(slice.length / 2);
    await labelSlice(slice.slice(0, mid), params, result);
    await labelSlice(slice.slice(mid), params, result);
  }
}

async function labelSliceCascade(
  slice: JevLabelGroup[],
  params: {
    paths: TaxonomyPath[];
    catalog: ClassificationCatalog;
    spreads: string[];
    types: string[];
    ownerRules: string[];
    onMatch?: (match: { key: string; profile: CategoryProfile }) => void;
  },
  result: JevLabelResult,
) {
  const started = Date.now();
  const state = batchState(slice, params.ownerRules);
  const built = slice.map((_, index) =>
    buildCoreQuestions({
      catalog: params.catalog,
      spreads: params.spreads,
      types: params.types,
      ownerRules: params.ownerRules,
      prefix: `g${index}_`,
    }),
  );
  const core: Record<string, JevQuestion> = {};
  for (const one of built) Object.assign(core, one.questions);
  const first = await askJev({
    state,
    logLabel: LOG_LABEL,
    questions: core,
    timeoutMs: 30_000,
  });
  const answers: Record<string, JevAnswer> = { ...first.answers };

  const categoryQuestions: Record<string, JevQuestion> = {};
  built.forEach((one, index) => {
    Object.assign(
      categoryQuestions,
      branchQuestions({
        catalog: params.catalog,
        sections: one.sections,
        categoriesBySection: one.categoriesBySection,
        answers,
        prefix: `g${index}_`,
      }),
    );
  });
  if (Object.keys(categoryQuestions).length > 0) {
    const second = await askJev({
      state,
      logLabel: LOG_LABEL,
      questions: categoryQuestions,
      timeoutMs: 30_000,
    });
    Object.assign(answers, second.answers);
  }

  const subQuestions: Record<string, JevQuestion> = {};
  built.forEach((one, index) => {
    const sub = subcategoryQuestion({
      catalog: params.catalog,
      sections: one.sections,
      categoriesBySection: one.categoriesBySection,
      answers,
      prefix: `g${index}_`,
    });
    if (sub) subQuestions[sub.key] = sub.question;
  });
  if (Object.keys(subQuestions).length > 0) {
    const third = await askJev({
      state,
      logLabel: LOG_LABEL,
      questions: subQuestions,
      timeoutMs: 30_000,
    });
    Object.assign(answers, third.answers);
  }

  slice.forEach((group, index) => {
    const one = built[index];
    if (!one) {
      result.failed.push(group.key);
      return;
    }
    try {
      const profile = profileFromAnswers({
        ...one,
        group,
        answers,
        prefix: `g${index}_`,
        paths: params.paths,
        catalog: params.catalog,
        types: params.types,
      });
      const match = { key: group.key, profile };
      result.matches.push(match);
      params.onMatch?.(match);
    } catch (error) {
      result.failed.push(group.key);
      result.error ??=
        error instanceof Error ? error.message : "Jev categorization failed";
    }
  });
  console.info(
    `[${LOG_LABEL}] cascade ${slice.length} lines in ${Date.now() - started}ms`,
  );
}
