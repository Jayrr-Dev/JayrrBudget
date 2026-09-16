import assert from "node:assert/strict";
import { cleanMerchantDescriptor } from "../convex/lib/cleanMerchantDescriptor";

function check(input: string, expected: string) {
  const got = cleanMerchantDescriptor(input);
  assert.equal(got, expected, `${input} → ${got} (expected ${expected})`);
}

check("AIRBNB *HM3YTARTTM AIRBNB.COM", "Airbnb");
check("ALDO CEBU CITY 12,280.00 PHP @ 0.024", "ALDO");
check("RUSTANS DEPT STORE CEBU CITY 6,760.00 PHP @ 0.024", "Rustans Dept Store");
check("SALON DE ROSE CEN BLOC CEBU 6,500.00 PHP @ 0.024", "Salon de Rose");
check("L CAMINADE TAN MKTG CEBU CITY 5,270.00 PHP @ 0.024", "L Caminade Tan Mktg");
check("Marblism", "Marblism");
check("Loan Payment", "Loan Payment");
check("Tim Hortons", "Tim Hortons");
check("UBER EATS", "Uber Eats");
check("USD 12.00 @ 1.42 AIRBNB", "Airbnb");

console.log("ok");
