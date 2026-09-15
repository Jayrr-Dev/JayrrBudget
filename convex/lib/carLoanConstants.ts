/** CIBC 2021 Lexus IS - contractual car loan (synthetic account). */

export const CIBC_CAR_LOAN_ACCOUNT_ID = "cibc-car-loan";
export const CIBC_CAR_LOAN_MERCHANT = "CIBC Car Loan";

export const CIBC_CAR_LOAN_TERMS = {
  principalStart: 38_845.1,
  annualRate: 0.0799,
  aprDisclosed: 0.0803,
  paymentAmount: 294.8,
  paymentFrequency: "biweekly" as const,
  paymentCount: 169,
  firstPaymentDate: "2025-06-16",
  maturityDate: "2031-11-24",
  matchMerchantClean: CIBC_CAR_LOAN_MERCHANT,
  matchAmount: 294.8,
  vehicleLabel: "2021 Lexus IS",
  loanType: "auto",
  accountName: "CIBC Car Loan",
  officialName: "2021 Lexus IS Auto loan",
  subtype: "auto loan",
} as const;
