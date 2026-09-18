import assert from "node:assert/strict";
import { cleanMerchantDescriptor } from "../convex/lib/cleanMerchantDescriptor";

function check(input: string, expected: string) {
  const got = cleanMerchantDescriptor(input);
  assert.equal(got, expected, `${input} → ${got} (expected ${expected})`);
}

check("AIRBNB *HM3YTARTTM AIRBNB.COM", "Airbnb");
check("ALDO CEBU CITY 12,280.00 PHP @ 0.024", "Aldo");
check(
  "RUSTANS DEPT STORE CEBU CITY 6,760.00 PHP @ 0.024",
  "Rustans Dept Store",
);
check("SALON DE ROSE CEN BLOC CEBU 6,500.00 PHP @ 0.024", "Salon de Rose");
check(
  "L CAMINADE TAN MKTG CEBU CITY 5,270.00 PHP @ 0.024",
  "L Caminade Tan Mktg",
);
check("Marblism", "Marblism");
check("Loan Payment", "Loan Payment");
check("Tim Hortons", "Tim Hortons");
check("UBER EATS", "Uber Eats");
check("USD 12.00 @ 1.42 AIRBNB", "Airbnb");
check("Pos Debit - Uber", "Uber");
check("POS DEBIT - STARBUCKS", "Starbucks");
check("POS DEBIT - PETRO-CANADA", "Petro-Canada");
check("POS DEBIT - HUDSON'S BAY", "Hudson's Bay");
check("INTERAC DEBIT - SAVE-ON-FOODS", "Save-On-Foods");
check("VISA DEBIT SKIPTHEDISHES", "SkipTheDishes");

// Chequing rails: the payee follows the dash.
check("Bill Payment - CIBC Visa", "CIBC Visa");
check("BILL PAYMENT - CIBC VISA", "CIBC Visa");
check("Online Payment - Ualberta", "UAlberta");
check("Direct Dep - Utilitek", "Utilitek");
check("Eft Rent - Boardwalk", "Boardwalk");
check("Donation - Canadian Red Cross", "Canadian Red Cross");
check("E-Transfer - John Smith", "John Smith");
check("Payment - Enmax", "Enmax");
check("INTERNET BILL PAY - EPCOR", "Epcor");

// ATM lines name the bank whose machine it was.
check("Atm Withdrawal - TD 0816", "TD ATM");
check("ATM WITHDRAWAL - CIBC 12345", "CIBC ATM");
check("Atm Withdrawal -", "ATM Withdrawal");

// Trailing account / card numbers are not part of the name.
check("Transfer To Savings 0092", "Transfer to Savings");
check("Internet Transfer To Card 4500***1654", "Internet Transfer to Card");
check("Tim Hortons Toronto ON", "Tim Hortons");

// Nothing but the rail survived the parser: name the rail, not "Pad -".
check("Pad -", "Pre-Authorized Debit");
check("Pad", "Pre-Authorized Debit");
check("Online Purchase -", "Online Purchase");
check("Bill Payment -", "Bill Payment");

// Bank-internal lines and real payees that end in a place word stay intact.
check("Monthly Plan Fee", "Monthly Plan Fee");
check("Credit Interest", "Credit Interest");
check("Air Canada", "Air Canada");
check("Air Canada Vancouver", "Air Canada");
check("Uber Canada", "Uber");
check("Interac E-transfer Out", "Interac E-transfer Out");
check("Payment Protector Insurance", "Payment Protector Insurance");

console.log("ok");
