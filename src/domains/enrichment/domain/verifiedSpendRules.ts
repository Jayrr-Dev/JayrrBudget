import type { CategoryRule } from "@/domains/enrichment/application/categoryRuleTypes";

/** Verified merchant → spend tree. First match wins. */
export const VERIFIED_SPEND_RULES: CategoryRule[] = [
  // --- Income ---
  {
    categoryDetailed: "Salary & Wages",
    categoryPrimary: "INCOME",
    tree: {
      section: "Income",
      category: "Employment",
      type: "Salary & Wages",
    },
    patterns: [
      /pay\s*utilitek/i,
      /utilitek\s*solut/i,
      /payroll/i,
      /pay\s*cheque/i,
    ],
  },
  {
    categoryDetailed: "Tax Credits & GST",
    categoryPrimary: "INCOME",
    tree: {
      section: "Income",
      category: "Government & Tax",
      type: "Tax Credits & GST",
    },
    patterns: [
      /tps\s*\/\s*gst/i,
      /gst\s*\/\s*hst/i,
      /gst\s*credit/i,
      /hst\s*credit/i,
      /cra\s*deposit/i,
    ],
  },
  {
    categoryDetailed: "Tax Refunds",
    categoryPrimary: "INCOME",
    tree: {
      section: "Income",
      category: "Government & Tax",
      type: "Tax Refunds",
    },
    patterns: [/tax\s*refund/i],
  },
  {
    categoryDetailed: "Cashback Rewards",
    categoryPrimary: "INCOME",
    tree: {
      section: "Income",
      category: "Cashback & Rebates",
      type: "Cashback Rewards",
    },
    patterns: [/cashback/i, /remise\s*en\s*argent/i],
  },

  // --- Transfers (description-first) ---
  {
    categoryDetailed: "Credit Card Payoffs",
    categoryPrimary: "TRANSFER",
    merchantClean: "Card Payment",
    tree: {
      section: "Transfers",
      category: "Account Transfers",
      type: "Credit Card Payoffs",
    },
    patterns: [
      /payment\s*thank\s*you/i,
      /paiement\s*merci/i,
      /pad\s+payment.{0,40}card/i,
      /internet\s+bill\s*pay.{0,40}card/i,
      /internet\s+transfer.{0,80}to\s+card/i,
      /cibc\s+card\s+payment/i,
      /preauthorized\s+debit\s+mbna/i,
    ],
  },
  {
    categoryDetailed: "Self Transfers",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "Account Transfers",
      type: "Self Transfers",
    },
    patterns: [/^internet\s+transfer\b/i],
  },
  {
    categoryDetailed: "Remittances",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "External Transfers",
      type: "Remittances",
    },
    patterns: [/global\s+money\s+transfer/i, /cibc\s+global\s+money/i],
  },
  {
    categoryDetailed: "Interac e-Transfer",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "External Transfers",
      type: "Interac e-Transfer",
    },
    patterns: [/e-?transfer/i],
  },

  // --- AI Services (before generic SaaS) ---
  {
    categoryDetailed: "Model APIs & Inference",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "Model APIs & Inference",
    },
    patterns: [
      /openrouter/i,
      /replicate/i,
      /replicate\.com/i,
      /marblism/i,
      /openai.{0,40}\bapi\b/i,
      /\bapi\b.{0,40}openai/i,
    ],
  },
  {
    categoryDetailed: "AI Assistants & Chat",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "AI Assistants & Chat",
    },
    patterns: [
      /openai/i,
      /chatgpt/i,
      /anthropic/i,
      /\bclaude\b/i,
      /\bt3\s*chat\b/i,
      /t3chat/i,
    ],
  },
  {
    categoryDetailed: "AI Code Editors & IDEs",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "AI Code Editors & IDEs",
    },
    patterns: [/\bcursor\b/i, /windsurf/i, /ai\s*powered\s*ide/i],
  },

  // --- Cloud & Hosting ---
  {
    categoryDetailed: "Infrastructure",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud & Hosting",
      type: "Infrastructure",
    },
    patterns: [
      /vercel/i,
      /google\s*\*?\s*cloud/i,
      /colyseus/i,
      /cloudflare/i,
      /supabase/i,
      /heroku/i,
      /digitalocean/i,
      /render\.com/i,
      /railway\.app/i,
    ],
  },
  {
    categoryDetailed: "Domains & Registrars",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud & Hosting",
      type: "Domains & Registrars",
    },
    patterns: [
      /name[-\s]?cheap/i,
      /porkbun/i,
      /godaddy/i,
      /hover\.com/i,
      /name\.com/i,
    ],
  },
  {
    categoryDetailed: "Developer & Payment Platforms",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud & Hosting",
      type: "Developer & Payment Platforms",
    },
    patterns: [
      /stripe/i,
      /lemonsqueezy/i,
      /lemon.?squeezy/i,
      /lemsgzy/i,
      /\bpolar\b/i,
      /github/i,
      /gitlab/i,
    ],
  },

  // --- Creative tools with primary AI features ---
  {
    categoryDetailed: "Productivity & Creative",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software & Subscriptions",
      type: "Productivity & Creative",
    },
    patterns: [
      /canva/i,
      /capcut/i,
      /sparkrec(?:ei)?pt/i,
      /paddle\.net\*\s*spark/i,
    ],
  },

  // --- Software & Subscriptions (non-AI) ---
  {
    categoryDetailed: "Productivity & Creative",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software & Subscriptions",
      type: "Productivity & Creative",
    },
    patterns: [
      /excalidraw/i,
      /zoho/i,
      /figma/i,
      /notion/i,
      /wealthsimple\s*tax/i,
    ],
  },
  {
    categoryDetailed: "Communication & Social",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software & Subscriptions",
      type: "Communication & Social",
    },
    patterns: [
      /discord/i,
      /nitro/i,
      /x\s*corp/i,
      /\btwitter\b/i,
      /\bx\.com\b/i,
    ],
  },
  {
    categoryDetailed: "Security & Utilities",
    categoryPrimary: "GENERAL_SERVICES",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software & Subscriptions",
      type: "Security & Utilities",
    },
    patterns: [/nord/i, /start\.me/i, /google\s*one/i],
  },
  {
    categoryDetailed: "Streaming",
    categoryPrimary: "ENTERTAINMENT",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Streaming",
    },
    patterns: [
      /netflix/i,
      /spotify/i,
      /disney\+/i,
      /disney\s*plus/i,
      /crave/i,
      /youtube\s*premium/i,
    ],
  },

  // --- Food ---
  {
    categoryDetailed: "Food Delivery",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Delivery Services",
      type: "Food Delivery",
    },
    patterns: [
      /uber\s*eats/i,
      /ubereats/i,
      /foodpanda/i,
      /skipthedishes/i,
      /skip\s*the\s*dishes/i,
    ],
  },
  {
    categoryDetailed: "Board Game Cafes",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Restaurants & Cafes",
      type: "Board Game Cafes",
    },
    patterns: [/hexagon\s*board\s*game/i],
  },
  {
    categoryDetailed: "Fast Food",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Restaurants & Cafes",
      type: "Fast Food",
    },
    patterns: [
      /panda\s*express/i,
      /more\s*subs/i,
      /mcdonald/i,
      /wendy/i,
      /burger\s*king/i,
      /a&w/i,
      /tim\s*horton/i,
      /dairy\s*queen/i,
    ],
  },
  {
    categoryDetailed: "Supermarkets",
    categoryPrimary: "FOOD_AND_DRINK",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Food",
      type: "Supermarkets",
    },
    patterns: [
      /real\s*cdn\s*superstore/i,
      /real\s*canadian\s*superstore/i,
      /wal[-\s]?mart\s*super/i,
      /walmart\s*supercentre/i,
      /costco\s*wholesale/i,
      /costco\s*business/i,
      /sobeys/i,
      /h-mart/i,
      /t&t\s*supermarket/i,
    ],
  },

  // --- Transport ---
  {
    categoryDetailed: "Gas Stations",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: { section: "Transport", category: "Fuel", type: "Gas Stations" },
    patterns: [
      /\besso\b/i,
      /\bshell\b/i,
      /\bmobil\b/i,
      /petro[-\s]?canada/i,
      /domo\s*gas/i,
      /sunwapta/i,
      /costco\s*gas/i,
    ],
  },
  {
    categoryDetailed: "Rideshare",
    categoryPrimary: "TRANSPORTATION",
    tags: ["Online"],
    tree: {
      section: "Transport",
      category: "Rideshare",
      type: "Rideshare",
    },
    patterns: [
      /uber\s*holdings/i,
      /\buber\b(?!.*eats)/i,
      /lyft/i,
      /grab\b/i,
      /taxi/i,
    ],
  },
  {
    categoryDetailed: "Public Transit",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Transit",
      type: "Public Transit",
    },
    patterns: [
      /arc\s*transit/i,
      /mta\s*nyct/i,
      /omny/i,
      /nj\s*transit/i,
      /barkota/i,
    ],
  },
  {
    categoryDetailed: "Parking",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto Care & Expenses",
      type: "Parking",
    },
    patterns: [/epark/i, /honk\s*(mobile|parking)/i, /nyc\s*parking\s*meter/i],
  },
  {
    categoryDetailed: "Car Wash",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto Care & Expenses",
      type: "Car Wash",
    },
    patterns: [/uwash\s*carwash/i, /car\s*wash/i],
  },
  {
    categoryDetailed: "Maintenance",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto Care & Expenses",
      type: "Maintenance",
    },
    patterns: [/kal\s*tire/i, /truckland/i],
  },
  {
    categoryDetailed: "Service & Sales",
    categoryPrimary: "TRANSPORTATION",
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Dealership",
      type: "Service & Sales",
    },
    patterns: [/lexus\s*of\s*edmonton/i],
  },

  // --- Travel ---
  {
    categoryDetailed: "Hotels & Vacation Rentals",
    categoryPrimary: "TRAVEL",
    tree: {
      section: "Travel",
      category: "Lodging",
      type: "Hotels & Vacation Rentals",
    },
    patterns: [/airbnb/i, /hilton/i, /agoda/i, /the\s*crestmont/i],
  },
  {
    categoryDetailed: "Airline Tickets",
    categoryPrimary: "TRAVEL",
    tree: {
      section: "Travel",
      category: "Flights",
      type: "Airline Tickets",
    },
    patterns: [
      /cebu\s*pacific/i,
      /cebu\s*air/i,
      /cheap\s*tickets/i,
      /trip\.com/i,
    ],
  },
  {
    categoryDetailed: "Car Rental",
    categoryPrimary: "TRAVEL",
    tree: {
      section: "Travel",
      category: "Flights",
      type: "Car Rental",
    },
    patterns: [/\bavis\b/i, /etoll\s*avis/i],
  },
  {
    categoryDetailed: "In-Flight",
    categoryPrimary: "TRAVEL",
    tree: {
      section: "Travel",
      category: "Flights",
      type: "In-Flight",
    },
    patterns: [/inflight\s*internet/i],
  },
  {
    categoryDetailed: "Attractions & Tours",
    categoryPrimary: "ENTERTAINMENT",
    tree: {
      section: "Travel",
      category: "Sightseeing",
      type: "Attractions & Tours",
    },
    patterns: [
      /circle\s*line/i,
      /ocean\s*park/i,
      /pickleball/i,
      /driving\s*range/i,
    ],
  },

  // --- Health & personal ---
  {
    categoryDetailed: "Clinics & Telehealth",
    categoryPrimary: "MEDICAL",
    tree: {
      section: "Health",
      category: "Medical",
      type: "Clinics & Telehealth",
    },
    patterns: [
      /morality\s*med/i,
      /moralitymed/i,
      /pocket\s*pills/i,
      /pocketpills/i,
      /pharmacy/i,
      /shoppers\s*drug/i,
      /rexall/i,
    ],
  },
  {
    categoryDetailed: "Barbers & Salons",
    categoryPrimary: "PERSONAL_CARE",
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Barbers & Salons",
    },
    patterns: [/barber/i, /salon/i, /natan\s*barber/i],
  },
  {
    categoryDetailed: "Gym Memberships",
    categoryPrimary: "PERSONAL_CARE",
    tags: ["Subscription"],
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Gym Memberships",
    },
    patterns: [
      /movati/i,
      /goodlife/i,
      /anytime\s*fitness/i,
      /planet\s*fitness/i,
    ],
  },
  {
    categoryDetailed: "Cosmetics",
    categoryPrimary: "PERSONAL_CARE",
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Cosmetics",
    },
    patterns: [/sunnies\s*face/i],
  },
  {
    categoryDetailed: "Veterinary",
    categoryPrimary: "MEDICAL",
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Veterinary",
    },
    patterns: [/animal\s*hospital/i, /veterinar/i],
  },
  {
    categoryDetailed: "Pet Supplies",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Pet Supplies",
    },
    patterns: [/petsmart/i, /pet\s*smart/i],
  },

  // --- Entertainment & shopping ---
  {
    categoryDetailed: "Education & Training",
    categoryPrimary: "ENTERTAINMENT",
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Education & Training",
    },
    patterns: [/\bnait\b/i],
  },
  {
    categoryDetailed: "Video Games & Digital Goods",
    categoryPrimary: "ENTERTAINMENT",
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Video Games & Digital Goods",
    },
    patterns: [/steamgames/i, /steam\s*games/i, /\bsteam\b/i, /itch\.?\s*io/i],
  },
  {
    categoryDetailed: "Cinemas",
    categoryPrimary: "ENTERTAINMENT",
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Cinemas",
    },
    patterns: [/cineplex/i, /ayala\s*malls\s*cinemas/i],
  },
  {
    categoryDetailed: "Department & Online Stores",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Department & Online Stores",
    },
    patterns: [
      /amzn\s*mktp/i,
      /amazon\.ca/i,
      /amazon\.com/i,
      /\bamzn\b/i,
      /temu/i,
      /uniqlo/i,
      /\bmoma\b/i,
      /museum\s*store/i,
      /nyc\s*gifts/i,
    ],
  },
  {
    categoryDetailed: "Convenience",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Convenience",
    },
    patterns: [
      /7[-\s]?eleven/i,
      /seven\s*eleven/i,
      /lawson/i,
      /dollarama/i,
      /mac'?s\s*convenience/i,
    ],
  },
  {
    categoryDetailed: "Hobbies",
    categoryPrimary: "GENERAL_MERCHANDISE",
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Hobbies",
    },
    patterns: [
      /michaels/i,
      /this\s*is\s*blythe/i,
      /miniso/i,
      /timezone/i,
      /river\s*city\s*games/i,
    ],
  },

  // --- Home ---
  {
    categoryDetailed: "Mobile & Wireless",
    categoryPrimary: "RENT_AND_UTILITIES",
    tags: ["Subscription", "Online"],
    tree: {
      section: "Home",
      category: "Utilities & Telecom",
      type: "Mobile & Wireless",
    },
    patterns: [
      /\bfizz\b/i,
      /freedom\s*mobile/i,
      /rogers/i,
      /bell\s*mobility/i,
      /telus/i,
      /koodo/i,
      /\bsaily\b/i,
      /\bsmart\b/i,
    ],
  },
  {
    categoryDetailed: "Hardware & Tools",
    categoryPrimary: "HOME_IMPROVEMENT",
    tree: {
      section: "Home",
      category: "Home Maintenance",
      type: "Hardware & Tools",
    },
    patterns: [/home\s*depot/i, /west-end\s*registries/i, /registry/i],
  },

  // --- Finance ---
  {
    categoryDetailed: "Student Loans",
    categoryPrimary: "LOAN_PAYMENTS",
    tree: {
      section: "Finance",
      category: "Debt & Loans",
      type: "Student Loans",
    },
    patterns: [
      /nslsc/i,
      /abdl\s*student/i,
      /alberta\s*student/i,
      /national\s*student\s*loans/i,
    ],
  },
  {
    categoryDetailed: "BNPL",
    categoryPrimary: "LOAN_PAYMENTS",
    tree: {
      section: "Finance",
      category: "Debt & Loans",
      type: "BNPL",
    },
    patterns: [/affirm/i],
  },
  {
    categoryDetailed: "Personal Financing",
    categoryPrimary: "LOAN_PAYMENTS",
    tree: {
      section: "Finance",
      category: "Debt & Loans",
      type: "Personal Financing",
    },
    patterns: [
      /cibc\s*car\s*loan/i,
      /cibc\s*loans/i,
      /loan\s*payment/i,
      /preauthorized\s+debit\s+loan/i,
    ],
  },
  {
    categoryDetailed: "Monthly Fees",
    categoryPrimary: "BANK_FEES",
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Monthly Fees",
    },
    patterns: [/service\s*charge/i, /annual\s*fee/i, /account\s*fee/i],
  },
  {
    categoryDetailed: "Overdraft & Interest",
    categoryPrimary: "BANK_FEES",
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Overdraft & Interest",
    },
    patterns: [/plc\s*interest/i, /\binterest\b/i, /interest\s*reversal/i],
  },
  {
    categoryDetailed: "Transfer Fees",
    categoryPrimary: "BANK_FEES",
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Transfer Fees",
    },
    patterns: [/transfer\s*fee/i, /e-?transfer\s*network\s*fee/i],
  },
  {
    categoryDetailed: "Property & Auto Insurance",
    categoryPrimary: "LOAN_PAYMENTS",
    tree: {
      section: "Finance",
      category: "Insurance",
      type: "Property & Auto Insurance",
    },
    patterns: [/security\s*national/i, /meloche\s*monnex/i, /td\s*insurance/i],
  },
  {
    categoryDetailed: "Payment Protection",
    categoryPrimary: "LOAN_PAYMENTS",
    tags: ["Subscription"],
    tree: {
      section: "Finance",
      category: "Insurance",
      type: "Payment Protection",
    },
    patterns: [/payment\s*protector/i, /payment\s*protection/i],
  },
  {
    categoryDetailed: "Brokerage & Crypto",
    categoryPrimary: "INVESTMENTS",
    tree: {
      section: "Finance",
      category: "Investments",
      type: "Brokerage & Crypto",
    },
    patterns: [/wealthsimple/i, /coinbase/i],
  },

  // --- Cash & ATM ---
  {
    categoryDetailed: "Cash Advances",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "Cash & ATM",
      type: "Cash Advances",
    },
    patterns: [/cash\s*advance/i, /avance\s*de\s*fonds/i],
  },
  {
    categoryDetailed: "ATM Withdrawals",
    categoryPrimary: "TRANSFER",
    tree: {
      section: "Transfers",
      category: "Cash & ATM",
      type: "ATM Withdrawals",
    },
    patterns: [/\batm\b/i, /banking\s*centre/i, /namao\s*banking/i],
  },
];
