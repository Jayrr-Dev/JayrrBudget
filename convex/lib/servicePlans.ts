import type { UserRole } from "./roles";

/**
 * Default AI plans. Grounded in token/OCR COGS, not demo pricing.
 * See https://the-marketinghub.com/blog/hidden-economics-ai-saas-2026/
 *
 * Our flash models sit under the article's "cheap" $0.20/M band.
 * Mistral OCR at $4 / 1,000 pages is the real variable cost.
 * Caps stop a few heavy users from eating the month.
 */
export type ServicePlanSeed = {
  role: UserRole;
  name: string;
  priceUsd: number;
  /** null = unlimited (admin). Platform spend only; BYOK is not capped. */
  monthlyCapUsd: number | null;
  rateMax: number;
  rateWindowMs: number;
  includedCanvas: boolean;
};

export const DEFAULT_SERVICE_PLANS: readonly ServicePlanSeed[] = [
  {
    role: "normal",
    name: "Free",
    priceUsd: 0,
    monthlyCapUsd: 1,
    rateMax: 10,
    rateWindowMs: 60_000,
    includedCanvas: false,
  },
  {
    role: "premium",
    name: "Premium",
    // $12 sits above the article's $10 "danger" ARPU with heavy usage,
    // below a $20 comfort band. $4 cap = 33% of ARPU worst-case AI COGS.
    priceUsd: 12,
    monthlyCapUsd: 4,
    rateMax: 30,
    rateWindowMs: 60_000,
    includedCanvas: true,
  },
  {
    role: "admin",
    name: "Admin",
    priceUsd: 0,
    monthlyCapUsd: null,
    rateMax: 60,
    rateWindowMs: 60_000,
    includedCanvas: true,
  },
];

export function defaultPlanForRole(role: UserRole): ServicePlanSeed {
  const found = DEFAULT_SERVICE_PLANS.find((plan) => plan.role === role);
  if (found) return found;
  const fallback = DEFAULT_SERVICE_PLANS[0];
  if (!fallback) {
    throw new Error("DEFAULT_SERVICE_PLANS is empty");
  }
  return fallback;
}
