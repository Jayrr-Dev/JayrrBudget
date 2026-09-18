/**
 * Shared merchant-name instructions for parse, categorize, and enrich prompts.
 * Raw card descriptors stay in description only.
 */
export const MERCHANT_CLEAN_AI_RULES = [
  "MERCHANT NAME (required clean):",
  "Emit a short brand/payee title only. Never copy the raw card-network line.",
  "description keeps the full original text. merchant/merchantName/merchantClean does not.",
  "Always strip: city, mall, country; foreign amount + currency (PHP, USD, …); @ exchange rate; *reference codes; store numbers; websites (.COM/.CA); glued location suffixes.",
  "Always strip the RAIL (how the money moved) and keep the PAYEE (who got it): POS DEBIT, PAD, INTERAC, VISA DEBIT, BILL PAYMENT, ONLINE PAYMENT, ONLINE PURCHASE, DIRECT DEP, EFT RENT, DONATION, E-TRANSFER, ATM WITHDRAWAL.",
  "Always strip trailing account, card, or ATM numbers (TD 0816 → TD; SAVINGS 0092 → Savings; CARD 4500***1654 → Card).",
  "ATM lines name the bank whose machine it was: ATM WITHDRAWAL - TD 0816 → TD ATM.",
  "Bank-internal lines with no payee (MONTHLY PLAN FEE, CREDIT INTEREST, SERVICE CHARGE) keep that label as the merchant. Never invent a store for them.",
  "If a line is only a rail with no payee (PAD -, ONLINE PURCHASE -), the merchant is the rail spelled out: Pre-Authorized Debit, Online Purchase.",
  "Title-case the brand. Keep Uber vs Uber Eats as distinct services.",
  "Examples (input descriptor → merchant):",
  "- ALDO CEBU CITY 12,280.00 PHP @ 0.024 → Aldo",
  "- AIRBNB *HM3YTARTTM AIRBNB.COM → Airbnb",
  "- RUSTANS DEPT STORE CEBU CITY 6,760.00 PHP @ 0.024 → Rustan's",
  "- SALON DE ROSE CEN BLOC CEBU 6,500.00 PHP @ 0.024 → Salon de Rose",
  "- L CAMINADE TAN MKTG CEBU CITY 5,270.00 PHP @ 0.024 → L Caminade Tan Mktg",
  "- UBER CANADA/UBEREATS → Uber Eats",
  "- POS DEBIT - STARBUCKS → Starbucks",
  "- BILL PAYMENT - CIBC VISA → CIBC Visa",
  "- ONLINE PAYMENT - UALBERTA → UAlberta",
  "- DIRECT DEP - UTILITEK → Utilitek",
  "- EFT RENT - BOARDWALK → Boardwalk",
  "- DONATION - CANADIAN RED CROSS → Canadian Red Cross",
  "- ATM WITHDRAWAL - TD 0816 → TD ATM",
  "- TRANSFER TO SAVINGS 0092 → Transfer to Savings",
  "- MONTHLY PLAN FEE → Monthly Plan Fee",
  "Never truncate with ellipsis. Never leave PHP, @, a city, or a trailing dash in the merchant field.",
].join("\n");
