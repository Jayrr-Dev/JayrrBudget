/** Statement amounts as integer minor units (cents). */

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function toMajor(amountMinor: number): number {
  return amountMinor / 100;
}

/** Statement convention: positive = money out. Analytics signed: spend negative. */
export function signedMajorFromStatement(amountMajor: number): number {
  return -amountMajor;
}

export function directionFromStatementAmount(amountMajor: number): string {
  return amountMajor > 0 ? "outflow" : amountMajor < 0 ? "inflow" : "outflow";
}
