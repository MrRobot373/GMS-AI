/** Money: loans and amortization, compound interest, present and future value, growth rates. */
import { ExprError } from "./expression";

/** Payment per period for a loan (annuity-immediate). rate is per period. */
export function payment(principal: number, rate: number, periods: number): number {
  if (!(periods > 0)) throw new ExprError("The number of payments must be greater than 0");
  if (rate === 0) return principal / periods;
  return (principal * rate) / (1 - (1 + rate) ** -periods);
}

export interface AmortizationRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Loan schedule; annual rate in percent, payments per year (12 = monthly). */
export function amortize(principal: number, annualRatePct: number, years: number, perYear = 12, extra = 0) {
  if (!(principal > 0)) throw new ExprError("The loan amount must be greater than 0");
  if (annualRatePct < 0) throw new ExprError("The interest rate can't be negative");
  if (!(years > 0)) throw new ExprError("The term must be greater than 0");
  const r = annualRatePct / 100 / perYear;
  const n = Math.round(years * perYear);
  const pmt = payment(principal, r, n);
  const rows: AmortizationRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  for (let k = 1; k <= n && balance > 1e-9; k++) {
    const interest = balance * r;
    let principalPart = pmt - interest + extra;
    if (principalPart > balance) principalPart = balance;
    balance -= principalPart;
    totalInterest += interest;
    rows.push({ period: k, payment: principalPart + interest, interest, principal: principalPart, balance: Math.max(0, balance) });
  }
  return { payment: pmt, periods: rows.length, totalInterest, totalPaid: principal + totalInterest, rows };
}

/** Future value of a present amount plus regular deposits (end of period). */
export function futureValue(pv: number, annualRatePct: number, years: number, perYear = 1, deposit = 0) {
  const r = annualRatePct / 100 / perYear;
  const n = years * perYear;
  const growth = (1 + r) ** n;
  const fvDeposits = r === 0 ? deposit * n : deposit * ((growth - 1) / r);
  return pv * growth + fvDeposits;
}

export function presentValue(fv: number, annualRatePct: number, years: number, perYear = 1) {
  const r = annualRatePct / 100 / perYear;
  return fv / (1 + r) ** (years * perYear);
}

/** Effective annual rate from a nominal rate compounded m times a year (APY, EAR). */
export function effectiveRate(nominalPct: number, perYear: number) {
  if (perYear === Infinity) return (Math.exp(nominalPct / 100) - 1) * 100;
  if (!(perYear >= 1)) throw new ExprError("Compounding must happen at least once a year");
  return ((1 + nominalPct / 100 / perYear) ** perYear - 1) * 100;
}

export function cagr(start: number, end: number, years: number) {
  if (!(start > 0) || !(end > 0)) throw new ExprError("Start and end values must be greater than 0");
  if (!(years > 0)) throw new ExprError("The number of years must be greater than 0");
  return ((end / start) ** (1 / years) - 1) * 100;
}

/** Net present value of cash flows (first at t = 0). */
export function npv(ratePct: number, flows: number[]) {
  const r = ratePct / 100;
  return flows.reduce((s, c, t) => s + c / (1 + r) ** t, 0);
}

/** Internal rate of return, by bisection on NPV (percent). */
export function irr(flows: number[]) {
  if (!flows.some((f) => f < 0) || !flows.some((f) => f > 0)) throw new ExprError("IRR needs at least one negative and one positive cash flow");
  let lo = -99.9999;
  let hi = 1000;
  const f = (r: number) => npv(r, flows);
  if (f(lo) * f(hi) > 0) throw new ExprError("No IRR found between -100% and 1000%");
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (f(lo) * f(m) <= 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}
