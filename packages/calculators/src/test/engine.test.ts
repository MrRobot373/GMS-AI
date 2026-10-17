/** The expression engine, calculus, algebra, statistics, finance, units and tools. */
import { describe, expect, it } from "vitest";
import { calc, ExprError, parse } from "../expression";
import { differentiate, toString } from "../symbolic";
import * as calculus from "../calculus";
import * as algebra from "../algebra";
import * as matrix from "../matrix";
import * as stats from "../stats";
import * as finance from "../finance";
import * as tools from "../tools";
import { conversion, convert, QUANTITIES } from "../units";

const near = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b) / Math.max(1, Math.abs(b))).toBeLessThanOrEqual(rel);

describe("expressions", () => {
  it("EXP (ᴇ) is ×10ⁿ, never the variable E", () => {
    expect(calc("2ᴇ3")).toBe(2000);
    expect(calc("2ᴇ-3")).toBeCloseTo(0.002, 15);
    expect(calc("2ᴇ−3")).toBeCloseTo(0.002, 15);
    expect(calc("2ᴇ(-3)")).toBeCloseTo(0.002, 15);
    expect(calc("2ᴇ(-3")).toBeCloseTo(0.002, 15); // as 2 EXP (−) 3 leaves it
    expect(calc("1.5ᴇ6/3")).toBe(500000);
    expect(calc("ᴇ3")).toBe(1000);
    // A stored E changes nothing: 2 EXP (−) 3 once gave 2·E·(−3) = −30.
    expect(calc("2ᴇ(-3)", { vars: { E: 5 } })).toBeCloseTo(0.002, 15);
    expect(calc("2E", { vars: { E: 5 } })).toBe(10);
    expect(() => calc("2ᴇ")).toThrow(/power of ten/);
    // Typos are errors, not products.
    for (const typo of ["1.2.3", "2.5.5", "2 3", "20 0.5", "2ᴇ3 4"]) expect(() => calc(typo), typo).toThrow(/Two numbers in a row/);
    expect(calc("(2)3")).toBe(6);
    expect(calc("2(3)")).toBe(6);
    expect(() => calc("2ᴇ1.5")).toThrow();
  });
  const cases: [string, number, object?][] = [
    ["1+2*3", 7],
    ["(1+2)*3", 9],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["(-2)^2", 4],
    ["2^-1", 0.5],
    ["10/4", 2.5],
    ["0.1+0.2", 0.3],
    ["5!", 120],
    ["0!", 1],
    ["3!^2", 36],
    ["200+10%", 220],
    ["200-10%", 180],
    ["50%", 0.5],
    ["50%*80", 40],
    ["2pi", 2 * Math.PI],
    ["2(3+4)", 14],
    ["(1+1)(2+2)", 8],
    ["6/2(1+2)", 1],
    ["1/2pi", 1 / (2 * Math.PI)],
    ["√16", 4],
    ["2√9", 6],
    ["∛-27", -3],
    ["|-3|+|2-5|", 6],
    ["sin(30)", 0.5, { angle: "deg" }],
    ["sin 30", 0.5, { angle: "deg" }],
    ["cos(pi)", -1],
    ["tan(45)", 1, { angle: "deg" }],
    ["sin(100)", 1, { angle: "grad" }],
    ["asin(1)", 90, { angle: "deg" }],
    ["atan2(1,1)", 45, { angle: "deg" }],
    ["sin(90°)", 1, { angle: "rad" }],
    ["sinh(0)", 0],
    ["cosh(0)", 1],
    ["ln(e)", 1],
    ["log(1000)", 3],
    ["log(8,2)", 3],
    ["log2(1024)", 10],
    ["exp(0)", 1],
    ["root(32,5)", 2],
    ["(-8)^(1/3)", -2],
    ["5 nCr 2", 10],
    ["5 nPr 2", 20],
    ["nCr(52,5)", 2598960],
    ["10 mod 3", 1],
    ["-7 mod 3", 2],
    ["gcd(12,18)", 6],
    ["lcm(4,6)", 12],
    ["1e3+1E-3", 1000.001],
    ["3×4÷2−1", 5],
    ["2²+3³", 31],
    ["[1+{2*3}]", 7],
    ["round(2.567,2)", 2.57],
    ["max(1,5,3)", 5],
    ["hypot(3,4)", 5],
    ["gamma(5)", 24],
    ["c0", 299792458],
    ["NA*qe", 96485.33212331],
  ];
  for (const [src, want, opts] of cases) it(`${src} = ${want}`, () => near(calc(src, opts as never), want));

  it("uses variables and multiplies letters written together", () => {
    expect(calc("A+B*X", { vars: { A: 1, B: 2, X: 3 } })).toBe(7);
    near(calc("1/2πfC", { vars: { f: 50, C: 1e-6 } }), 3183.09886183791);
    expect(calc("Ans*2", { vars: { Ans: 21 } })).toBe(42);
  });
  it("draws random numbers from the source it is given", () => {
    expect(calc("rand()", { random: () => 0.25 })).toBe(0.25);
    expect(calc("randint(1,6)", { random: () => 0.999 })).toBe(6);
  });
  const bad: [string, RegExp][] = [
    ["", /Enter an expression/],
    ["1+", /ends too early/],
    ["(1+2", /closing bracket/],
    ["1+2)", /closing bracket/],
    ["1/0", /Division by zero/],
    ["0^-1", /Division by zero/],
    ["sqrt(-1)", /negative/],
    ["ln(0)", /greater than 0/],
    ["log(-5)", /greater than 0/],
    ["asin(2)", /-1 to 1/],
    ["tan(90)", /undefined/],
    ["(-2)^0.5", /isn't a real number/],
    ["3.5!", /whole number/],
    ["10^400", /too large/],
    ["171!", /too large/],
    ["foo+1", /Unknown name "foo"/],
    ["1 # 2", /Unexpected character/],
    ["log(1,2,3)", /takes 1 to 2/],
    ["*3", /needs a number/],
    ["5 mod 0", /Division by zero/],
  ];
  for (const [src, re] of bad) {
    it(`refuses ${JSON.stringify(src)}`, () => {
      expect(() => calc(src, { angle: "deg" })).toThrow(ExprError);
      expect(() => calc(src, { angle: "deg" })).toThrow(re);
    });
  }
});

describe("symbolic derivatives", () => {
  const cases: [string, string][] = [
    ["x^3+2x^2-x+5", "3x^2 + 4x - 1"],
    ["sin(x)", "cos(x)"],
    ["exp(2x)", "2exp(2x)"],
    ["ln(x)/x", "(1 - ln(x)) / x^2"],
    ["5", "0"],
    ["x", "1"],
  ];
  for (const [f, d] of cases) it(`d/dx ${f} = ${d}`, () => expect(toString(differentiate(parse(f)))).toBe(d));

  it("agrees with numeric differentiation", () => {
    for (const f of ["x^x", "sin(x)^2*cos(3x)", "atan(x)/sqrt(1+x^2)", "log(x^2+1)", "tanh(x)*exp(-x)", "acos(x/2)", "cbrt(x)+abs(x)"]) {
      const d = toString(differentiate(parse(f)));
      for (const x of [0.3, 0.7, 1.3]) {
        const sym = calc(d, { vars: { x } });
        const num = calculus.numericDerivative((t) => calc(f, { vars: { x: t } }), x);
        expect(Math.abs(sym - num), `${f} at ${x}: ${d}`).toBeLessThan(1e-6);
      }
    }
  });
  it("re-parses its own output to the same value", () => {
    for (const f of ["1/(2*x)", "x/(x+1)", "(x-1)/(x-2)/(x-3)", "2^x", "x^-2"]) {
      const d = toString(differentiate(parse(f)));
      const num = calculus.numericDerivative((t) => calc(f, { vars: { x: t } }), 0.5);
      near(calc(d, { vars: { x: 0.5 } }), num, 1e-6);
    }
  });
  it("higher orders and values", () => {
    const r = calculus.derivative("x^4", { order: 3, at: 2 });
    expect(r.derivative).toBe("24x");
    expect(r.valueAt).toBe(48);
  });
});

describe("calculus", () => {
  it("integrates", () => {
    near(calculus.integrate("x^2", 0, 3).value, 9);
    near(calculus.integrate("sin(x)", 0, Math.PI).value, 2);
    near(calculus.integrate("exp(-x^2)", -10, 10).value, Math.sqrt(Math.PI));
    near(calculus.integrate("1/x", 1, Math.E).value, 1);
    near(calculus.integrate("x", 3, 1).value, -4);
    expect(() => calculus.integrate("1/x", -1, 1)).toThrow(/isn't defined/);
  });
  it("finds limits", () => {
    expect(calculus.limit("sin(x)/x", 0).value).toBe(1);
    expect(calculus.limit("(x^2-1)/(x-1)", 1).value).toBe(2);
    expect(calculus.limit("1/x", 0).verdict).toBe("different sides");
    expect(calculus.limit("1/x^2", 0).verdict).toBe("infinite");
    near(calculus.limit("(1+1/x)^x", "inf").value!, Math.E, 1e-6);
    expect(calculus.limit("1/x", 0, { side: "right" }).value).toBe(Infinity);
  });
  it("Taylor series", () => {
    expect(calculus.taylor("exp(x)", 0, 3).coefficients).toEqual([1, 1, 0.5, 0.166666666667]);
    expect(calculus.taylor("sin(x)", 0, 5).polynomial).toBe("x - 0.1666666667x^3 + 0.008333333333x^5");
  });
  it("sums, tangents and roots", () => {
    expect(calculus.summation("k", 1, 100)).toBe(5050);
    near(calculus.summation("1/k^2", 1, 1000000), Math.PI ** 2 / 6, 1e-6);
    expect(calculus.tangentLine("x^2", 3).equation).toBe("y = 6x - 9");
    expect(calculus.findRoots("x^2-2", -5, 5).map((r) => Number(r.toFixed(10)))).toEqual([-1.4142135624, 1.4142135624]);
    // The pole of tan at ±π/2 isn't a root.
    expect(calculus.findRoots("tan(x)", -2, 2)).toEqual([0]);
    expect(calculus.horizontalTangents("x^3-3x", -3, 3).map((r) => Math.round(r * 1e9) / 1e9)).toEqual([-1, 1]);
  });
});

describe("algebra", () => {
  const roots = (c: number[]) => algebra.polynomialRoots(c).roots.map((z) => algebra.formatComplex(z, 9));
  it("solves polynomials", () => {
    expect(roots([2, -4])).toEqual(["2"]);
    expect(roots([1, -3, 2])).toEqual(["1", "2"]);
    expect(roots([1, 2, 1])).toEqual(["-1", "-1"]);
    expect(roots([1, 0, 1])).toEqual(["-i", "i"]);
    expect(roots([1, 2, 5])).toEqual(["-1 - 2i", "-1 + 2i"]);
    expect(roots([1, -6, 11, -6])).toEqual(["1", "2", "3"]);
    expect(roots([1, 0, 0, 0, -16])).toEqual(["-2", "-2i", "2i", "2"]);
    // Cancellation-safe: tiny root of x² - 1e8·x + 1.
    const r = algebra.polynomialRoots([1, -1e8, 1]).roots;
    near(r[0]!.re, 1e-8, 1e-9);
    expect(() => algebra.polynomialRoots([0, 0, 0])).toThrow(/every x/);
    expect(() => algebra.polynomialRoots([0, 0, 5])).toThrow(/no solution/);
  });
  it("divides polynomials", () => {
    expect(algebra.polyDivide([1, -3, 2], [1, -1])).toEqual({ quotient: [1, -2], remainder: [0] });
    expect(algebra.polyDivide([1, 0, 1], [1, 1])).toEqual({ quotient: [1, -1], remainder: [2] });
    expect(algebra.formatPolynomial([3, -2, 0, 1])).toBe("3x³ - 2x² + 1");
  });
  it("solves linear systems", () => {
    expect(algebra.solveLinear([[2, 1], [1, -1]], [5, 1])).toEqual({ solution: [2, 1], status: "unique" });
    expect(algebra.solveLinear([[1, 1, 1], [0, 2, 5], [2, 5, -1]], [6, -4, 27])).toEqual({ solution: [5, 3, -2], status: "unique" });
    expect(algebra.solveLinear([[1, 1], [2, 2]], [1, 3]).status).toBe("none");
    expect(algebra.solveLinear([[1, 1], [2, 2]], [1, 2]).status).toBe("infinite");
  });
  it("complex numbers", () => {
    const z = algebra.parseComplex("3+4i");
    expect(algebra.cabs(z)).toBe(5);
    expect(algebra.formatComplex(algebra.cmul(z, algebra.parseComplex("1-2i")))).toBe("11 - 2i");
    expect(algebra.formatComplex(algebra.cdiv(algebra.parseComplex("1"), algebra.parseComplex("i")))).toBe("-i");
    expect(algebra.formatComplex(algebra.csqrt(algebra.parseComplex("-4")))).toBe("2i");
    expect(algebra.parseComplex("-2.5j")).toEqual({ re: 0, im: -2.5 });
    expect(() => algebra.parseComplex("3+4k")).toThrow();
  });
  it("exact fractions", () => {
    const f = algebra.fadd(algebra.parseFraction("1/3"), algebra.parseFraction("1/6"));
    expect(algebra.formatFraction(f).fraction).toBe("1/2");
    expect(algebra.formatFraction(algebra.parseFraction("-1 1/2")).fraction).toBe("-3/2");
    expect(algebra.formatFraction(algebra.parseFraction("0.125")).fraction).toBe("1/8");
    expect(algebra.formatFraction(algebra.fdiv(algebra.frac(7), algebra.frac(2))).mixed).toBe("3 1/2");
    expect(algebra.formatFraction(algebra.toFraction(0.3333333333333333)).fraction).toBe("1/3");
    expect(algebra.formatFraction(algebra.toFraction(Math.PI, 1000)).fraction).toBe("355/113");
    expect(() => algebra.parseFraction("1/0")).toThrow(/denominator/);
  });
  it("primes, gcd, lcm", () => {
    expect(algebra.primeFactors(360)).toEqual([{ prime: 2, power: 3 }, { prime: 3, power: 2 }, { prime: 5, power: 1 }]);
    expect(algebra.primeFactors(97)).toEqual([{ prime: 97, power: 1 }]);
    expect(algebra.isPrime(2147483647)).toBe(true);
    expect(algebra.isPrime(1)).toBe(false);
    expect(algebra.primesUpTo(20)).toEqual([2, 3, 5, 7, 11, 13, 17, 19]);
    expect(algebra.gcd([48, 180, 64])).toBe(4);
    expect(algebra.lcm([4, 6, 10])).toBe(60);
  });
  it("number bases, two's complement, bitwise, IEEE 754", () => {
    expect(algebra.convertBase("255", 10, 16)).toBe("ff");
    expect(algebra.convertBase("0b1010", 2, 10)).toBe("10");
    expect(algebra.convertBase("ffffffffffffffffff", 16, 10)).toBe("4722366482869645213695");
    expect(algebra.convertBase("-z", 36, 10)).toBe("-35");
    expect(() => algebra.convertBase("12", 2, 10)).toThrow(/digit in base 2/);
    expect(algebra.twosComplement(-5, 8)).toBe("11111011");
    expect(() => algebra.twosComplement(200, 8)).toThrow(/doesn't fit/);
    expect(algebra.bitwise("xor", 0b1100n, 0b1010n, 8)).toBe(0b0110n);
    expect(algebra.bitwise("not", 0n, 0n, 8)).toBe(255n);
    expect(algebra.bitwise("shl", 0x80n, 1n, 8)).toBe(0n);
    expect(algebra.ieee754(1, 32).hex).toBe("3f800000");
    expect(algebra.ieee754(-2.5, 64).hex).toBe("c004000000000000");
    near(algebra.ieee754(0.1, 32).error, 1.4901161138336505e-9, 1e-6);
  });
  it("Roman numerals", () => {
    expect(algebra.toRoman(1994)).toBe("MCMXCIV");
    expect(algebra.fromRoman("mmxxvi")).toBe(2026);
    expect(() => algebra.fromRoman("IIII")).toThrow(/standard/);
    expect(() => algebra.toRoman(4000)).toThrow();
  });
  it("sequences", () => {
    expect(algebra.arithmeticSequence(2, 3, 10)).toMatchObject({ nth: 29, sum: 155 });
    expect(algebra.geometricSequence(1, 2, 10)).toMatchObject({ nth: 512, sum: 1023, infiniteSum: null });
    expect(algebra.geometricSequence(1, 0.5, 3).infiniteSum).toBe(2);
  });
});

describe("matrices and vectors", () => {
  it("basic operations", () => {
    expect(matrix.multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[19, 22], [43, 50]]);
    expect(matrix.transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
    expect(matrix.determinant([[1, 2], [3, 4]])).toBe(-2);
    expect(matrix.determinant([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toBe(-306);
    expect(matrix.inverse([[4, 7], [2, 6]])).toEqual([[0.6, -0.7], [-0.2, 0.4]]);
    expect(() => matrix.inverse([[1, 2], [2, 4]])).toThrow(/singular/);
    expect(matrix.power([[1, 1], [1, 0]], 10)).toEqual([[89, 55], [55, 34]]);
    expect(() => matrix.add([[1]], [[1, 2]])).toThrow(/same size/);
    expect(matrix.eigenvalues2([[2, 0], [0, 3]])).toEqual([{ re: 2, im: 0 }, { re: 3, im: 0 }]);
  });
  it("vectors", () => {
    expect(matrix.dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(matrix.cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    near(matrix.angleBetween([1, 0], [1, 1]), Math.PI / 4);
  });
});

describe("statistics", () => {
  const d = [2, 4, 4, 4, 5, 5, 7, 9];
  it("describes data", () => {
    const s = stats.describe(d);
    expect(s).toMatchObject({ count: 8, mean: 5, median: 4.5, modes: [4], min: 2, max: 9, range: 7, populationStdDev: 2 });
    near(s.sampleStdDev!, 2.138089935299395);
    expect(stats.quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(stats.modes([1, 2, 3])).toEqual([]);
    expect(() => stats.variance([1])).toThrow(/at least 2/);
    expect(stats.parseData("1, 2;3\t4\n5")).toEqual([1, 2, 3, 4, 5]);
    expect(() => stats.parseData("1, x")).toThrow(/"x"/);
  });
  it("regression", () => {
    const r = stats.linearRegression([1, 2, 3, 4], [2, 4, 6, 8.5]);
    near(r.slope, 2.15);
    near(r.intercept, -0.25);
    expect(r.r).toBeGreaterThan(0.99);
  });
  it("distributions against published tables", () => {
    near(stats.normalCdf(1.96), 0.9750021048517795, 1e-12);
    near(stats.normalCdf(-3), 0.0013498980316301, 1e-10);
    near(stats.normalInv(0.975), 1.959963984540054, 1e-12);
    near(stats.erf(0.5), 0.5204998778130465, 1e-12);
    near(stats.tCdf(2.228, 10), 0.975, 1e-4);
    near(stats.chiSquareCdf(3.841, 1), 0.95, 1e-4);
    near(stats.pValue(1.96, 2), 0.05, 1e-3);
    near(stats.binomial(10, 3, 0.5).pmf, 0.1171875);
    near(stats.poisson(2, 0).pmf, Math.exp(-2));
    near(stats.chiSquareTest([10, 20, 30], [20, 20, 20]).chi2, 10);
  });
});

describe("finance", () => {
  it("loans and growth", () => {
    near(finance.payment(100000, 0.005, 360), 599.5505251527569);
    const a = finance.amortize(100000, 6, 30);
    expect(a.rows.length).toBe(360);
    expect(a.rows.at(-1)!.balance).toBeLessThan(1e-6);
    near(a.totalInterest, 115838.189055, 1e-9);
    expect(finance.amortize(100000, 6, 30, 12, 200).rows.length).toBeLessThan(360);
    near(finance.futureValue(1000, 5, 10), 1628.894626777442);
    near(finance.effectiveRate(12, 12), 12.682503013196972);
    near(finance.cagr(100, 200, 5), 14.869835499703509);
    near(finance.npv(10, [-1000, 500, 500, 500]), 243.4259954921112);
    near(finance.irr([-1000, 500, 500, 500]), 23.375192852826, 1e-9);
  });
});

describe("units", () => {
  it("converts", () => {
    near(convert(1, "length", "in", "mm"), 25.4);
    near(convert(100, "temperature", "C", "F"), 212);
    near(convert(-40, "temperature", "F", "C"), -40);
    near(convert(0, "temperature", "C", "K"), 273.15);
    near(convert(1, "pressure", "atm", "psi"), 14.69594877551, 1e-11);
    near(convert(1, "energy", "kWh", "BTU"), 3412.141633128, 1e-11);
    near(convert(1, "power", "hp", "W"), 745.6998715823, 1e-12);
    near(convert(8, "fuelEconomy", "L/100km", "mpg"), 29.401822916667, 1e-11);
    near(convert(1, "data", "GiB", "MB"), 1073.741824);
    near(convert(1, "angle", "turn", "deg"), 360);
  });
  it("shows factors for plain units only", () => {
    expect(conversion(1, "length", "ft", "m").factor).toBeCloseTo(0.3048, 15);
    expect(conversion(1, "temperature", "C", "F").factor).toBeNull();
  });
  it("every unit round-trips", () => {
    for (const q of QUANTITIES) for (const u of q.units) near(u.fromBase(u.toBase(3.7)), 3.7, 1e-12);
  });
  it("refuses a unit of another quantity", () => {
    expect(() => convert(1, "length", "kg", "m")).toThrow(/not a unit of length/);
  });
});

describe("tools", () => {
  it("resistor colour codes", () => {
    expect(tools.decodeResistor(["yellow", "violet", "red", "gold"])).toMatchObject({ ohms: 4700, tolerance: 5 });
    expect(tools.decodeResistor(["brown", "black", "black", "red", "brown"])).toMatchObject({ ohms: 10000, tolerance: 1 });
    expect(tools.decodeResistor(["red", "red", "gold", "gold"]).ohms).toBe(2.2);
    expect(tools.decodeResistor(["brown", "black", "orange"]).tolerance).toBe(20);
    expect(tools.encodeResistor(4700)).toEqual(["yellow", "violet", "red", "gold"]);
    expect(tools.encodeResistor(2.2)).toEqual(["red", "red", "gold", "gold"]);
    expect(() => tools.decodeResistor(["gold", "black", "red"])).toThrow(/Band 1/);
  });
  it("molar mass", () => {
    near(tools.molarMass("H2O").molarMass, 18.015);
    near(tools.molarMass("H2SO4").molarMass, 98.072);
    near(tools.molarMass("Ca(OH)2").molarMass, 74.092);
    near(tools.molarMass("CuSO4·5H2O").molarMass, 249.677);
    expect(() => tools.molarMass("Xy2")).toThrow(/Unknown element/);
    expect(() => tools.molarMass("Ca(OH2")).toThrow(/bracket/);
  });
  it("subnets", () => {
    expect(tools.subnet("192.168.1.130/26")).toMatchObject({ network: "192.168.1.128", broadcast: "192.168.1.191", firstHost: "192.168.1.129", lastHost: "192.168.1.190", usableHosts: 62, mask: "255.255.255.192", private: true });
    expect(tools.subnet("10.0.0.1", "255.0.0.0")).toMatchObject({ prefix: 8, addresses: 16777216 });
    expect(tools.subnet("8.8.8.8/32")).toMatchObject({ usableHosts: 1, private: false });
    expect(() => tools.subnet("300.1.1.1/24")).toThrow(/isn't an IPv4/);
    expect(() => tools.subnet("10.0.0.1", "255.0.255.0")).toThrow(/contiguous/);
  });
  it("dates and times", () => {
    expect(tools.dateDifference("2026-01-01", "2026-12-25")).toMatchObject({ days: 358, years: 0, months: 11, remainingDays: 24 });
    expect(tools.dateDifference("2026-10-16", "2026-10-23").weekdays).toBe(5);
    expect(tools.addToDate("2024-01-31", { months: 1 }).date).toBe("2024-02-29");
    expect(tools.addToDate("2026-12-25", { days: 7 })).toEqual({ date: "2027-01-01", weekday: "Friday" });
    expect(tools.age("2000-02-29", "2026-02-28")).toMatchObject({ years: 25, months: 11 });
    expect(() => tools.dateDifference("2026-02-30", "2026-03-01")).toThrow(/real date/);
    expect(tools.parseDuration("1:30")).toBe(5400);
    expect(tools.parseDuration("2h 15m")).toBe(8100);
    expect(tools.formatDuration(tools.parseDuration("1:45") + tools.parseDuration("0:30"))).toBe("2:15:00");
    expect(tools.convertClock("14:30")).toEqual({ h24: "14:30", h12: "2:30 PM" });
    expect(tools.convertClock("12:05 am")).toEqual({ h24: "00:05", h12: "12:05 AM" });
    expect(tools.rollDice(3, 6, () => 0.5)).toEqual({ rolls: [4, 4, 4], total: 12 });
  });
});
