import type {
  SquareTimelineCell,
  SquareTimelineLevel,
  SquareTimelineTone,
} from "@/components/ui/square-timeline.types";
import type {
  DashboardLoanPayment,
  DashboardLoanSummary,
} from "@/domains/dashboard/domain/types";
import { daysBetweenIso } from "@/domains/loans/domain/amortize";
import { formatDisplayDate } from "@/shared/lib/format-date";

const MISS_BUFFER_DAYS = 1;

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localTodayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function sundayIndex(isoDate: string) {
  const [year, month, day] = isoDate
    .slice(0, 10)
    .split("-")
    .map((part) => Number(part));
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

function scheduledDate(
  loan: DashboardLoanSummary,
  paymentNumber: number,
  known: Map<number, string>,
) {
  const fromLedger = known.get(paymentNumber);
  if (fromLedger) return fromLedger;
  const count = loan.paymentCount;
  if (count <= 1) return loan.firstPaymentDate;
  const span = daysBetweenIso(loan.firstPaymentDate, loan.maturityDate);
  const step = span / Math.max(1, count - 1);
  return addDaysIso(
    loan.firstPaymentDate,
    Math.round(step * (paymentNumber - 1)),
  );
}

function isPostedPad(payment: DashboardLoanPayment | undefined) {
  return Boolean(payment && !payment.assumed && payment.postedDate);
}

function toneLevel(tone: SquareTimelineTone): SquareTimelineLevel {
  if (tone === "paid") return 4;
  if (tone === "due") return 1;
  if (tone === "missed") return 2;
  return 0;
}

function titleFor(date: string, tone: SquareTimelineTone, next: boolean) {
  const when = formatDisplayDate(date);
  if (tone === "paid") return `Paid · ${when}`;
  if (tone === "missed") return `Missed pay date · ${when}`;
  if (tone === "due") {
    return next ? `Next pay date · ${when}` : `Pay date · ${when}`;
  }
  return when;
}

function paymentTones(
  loan: DashboardLoanSummary,
  asOf: string,
): Map<string, SquareTimelineTone> {
  const knownDates = new Map(
    loan.payments.map((payment) => [
      payment.paymentNumber,
      payment.scheduledDate,
    ]),
  );
  const byNumber = new Map(
    loan.payments.map((payment) => [payment.paymentNumber, payment]),
  );
  const tones = new Map<string, SquareTimelineTone>();
  const count = Math.max(0, Math.floor(loan.paymentCount));

  for (let index = 0; index < count; index += 1) {
    const paymentNumber = index + 1;
    const scheduled = scheduledDate(loan, paymentNumber, knownDates);
    const payment = byNumber.get(paymentNumber);
    const posted = payment?.postedDate;

    if (isPostedPad(payment) && posted) {
      tones.set(posted.slice(0, 10), "paid");
      continue;
    }

    const daysPastDue = daysBetweenIso(scheduled, asOf);
    if (daysPastDue > MISS_BUFFER_DAYS) {
      tones.set(scheduled, "missed");
      continue;
    }
    tones.set(scheduled, "due");
  }

  return tones;
}

function dayCell(args: {
  date: string;
  tone: SquareTimelineTone;
  padded: boolean;
  faded: boolean;
  nextDue: boolean;
}): SquareTimelineCell {
  return {
    id: args.padded ? `pad-${args.date}` : args.date,
    date: args.date,
    tone: args.tone,
    faded: args.faded,
    level: toneLevel(args.tone),
    title: args.padded ? "" : titleFor(args.date, args.tone, args.nextDue),
  };
}

/** One square per calendar day in the loan term, Sunday-first weeks. */
export function loanPaymentTimelineCells(
  loan: DashboardLoanSummary,
  asOfDate = localTodayIso(),
): SquareTimelineCell[] {
  const start = loan.firstPaymentDate.slice(0, 10);
  const end = loan.maturityDate.slice(0, 10);
  if (!start || !end) return [];

  const asOf = asOfDate.slice(0, 10);
  const tones = paymentTones(loan, asOf);
  const nextDue = loan.nextPaymentDate?.slice(0, 10) ?? "";
  const lead = sundayIndex(start);
  const rangeStart = addDaysIso(start, -lead);
  const tail = (7 - ((sundayIndex(end) + 1) % 7)) % 7;
  const rangeEnd = addDaysIso(end, tail);
  const dayCount = daysBetweenIso(rangeStart, rangeEnd) + 1;
  const cells: SquareTimelineCell[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDaysIso(rangeStart, offset);
    const padded = date < start || date > end;
    const tone = padded ? "empty" : (tones.get(date) ?? "empty");
    const isNextDue = tone === "due" && date === nextDue;
    const faded =
      (date < asOf && !isNextDue) || (tone === "due" && !isNextDue);
    cells.push(
      dayCell({
        date,
        tone,
        padded,
        faded,
        nextDue: isNextDue,
      }),
    );
  }

  return cells;
}
