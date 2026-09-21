import {
  askJev,
  isJevConfigured,
  type JevChoiceAnswer,
  type JevQuestion,
} from "@/shared/ai/jev.server";

const SIGN_CRITERIA = {
  withdrawal:
    "Money left. The running balance fell by the statement-currency amount.",
  deposit:
    "Money arrived. The running balance rose. A stopped or reversed transfer that puts money back is a deposit.",
  skip: "Opening balance, balance forward, closing balance, blank, or not a posted line.",
} as const;

const TWIN_CRITERIA = {
  distinct:
    "A separate movement. Keep it even if another row has the same day and amount. A reversal between two sends means both sends are real.",
  duplicate:
    "The same movement printed twice, such as a trans date and a post date. Emit it once.",
} as const;

const FOREIGN_MARK =
  /\b(?:USD|EUR|GBP|PHP|MXN|JPY|AUD|CHF|INR|CNY|HKD|SGD)\b|@\s*\d/i;

/** Pull posted lines out of the cleaned markdown table. */
export function statementTableRows(markdown: string): string[] {
  const rows: string[] = [];
  for (const raw of markdown.split(/\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\|?\s*:?-{3,}/.test(trimmed)) continue;
    const cells = trimmed.includes("|")
      ? trimmed
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean)
      : trimmed.split("\t").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const head = cells.join(" ").toLowerCase();
    if (head.includes("description") && head.includes("balance")) continue;
    rows.push(cells.join(" | "));
  }
  return rows;
}

function moneyFigures(line: string): string[] {
  const found = line.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2}/g) ?? [];
  const seen = new Set<string>();
  const figures: string[] = [];
  for (const raw of found) {
    const normalized = raw.replace(/,/g, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    figures.push(normalized);
  }
  return figures;
}

/** Day + amount before the running balance, when two rows might be twins. */
function twinKey(line: string): string | null {
  const cells = line.split(" | ");
  const date = (cells[0] ?? "").toLowerCase();
  const figures = moneyFigures(line);
  if (!date || figures.length < 2) return null;
  return `${date}|${figures[figures.length - 2]}`;
}

function choiceOf(
  answers: Record<string, { type: string; choice?: string }>,
  name: string,
): string | null {
  const answer = answers[name];
  if (!answer || answer.type !== "choice" || !answer.choice) return null;
  return answer.choice;
}

/**
 * One Jev call per batch. Every row gets withdrawal, deposit, or skip.
 * Rows that share a day and amount also get distinct vs duplicate.
 * Rows with a foreign figure also get which number is in the statement currency.
 */
export async function signTableWithJev(markdown: string): Promise<string> {
  if (!isJevConfigured()) return "";
  const rows = statementTableRows(markdown);
  if (!rows.length) return "";

  const labels: string[] = [];
  for (let start = 0; start < rows.length; start += 24) {
    const slice = rows.slice(start, start + 24);
    const keys = slice.map(twinKey);
    const keyCount = new Map<string, number>();
    for (const key of keys) {
      if (!key) continue;
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
    }

    const questions: Record<string, JevQuestion> = {};
    slice.forEach((line, index) => {
      questions[`sign_${index}`] = {
        type: "choice",
        instructions: `Row ${index} is "${line}". Did money leave, arrive, or is this not a transaction? Use the balance change against the previous row.`,
        criteria: { ...SIGN_CRITERIA },
      };
      const key = keys[index];
      if (key && (keyCount.get(key) ?? 0) > 1) {
        questions[`twin_${index}`] = {
          type: "choice",
          instructions: `Row ${index} shares a day and amount with another row in this table. Is it a separate movement or the same one printed twice?`,
          criteria: { ...TWIN_CRITERIA },
        };
      }
      if (FOREIGN_MARK.test(line)) {
        const figures = moneyFigures(line).slice(0, 6);
        const criteria: Record<string, string | null> = {
          balance_change:
            "The statement-currency amount is the change in the Balance column, not a foreign figure.",
        };
        for (const figure of figures) {
          criteria[figure] = `The statement-currency amount is the printed figure ${figure}.`;
        }
        questions[`cad_${index}`] = {
          type: "choice",
          instructions: `Row ${index} shows a foreign amount. Which number is in the statement currency (USD on a US statement, CAD on a Canadian statement) and changed the balance?`,
          criteria,
        };
      }
    });

    const { answers } = await askJev({
      state: {
        note: "Cleaned bank-statement table. Judge each row from the running balance.",
        rows: slice.map((line, id) => ({ id, line })),
      },
      questions,
      logLabel: "statement-sign:jev",
      timeoutMs: 45_000,
    });

    slice.forEach((line, index) => {
      const signed = answers as Record<string, JevChoiceAnswer>;
      const sign = choiceOf(signed, `sign_${index}`) ?? "skip";
      const twin = choiceOf(signed, `twin_${index}`);
      const cad = choiceOf(signed, `cad_${index}`);
      const bits = [sign];
      if (twin) bits.push(twin);
      if (cad) bits.push(`amount=${cad}`);
      labels.push(`${bits.join(" ")}: ${line}`);
    });
  }
  return labels.join("\n");
}
