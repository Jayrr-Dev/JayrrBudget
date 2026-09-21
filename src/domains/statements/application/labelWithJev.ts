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
 * Cascade: section → category → subcategory, each Choice over the owner's
 * classification catalog (name + description as criteria). The bank-line
 * description is the state. Jev does not write new taxonomy leaves.
 */

const LOG_LABEL = "categorization:jev";
/** Parallel per-line Jev calls. A multi-line call exceeds Jev's token cap. */
const CONCURRENCY = 16;
const TAG_NOUL_LIMIT = 24;
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

function buildState(group: JevLabelGroup, ownerRules: string[]) {
  const state: Record<string, unknown> = {
    bank_line: {
      description: group.description,
      direction: group.amount < 0 ? "money in" : "money out",
    },
  };
  if (ownerRules.length) {
    state.classify_rules = {
      note: "Owner classify rules for this ledger. Apply when they match the bank line. They do not invent new sections or categories.",
      rules: ownerRules,
    };
  }
  return state;
}

function tagQuestions(tags: string[]) {
  const usable = tags
    .filter((tag) => normalizedLabel(tag) !== "travel")
    .slice(0, TAG_NOUL_LIMIT);
  const questions: Record<string, JevQuestion> = {};
  usable.forEach((tag, index) => {
    questions[`tag_${index}`] = {
      type: "noul",
      instructions: `Does the tag "${tag}" apply to this bank line? Tags are extra stickers, not the category.`,
    };
  });
  return { usable, questions };
}

function buildLabelQuestions(params: {
  group: JevLabelGroup;
  catalog: ClassificationCatalog;
  spreads: string[];
  types: string[];
  tags: string[];
  ownerRules: string[];
  prefix: string;
}) {
  const sections = params.catalog.sections.filter((row) => row.name.trim());
  assertChoiceCount("Sections", sections.length);
  const { usable: tagNames, questions: tagNouls } = tagQuestions(params.tags);

  const sectionCriteria: Record<string, string | null> = {};
  for (const section of sections) {
    sectionCriteria[section.name] = rubric(section.description);
  }

  const rulesNote = classifyRulesClause(params.ownerRules);
  const lineNote = `Bank line ${params.prefix || "0"} ("${params.group.description.slice(0, 180)}", ${params.group.amount < 0 ? "money in" : "money out"}). `;
  const name = (key: string) => `${params.prefix}${key}`;
  const questions: Record<string, JevQuestion> = {
    [name("section")]: {
      type: "choice",
      instructions:
        lineNote +
        "Which section of the owner's classification catalog best describes this bank line? The description is the primary evidence. Refunds keep the purchase section. A credit line reading PAYMENT / THANK YOU / PAIEMENT is the owner paying the card bill: that belongs under Transfers, never Income." +
        rulesNote,
      criteria: sectionCriteria,
    },
    [name("spread")]: {
      type: "choice",
      instructions:
        lineNote +
        "Which spending bucket does this line belong to? Income only for real income received; a card bill payment or self-transfer is not income." +
        rulesNote,
      criteria: toCriteria(params.spreads, SPREAD_HINTS),
    },
    [name("transactionType")]: {
      type: "choice",
      instructions:
        lineNote +
        "What kind of money movement is this line? A card bill payment or self-transfer is a Transfer even when money comes in." +
        rulesNote,
      criteria: toCriteria(params.types, TYPE_HINTS),
    },
    [name("txnCode")]: {
      type: "choice",
      instructions:
        lineNote +
        "What kind of line is this? Never infer subscription from the merchant alone; the description must show it. A transfer defaults to payment. Use transfer only for a global money transfer or a line that names a real person." +
        rulesNote,
      criteria: { ...TXN_CODE_HINTS },
    },
    [name("channel")]: {
      type: "choice",
      instructions: `${lineNote}How was this purchase made?`,
      criteria: { ...CHANNEL_CRITERIA },
    },
  };
  for (const [key, question] of Object.entries(tagNouls)) {
    questions[name(key)] = {
      ...question,
      instructions: lineNote + question.instructions,
    };
  }

  // Speculative fan-out: category and subcategory for every section ride in
  // this same call. Jev answers them together; we keep the branch that matches.
  const categoriesBySection = sections.map((section) =>
    params.catalog.categories.filter(
      (row) =>
        row.sectionName != null &&
        normalizedLabel(row.sectionName) === normalizedLabel(section.name),
    ),
  );
  sections.forEach((section, sectionIndex) => {
    const categories = categoriesBySection[sectionIndex] ?? [];
    if (categories.length < 2) return;
    const criteria: Record<string, string | null> = {};
    for (const category of categories) {
      criteria[category.name] = rubric(
        category.description,
        category.subcategoryNames.slice(0, 12),
      );
    }
    const transferDefault =
      normalizedLabel(section.name) === "transfers"
        ? " Default to Account Transfers (a payment on your own card or account). External Transfers only for a global money transfer or a real person's name."
        : "";
    questions[name(`category_${sectionIndex}`)] = {
      type: "choice",
      instructions: `${lineNote}If this bank line belongs in the "${section.name}" section, which category under it best describes the line?${transferDefault}${rulesNote}`,
      criteria,
    };
    categories.forEach((category, categoryIndex) => {
      const leaves = params.catalog.subcategories.filter(
        (row) =>
          row.sectionName != null &&
          row.categoryName != null &&
          normalizedLabel(row.sectionName) === normalizedLabel(section.name) &&
          normalizedLabel(row.categoryName) === normalizedLabel(category.name),
      );
      if (leaves.length === 0) return;
      const paymentDefault =
        normalizedLabel(section.name) === "transfers" &&
        normalizedLabel(category.name) === "account transfers"
          ? " Default to Credit Card Payoffs. A plain INTERNET TRANSFER is a payment, not a wire."
          : normalizedLabel(section.name) === "transfers" &&
              normalizedLabel(category.name) === "external transfers"
            ? " Only a global money transfer (Remittances) or a real person's name (Interac e-Transfer). A transfer with no name is a payment, not a wire."
            : "";
      const subCriteria: Record<string, string | null> = {};
      for (const leaf of leaves.slice(0, JEV_MAX_CHOICE_OPTIONS - 1)) {
        subCriteria[leaf.name] = rubric(leaf.description);
      }
      subCriteria[NONE_OPTION] = "No listed subcategory fits this line";
      questions[name(`subcategory_${sectionIndex}_${categoryIndex}`)] = {
        type: "choice",
        instructions: `${lineNote}If this bank line belongs in "${section.name} > ${category.name}", which subcategory fits?${paymentDefault}${rulesNote}`,
        criteria: subCriteria,
      };
    });
  });

  return { sections, categoriesBySection, tagNames, questions };
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
  if (isPlainInternetTransfer(description)) {
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

async function labelGroup(
  group: JevLabelGroup,
  params: {
    paths: TaxonomyPath[];
    catalog: ClassificationCatalog;
    spreads: string[];
    types: string[];
    tags: string[];
    ownerRules: string[];
  },
): Promise<CategoryProfile> {
  const built = buildLabelQuestions({ ...params, group, prefix: "" });
  const { answers, ms } = await askJev({
    state: buildState(group, params.ownerRules),
    logLabel: LOG_LABEL,
    questions: built.questions,
  });
  const profile = profileFromAnswers({
    ...built,
    group,
    answers,
    prefix: "",
    paths: params.paths,
    catalog: params.catalog,
    types: params.types,
  });
  console.info(
    `[${LOG_LABEL}] "${group.description.slice(0, 40)}" -> ${profile.pathKey} (${ms}ms)`,
  );
  return profile;
}

/** Plain internet transfers are payments. Jev is not asked. */
export function presetTransferProfile(params: {
  description: string;
  paths: TaxonomyPath[];
  types: string[];
}): CategoryProfile | null {
  if (!isPlainInternetTransfer(params.description)) return null;
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

  await mapPool(params.groups, CONCURRENCY, async (group) => {
    if (params.deadline - Date.now() < 1000) {
      result.failed.push(group.key);
      result.error ??= "Categorization paused at its time limit.";
      return;
    }
    try {
      const profile = await labelGroup(group, params);
      const match = { key: group.key, profile };
      result.matches.push(match);
      params.onMatch?.(match);
    } catch (lineError) {
      result.failed.push(group.key);
      result.error ??=
        lineError instanceof Error
          ? lineError.message
          : "Jev categorization failed";
    }
  });

  return result;
}
