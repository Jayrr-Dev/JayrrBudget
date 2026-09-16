import type { CategoryRule } from "@/domains/enrichment/application/categoryRuleTypes";

/** Verified merchant → spend tree. First match wins. */
export const VERIFIED_SPEND_RULES: CategoryRule[] = [
  // --- Income ---
  {
    tree: {
      section: "Income",
      category: "Employment",
      type: "Salary",
    },
    patterns: [
      /pay\s*utilitek/i,
      /utilitek\s*solut/i,
      /payroll/i,
      /pay\s*cheque/i,
    ],
  },
  {
    tree: {
      section: "Income",
      category: "Tax",
      type: "Tax Credits",
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
    tree: {
      section: "Income",
      category: "Tax",
      type: "Tax Refunds",
    },
    patterns: [/tax\s*refund/i],
  },
  {
    tree: {
      section: "Income",
      category: "Cashback",
      type: "Cashback Rewards",
    },
    patterns: [/cashback/i, /remise\s*en\s*argent/i],
  },

  // --- Transfers (description-first) ---
  {
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
    tree: {
      section: "Transfers",
      category: "Account Transfers",
      type: "Self Transfers",
    },
    patterns: [/^internet\s+transfer\b/i],
  },
  {
    tree: {
      section: "Transfers",
      category: "External Transfers",
      type: "Remittances",
    },
    patterns: [/global\s+money\s+transfer/i, /cibc\s+global\s+money/i],
  },
  {
    tree: {
      section: "Transfers",
      category: "External Transfers",
      type: "Interac e-Transfer",
    },
    patterns: [/e-?transfer/i],
  },

  // --- AI Services (before generic SaaS) ---
  {
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "Model APIs",
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
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "Assistants",
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
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "AI Services",
      type: "Code Editors",
    },
    patterns: [/\bcursor\b/i, /windsurf/i, /ai\s*powered\s*ide/i],
  },

  // --- Cloud ---
  {
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud",
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
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud",
      type: "Domains",
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
    tags: ["Dev Tools", "Online"],
    tree: {
      section: "Technology",
      category: "Cloud",
      type: "Developer",
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
    tags: ["AI", "Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software",
      type: "Productivity",
    },
    patterns: [
      /canva/i,
      /capcut/i,
      /sparkrec(?:ei)?pt/i,
      /paddle\.net\*\s*spark/i,
    ],
  },

  // --- Software (non-AI) ---
  {
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software",
      type: "Productivity",
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
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software",
      type: "Communication",
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
    tags: ["Subscription", "Online"],
    tree: {
      section: "Technology",
      category: "Software",
      type: "Security",
    },
    patterns: [/nord/i, /start\.me/i, /google\s*one/i],
  },
  {
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
    tags: ["Online"],
    tree: {
      section: "Food",
      category: "Delivery",
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
    tags: ["In Store"],
    tree: {
      section: "Lifestyle",
      category: "Recreational",
      type: "Board Game Cafes",
    },
    patterns: [/hexagon\s*board\s*game/i],
  },
  {
    tags: ["In Store"],
    tree: {
      section: "Food",
      category: "Restaurants",
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
    tags: ["In Store"],
    tree: {
      section: "Food",
      category: "Groceries",
      type: "Supermarket",
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
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto",
      type: "Parking",
    },
    patterns: [/epark/i, /honk\s*(mobile|parking)/i, /nyc\s*parking\s*meter/i],
  },
  {
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto",
      type: "Car Wash",
    },
    patterns: [/uwash\s*carwash/i, /car\s*wash/i],
  },
  {
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Auto",
      type: "Maintenance",
    },
    patterns: [/kal\s*tire/i, /truckland/i],
  },
  {
    tags: ["In Store"],
    tree: {
      section: "Transport",
      category: "Dealership",
      type: "Service",
    },
    patterns: [/lexus\s*of\s*edmonton/i],
  },

  // --- Travel ---
  {
    tree: {
      section: "Travel",
      category: "Lodging",
      type: "Vacation Rentals",
    },
    patterns: [/airbnb/i, /hilton/i, /agoda/i, /the\s*crestmont/i],
  },
  {
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
    tree: {
      section: "Travel",
      category: "Flights",
      type: "Car Rental",
    },
    patterns: [/\bavis\b/i, /etoll\s*avis/i],
  },
  {
    tree: {
      section: "Travel",
      category: "Flights",
      type: "In-Flight",
    },
    patterns: [/inflight\s*internet/i],
  },
  {
    tree: {
      section: "Travel",
      category: "Sightseeing",
      type: "Attractions",
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
    tree: {
      section: "Health",
      category: "Medical",
      type: "Clinics",
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
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Barbers",
    },
    patterns: [/barber/i, /salon/i, /natan\s*barber/i],
  },
  {
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
    tree: {
      section: "Lifestyle",
      category: "Personal Care",
      type: "Cosmetics",
    },
    patterns: [/sunnies\s*face/i],
  },
  {
    tree: {
      section: "Family",
      category: "Pets",
      type: "Veterinary",
    },
    patterns: [/animal\s*hospital/i, /veterinar/i],
  },
  {
    tree: {
      section: "Family",
      category: "Pets",
      type: "Pet Supplies",
    },
    patterns: [/petsmart/i, /pet\s*smart/i],
  },

  // --- Entertainment & shopping ---
  {
    tree: {
      section: "Development",
      category: "Education",
      type: "Courses",
    },
    patterns: [/\bnait\b/i],
  },
  {
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Games",
    },
    patterns: [/steamgames/i, /steam\s*games/i, /\bsteam\b/i, /itch\.?\s*io/i],
  },
  {
    tree: {
      section: "Lifestyle",
      category: "Entertainment",
      type: "Cinemas",
    },
    patterns: [/cineplex/i, /ayala\s*malls\s*cinemas/i],
  },
  {
    tags: ["Online"],
    tree: {
      section: "Lifestyle",
      category: "Shopping",
      type: "Online Stores",
    },
    patterns: [
      /amzn\s*mktp/i,
      /amazon\.ca/i,
      /amazon\.com/i,
      /\bamzn\b/i,
      /temu/i,
      /uniqlo/i,
      /\baldo\b/i,
      /rustan'?s/i,
      /caminade/i,
      /\bmoma\b/i,
      /museum\s*store/i,
      /nyc\s*gifts/i,
    ],
  },
  {
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
    tags: ["Subscription", "Online"],
    tree: {
      section: "Home",
      category: "Utilities",
      type: "Mobile",
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
    tree: {
      section: "Home",
      category: "Home Maintenance",
      type: "Hardware",
    },
    patterns: [/home\s*depot/i, /west-end\s*registries/i, /registry/i],
  },

  // --- Finance ---
  {
    tree: {
      section: "Finance",
      category: "Loans",
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
    tree: {
      section: "Finance",
      category: "Loans",
      type: "BNPL",
    },
    patterns: [/affirm/i],
  },
  {
    tree: {
      section: "Finance",
      category: "Loans",
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
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Monthly Fees",
    },
    patterns: [/service\s*charge/i, /annual\s*fee/i, /account\s*fee/i],
  },
  {
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Interest",
    },
    patterns: [/plc\s*interest/i, /\binterest\b/i, /interest\s*reversal/i],
  },
  {
    tree: {
      section: "Finance",
      category: "Banking Fees",
      type: "Transfer Fees",
    },
    patterns: [/transfer\s*fee/i, /e-?transfer\s*network\s*fee/i],
  },
  {
    tree: {
      section: "Finance",
      category: "Insurance",
      type: "Home Insurance",
    },
    patterns: [/security\s*national/i, /meloche\s*monnex/i, /td\s*insurance/i],
  },
  {
    tags: ["Subscription"],
    tree: {
      section: "Finance",
      category: "Insurance",
      type: "Payment Protection",
    },
    patterns: [/payment\s*protector/i, /payment\s*protection/i],
  },
  {
    tree: {
      section: "Finance",
      category: "Investments",
      type: "Brokerage",
    },
    patterns: [/wealthsimple/i, /coinbase/i],
  },

  // --- ATM ---
  {
    tree: {
      section: "Transfers",
      category: "ATM",
      type: "Cash Advances",
    },
    patterns: [/cash\s*advance/i, /avance\s*de\s*fonds/i],
  },
  {
    tree: {
      section: "Transfers",
      category: "ATM",
      type: "ATM Withdrawals",
    },
    patterns: [/\batm\b/i, /banking\s*centre/i, /namao\s*banking/i],
  },
];
