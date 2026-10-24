/** Geometry, math, finance, health and everyday calculators. */
import type { CalculatorDef } from "../registry";
import { def, fail, inp, nonneg, out, pos } from "./helpers";
import { cagr, effectiveRate, futureValue, payment, presentValue } from "../finance";

const SEX = [
  { value: 1, label: "Male" },
  { value: 2, label: "Female" },
];

export const EVERYDAY: CalculatorDef[] = [
  /* ── Geometry ── */
  def({
    id: "circle",
    name: "Circle",
    category: "geometry",
    description: "Diameter, circumference and area from the radius.",
    formula: ["d = 2r", "C = 2πr", "A = πr²"],
    assumptions: ["A perfect circle"],
    inputs: [inp("r", "Radius", "length", "m", { ...pos })],
    outputs: [out("d", "Diameter", "length", "m"), out("C", "Circumference", "length", "m"), out("A", "Area", "area", "m2")],
    compute: ({ r }) => ({ values: { d: 2 * r!, C: 2 * Math.PI * r!, A: Math.PI * r! * r! } }),
    refs: [{ inputs: { r: 1 }, expect: { d: 2, C: 6.283185307180, A: 3.141592653590 }, note: "Unit circle" }],
  }),
  def({
    id: "rectangle",
    name: "Rectangle",
    category: "geometry",
    description: "Area, perimeter and diagonal of a rectangle.",
    formula: ["A = l·w", "P = 2(l + w)", "d = √(l² + w²)"],
    assumptions: ["Right angles at every corner"],
    inputs: [inp("l", "Length", "length", "m", { ...pos }), inp("w", "Width", "length", "m", { ...pos })],
    outputs: [out("A", "Area", "area", "m2"), out("P", "Perimeter", "length", "m"), out("d", "Diagonal", "length", "m")],
    compute: ({ l, w }) => ({ values: { A: l! * w!, P: 2 * (l! + w!), d: Math.hypot(l!, w!) } }),
    refs: [{ inputs: { l: 4, w: 3 }, expect: { A: 12, P: 14, d: 5 }, note: "3-4-5" }],
  }),
  def({
    id: "triangle-sss",
    name: "Triangle from three sides",
    category: "geometry",
    description: "Area and angles of a triangle from its three sides (Heron's formula, law of cosines).",
    formula: ["s = (a + b + c)/2", "A = √(s(s-a)(s-b)(s-c))", "cos A = (b² + c² - a²) / 2bc"],
    assumptions: ["Each side shorter than the other two together"],
    inputs: [inp("a", "Side a", "length", "m", { ...pos }), inp("b", "Side b", "length", "m", { ...pos }), inp("c", "Side c", "length", "m", { ...pos })],
    outputs: [out("area", "Area", "area", "m2"), out("A", "Angle A (opposite a)", "angle", "deg"), out("B", "Angle B", "angle", "deg"), out("C", "Angle C", "angle", "deg"), out("P", "Perimeter", "length", "m")],
    compute: ({ a, b, c }) => {
      if (a! >= b! + c! || b! >= a! + c! || c! >= a! + b!) fail("These sides don't make a triangle: each must be shorter than the other two together.");
      const s = (a! + b! + c!) / 2;
      const A = Math.acos((b! * b! + c! * c! - a! * a!) / (2 * b! * c!));
      const B = Math.acos((a! * a! + c! * c! - b! * b!) / (2 * a! * c!));
      return { values: { area: Math.sqrt(s * (s - a!) * (s - b!) * (s - c!)), A, B, C: Math.PI - A - B, P: 2 * s } };
    },
    refs: [
      { inputs: { a: 3, b: 4, c: 5 }, expect: { area: 6, C: 90 }, note: "Right triangle" },
      { inputs: { a: 7, b: 8, c: 9 }, expect: { area: 26.83281572999, A: 48.18968510422, B: 58.41186449480 }, note: "s = 12" },
    ],
  }),
  def({
    id: "triangle-sas",
    name: "Triangle from two sides and the angle between",
    category: "geometry",
    description: "Third side and area from two sides and their included angle.",
    formula: ["c² = a² + b² - 2ab·cos C", "A = ½·a·b·sin C"],
    assumptions: ["C is the angle between sides a and b"],
    inputs: [inp("a", "Side a", "length", "m", { ...pos }), inp("b", "Side b", "length", "m", { ...pos }), inp("C", "Included angle", "angle", "deg", { min: 0, max: Math.PI, exclusiveMin: true, exclusiveMax: true })],
    outputs: [out("c", "Third side", "length", "m"), out("area", "Area", "area", "m2")],
    compute: ({ a, b, C }) => ({ values: { c: Math.sqrt(a! * a! + b! * b! - 2 * a! * b! * Math.cos(C!)), area: 0.5 * a! * b! * Math.sin(C!) } }),
    refs: [{ inputs: { a: 5, b: 7, C: 60 }, expect: { c: 6.244997998398, area: 15.15544456623 }, note: "Law of cosines" }],
  }),
  def({
    id: "pythagoras",
    name: "Right triangle (Pythagoras)",
    category: "geometry",
    description: "Any two sides of a right triangle give the third.",
    formula: ["c² = a² + b² (c is the hypotenuse)"],
    assumptions: ["A right angle between a and b"],
    inputs: [inp("a", "Leg a", "length", "m", { optional: true, ...pos }), inp("b", "Leg b", "length", "m", { optional: true, ...pos }), inp("c", "Hypotenuse c", "length", "m", { optional: true, ...pos })],
    outputs: [out("a", "Leg a", "length", "m"), out("b", "Leg b", "length", "m"), out("c", "Hypotenuse", "length", "m"), out("area", "Area", "area", "m2")],
    pick: { count: 2, keys: ["a", "b", "c"] },
    compute: ({ a, b, c }) => {
      let A = a,
        B = b,
        C = c;
      if (C === undefined) C = Math.hypot(A!, B!);
      else {
        const known = (A ?? B)!;
        if (known >= C) fail("The hypotenuse must be the longest side.", "c");
        if (A === undefined) A = Math.sqrt(C * C - known * known);
        else B = Math.sqrt(C * C - known * known);
      }
      return { values: { a: A!, b: B!, c: C, area: (A! * B!) / 2 } };
    },
    refs: [
      { inputs: { a: 3, b: 4 }, expect: { c: 5, area: 6 }, note: "3-4-5" },
      { inputs: { a: 5, c: 13 }, expect: { b: 12 }, note: "5-12-13" },
    ],
  }),
  def({
    id: "sphere",
    name: "Sphere",
    category: "geometry",
    description: "Volume and surface area of a sphere.",
    formula: ["V = 4/3·πr³", "A = 4πr²"],
    assumptions: ["A perfect sphere"],
    inputs: [inp("r", "Radius", "length", "m", { ...pos })],
    outputs: [out("V", "Volume", "volume", "m3"), out("A", "Surface area", "area", "m2")],
    compute: ({ r }) => ({ values: { V: (4 / 3) * Math.PI * r! ** 3, A: 4 * Math.PI * r! * r! } }),
    refs: [{ inputs: { r: 1 }, expect: { V: 4.188790204786, A: 12.56637061436 }, note: "Unit sphere" }],
  }),
  def({
    id: "cylinder",
    name: "Cylinder",
    category: "geometry",
    description: "Volume and surface area of a closed cylinder.",
    formula: ["V = πr²h", "A = 2πr(r + h)"],
    assumptions: ["Right circular cylinder with both ends closed"],
    inputs: [inp("r", "Radius", "length", "m", { ...pos }), inp("h", "Height", "length", "m", { ...pos })],
    outputs: [out("V", "Volume", "volume", "m3"), out("A", "Surface area", "area", "m2"), out("Vl", "Volume", "volume", "L")],
    compute: ({ r, h }) => {
      const V = Math.PI * r! * r! * h!;
      return { values: { V, A: 2 * Math.PI * r! * (r! + h!), Vl: V } };
    },
    refs: [{ inputs: { r: 0.5, h: 2 }, expect: { V: 1.570796326795, A: 7.853981633974 }, note: "π·0.25·2" }],
  }),
  def({
    id: "cone",
    name: "Cone",
    category: "geometry",
    description: "Volume, slant height and surface area of a right circular cone.",
    formula: ["V = ⅓·πr²h", "s = √(r² + h²)", "A = πr(r + s)"],
    assumptions: ["Right circular cone, base included in the area"],
    inputs: [inp("r", "Base radius", "length", "m", { ...pos }), inp("h", "Height", "length", "m", { ...pos })],
    outputs: [out("V", "Volume", "volume", "m3"), out("s", "Slant height", "length", "m"), out("A", "Surface area", "area", "m2")],
    compute: ({ r, h }) => {
      const s = Math.hypot(r!, h!);
      return { values: { V: (Math.PI * r! * r! * h!) / 3, s, A: Math.PI * r! * (r! + s) } };
    },
    refs: [{ inputs: { r: 3, h: 4 }, expect: { V: 37.69911184308, s: 5, A: 75.39822368616 }, note: "3-4-5 cone" }],
  }),
  def({
    id: "box",
    name: "Rectangular box",
    category: "geometry",
    description: "Volume, surface area and space diagonal of a box.",
    formula: ["V = l·w·h", "A = 2(lw + lh + wh)", "d = √(l² + w² + h²)"],
    assumptions: ["Right angles everywhere"],
    inputs: [inp("l", "Length", "length", "m", { ...pos }), inp("w", "Width", "length", "m", { ...pos }), inp("h", "Height", "length", "m", { ...pos })],
    outputs: [out("V", "Volume", "volume", "m3"), out("A", "Surface area", "area", "m2"), out("d", "Space diagonal", "length", "m")],
    compute: ({ l, w, h }) => ({ values: { V: l! * w! * h!, A: 2 * (l! * w! + l! * h! + w! * h!), d: Math.hypot(l!, w!, h!) } }),
    refs: [{ inputs: { l: 1, w: 2, h: 2 }, expect: { V: 4, A: 16, d: 3 }, note: "√9 = 3" }],
  }),
  def({
    id: "regular-polygon",
    name: "Regular polygon",
    category: "geometry",
    description: "Area, perimeter, apothem and circumradius of a regular polygon.",
    formula: ["A = n·s² / (4·tan(π/n))", "apothem = s / (2·tan(π/n))", "R = s / (2·sin(π/n))"],
    assumptions: ["All sides and angles equal"],
    inputs: [inp("n", "Sides", "count", undefined, { min: 3, integer: true }), inp("s", "Side length", "length", "m", { ...pos })],
    outputs: [out("A", "Area", "area", "m2"), out("P", "Perimeter", "length", "m"), out("ap", "Apothem", "length", "m"), out("R", "Circumradius", "length", "m"), out("angle", "Interior angle", "angle", "deg")],
    compute: ({ n, s }) => ({
      values: { A: (n! * s! * s!) / (4 * Math.tan(Math.PI / n!)), P: n! * s!, ap: s! / (2 * Math.tan(Math.PI / n!)), R: s! / (2 * Math.sin(Math.PI / n!)), angle: ((n! - 2) * Math.PI) / n! },
    }),
    refs: [{ inputs: { n: 6, s: 2 }, expect: { A: 10.39230484541, ap: 1.732050807569, R: 2, angle: 120 }, note: "Hexagon" }],
  }),
  def({
    id: "ellipse",
    name: "Ellipse",
    category: "geometry",
    description: "Area and (approximate) perimeter of an ellipse.",
    formula: ["A = π·a·b", "P ≈ π·(3(a + b) - √((3a + b)(a + 3b))) (Ramanujan)"],
    assumptions: ["a and b are the semi-axes; Ramanujan's first approximation (error < 0.04 % for b/a > 0.1)"],
    inputs: [inp("a", "Semi-major axis", "length", "m", { ...pos }), inp("b", "Semi-minor axis", "length", "m", { ...pos })],
    outputs: [out("A", "Area", "area", "m2"), out("P", "Perimeter", "length", "m")],
    compute: ({ a, b }) => ({ values: { A: Math.PI * a! * b!, P: Math.PI * (3 * (a! + b!) - Math.sqrt((3 * a! + b!) * (a! + 3 * b!))) } }),
    refs: [{ inputs: { a: 5, b: 3 }, expect: { A: 47.12388980385, P: 25.52698639376 }, note: "Ramanujan" }],
  }),
  def({
    id: "trapezoid",
    name: "Trapezoid",
    category: "geometry",
    description: "Area of a trapezoid.",
    formula: ["A = (a + b)/2·h"],
    assumptions: ["a and b are the parallel sides"],
    inputs: [inp("a", "Parallel side a", "length", "m", { ...pos }), inp("b", "Parallel side b", "length", "m", { ...pos }), inp("h", "Height", "length", "m", { ...pos })],
    outputs: [out("A", "Area", "area", "m2")],
    compute: ({ a, b, h }) => ({ values: { A: ((a! + b!) / 2) * h! } }),
    refs: [{ inputs: { a: 3, b: 5, h: 2 }, expect: { A: 8 }, note: "(3 + 5)/2·2" }],
  }),
  def({
    id: "two-points",
    name: "Line through two points",
    category: "math",
    description: "Distance, slope, intercept and midpoint of the line through two points.",
    formula: ["m = (y₂ - y₁)/(x₂ - x₁)", "b = y₁ - m·x₁", "d = √(Δx² + Δy²)"],
    assumptions: ["Cartesian plane"],
    inputs: [inp("x1", "x₁", "dimensionless"), inp("y1", "y₁", "dimensionless"), inp("x2", "x₂", "dimensionless"), inp("y2", "y₂", "dimensionless")],
    outputs: [out("d", "Distance", "dimensionless"), out("m", "Slope", "dimensionless", undefined, { optional: true }), out("b", "y-intercept", "dimensionless", undefined, { optional: true }), out("mx", "Midpoint x", "dimensionless"), out("my", "Midpoint y", "dimensionless"), out("angle", "Angle", "angle", "deg")],
    compute: ({ x1, y1, x2, y2 }) => {
      const dx = x2! - x1!;
      const dy = y2! - y1!;
      const values: Record<string, number> = { d: Math.hypot(dx, dy), mx: (x1! + x2!) / 2, my: (y1! + y2!) / 2, angle: Math.atan2(dy, dx) };
      const warnings: string[] = [];
      if (dx !== 0) {
        values.m = dy / dx;
        values.b = y1! - values.m * x1!;
      } else warnings.push("A vertical line: the slope is undefined.");
      return { values, warnings };
    },
    refs: [{ inputs: { x1: 1, y1: 2, x2: 4, y2: 6 }, expect: { d: 5, m: 1.333333333333, b: 0.6666666666667, mx: 2.5, my: 4 }, note: "3-4-5" }],
  }),

  /* ── Math ── */
  def({
    id: "percent-of",
    name: "Percent of a value",
    category: "math",
    description: "What is p % of a value.",
    formula: ["x = p/100·V"],
    assumptions: ["—"],
    inputs: [inp("p", "Percent", "ratio", "percent"), inp("V", "Value", "dimensionless")],
    outputs: [out("x", "Result", "dimensionless")],
    compute: ({ p, V }) => ({ values: { x: p! * V! } }),
    refs: [{ inputs: { p: 25, V: 200 }, expect: { x: 50 }, note: "25 % of 200" }],
  }),
  def({
    id: "percent-what",
    name: "What percent is x of y",
    category: "math",
    description: "The percentage one value is of another.",
    formula: ["p = x / y·100 %"],
    assumptions: ["—"],
    inputs: [inp("x", "Part", "dimensionless"), inp("y", "Whole", "dimensionless")],
    outputs: [out("p", "Percent", "ratio", "percent")],
    compute: ({ x, y }) => {
      if (y === 0) fail("The whole can't be zero.", "y");
      return { values: { p: x! / y! } };
    },
    refs: [{ inputs: { x: 30, y: 120 }, expect: { p: 25 }, note: "30/120" }],
  }),
  def({
    id: "percent-change",
    name: "Percent change",
    category: "math",
    description: "Change from an old value to a new one, in percent.",
    formula: ["Δ% = (new - old) / |old|·100 %"],
    assumptions: ["Relative to the old value"],
    inputs: [inp("a", "Old value", "dimensionless"), inp("b", "New value", "dimensionless")],
    outputs: [out("p", "Change", "ratio", "percent"), out("d", "Difference", "dimensionless")],
    compute: ({ a, b }) => {
      if (a === 0) fail("The old value can't be zero.", "a");
      return { values: { p: (b! - a!) / Math.abs(a!), d: b! - a! } };
    },
    refs: [{ inputs: { a: 80, b: 100 }, expect: { p: 25, d: 20 }, note: "20/80" }],
  }),
  def({
    id: "percent-error",
    name: "Percentage error",
    category: "math",
    description: "Error of a measured value against the true value.",
    formula: ["Error = |measured - true| / |true|·100 %"],
    assumptions: ["True (accepted) value known"],
    inputs: [inp("m", "Measured", "dimensionless"), inp("t", "True value", "dimensionless")],
    outputs: [out("e", "Error", "ratio", "percent")],
    compute: ({ m, t }) => {
      if (t === 0) fail("The true value can't be zero.", "t");
      return { values: { e: Math.abs(m! - t!) / Math.abs(t!) } };
    },
    refs: [{ inputs: { m: 9.6, t: 9.81 }, expect: { e: 2.140672782875 }, note: "0.21/9.81" }],
  }),
  def({
    id: "logarithm",
    name: "Logarithm in any base",
    category: "math",
    description: "log_b(x), natural log and log₁₀.",
    formula: ["log_b x = ln x / ln b"],
    assumptions: ["x > 0; b > 0, b ≠ 1"],
    inputs: [inp("x", "x", "dimensionless", undefined, { ...pos }), inp("b", "Base", "dimensionless", undefined, { ...pos, default: 10 })],
    outputs: [out("log", "log_b x", "dimensionless"), out("ln", "ln x", "dimensionless"), out("log10", "log₁₀ x", "dimensionless")],
    compute: ({ x, b }) => {
      if (b === 1) fail("The base can't be 1.", "b");
      return { values: { log: Math.log(x!) / Math.log(b!), ln: Math.log(x!), log10: Math.log10(x!) } };
    },
    refs: [{ inputs: { x: 8, b: 2 }, expect: { log: 3, ln: 2.079441541680, log10: 0.903089986992 }, note: "2³ = 8" }],
  }),
  def({
    id: "average-speed",
    name: "Speed, distance and time",
    category: "everyday",
    description: "Any two of speed, distance and time give the third.",
    formula: ["d = v·t"],
    assumptions: ["Average (constant) speed"],
    inputs: [inp("v", "Speed", "speed", "km/h", { optional: true, ...pos }), inp("d", "Distance", "length", "km", { optional: true, ...pos }), inp("t", "Time", "time", "h", { optional: true, ...pos })],
    outputs: [out("v", "Speed", "speed", "km/h"), out("d", "Distance", "length", "km"), out("t", "Time", "time", "h")],
    pick: { count: 2, keys: ["v", "d", "t"] },
    compute: ({ v, d, t }) => {
      if (d === undefined) return { values: { v: v!, t: t!, d: v! * t! } };
      if (t === undefined) return { values: { v: v!, d, t: d / v! } };
      return { values: { d, t, v: d / t } };
    },
    refs: [{ inputs: { d: 150, t: 2 }, expect: { v: 75 }, note: "150 km in 2 h" }],
  }),

  /* ── Finance ── */
  def({
    id: "loan-payment",
    name: "Loan / EMI payment",
    category: "finance",
    description: "Monthly payment (EMI), total interest and total paid on a loan.",
    formula: ["P = L·r / (1 - (1 + r)^-n), r = annual rate / 12"],
    assumptions: ["Fixed rate, equal monthly payments at the end of each month", "No fees or insurance"],
    inputs: [inp("L", "Loan amount", "money", undefined, { ...pos }), inp("rate", "Annual interest rate", "ratio", "percent", { ...nonneg, max: 1 }), inp("years", "Term (years)", "dimensionless", undefined, { ...pos, max: 100 })],
    outputs: [out("pmt", "Monthly payment", "money"), out("interest", "Total interest", "money"), out("total", "Total paid", "money")],
    compute: ({ L, rate, years }) => {
      const n = Math.round(years! * 12);
      const pmt = payment(L!, rate! / 12, n);
      return { values: { pmt, interest: pmt * n - L!, total: pmt * n } };
    },
    refs: [
      { inputs: { L: 100000, rate: 6, years: 30 }, expect: { pmt: 599.5505251528, interest: 115838.1890550 }, note: "Classic 30-year mortgage at 6 %" },
      { inputs: { L: 12000, rate: 0, years: 1 }, expect: { pmt: 1000, interest: 0 }, note: "Interest-free" },
    ],
  }),
  def({
    id: "simple-interest",
    name: "Simple interest",
    category: "finance",
    description: "Interest that doesn't compound.",
    formula: ["I = P·r·t", "A = P + I"],
    assumptions: ["Rate per year, time in years"],
    inputs: [inp("P", "Principal", "money", undefined, { ...nonneg }), inp("r", "Annual rate", "ratio", "percent", { ...nonneg }), inp("t", "Years", "dimensionless", undefined, { ...nonneg })],
    outputs: [out("I", "Interest", "money"), out("A", "Total", "money")],
    compute: ({ P, r, t }) => ({ values: { I: P! * r! * t!, A: P! * (1 + r! * t!) } }),
    refs: [{ inputs: { P: 1000, r: 5, t: 3 }, expect: { I: 150, A: 1150 }, note: "1000·0.05·3" }],
  }),
  def({
    id: "compound-interest",
    name: "Compound interest",
    category: "finance",
    description: "Growth with compound interest and optional regular deposits.",
    formula: ["A = P·(1 + r/m)^(m·t) + D·((1 + r/m)^(m·t) - 1)/(r/m)"],
    assumptions: ["Deposits D at the end of each compounding period", "Fixed rate"],
    inputs: [
      inp("P", "Starting amount", "money", undefined, { ...nonneg }),
      inp("r", "Annual rate", "ratio", "percent", { ...nonneg }),
      inp("t", "Years", "dimensionless", undefined, { ...nonneg }),
      inp("m", "Compounding", "dimensionless", undefined, { options: [{ value: 1, label: "Yearly" }, { value: 4, label: "Quarterly" }, { value: 12, label: "Monthly" }, { value: 365, label: "Daily" }], default: 12 }),
      inp("D", "Deposit each period", "money", undefined, { ...nonneg, default: 0 }),
    ],
    outputs: [out("A", "Final amount", "money"), out("I", "Interest earned", "money")],
    compute: ({ P, r, t, m, D }) => {
      const A = futureValue(P!, r! * 100, t!, m!, D!);
      return { values: { A, I: A - P! - D! * Math.round(m! * t!) } };
    },
    refs: [
      { inputs: { P: 1000, r: 5, t: 10, m: 12, D: 0 }, expect: { A: 1647.009497690 }, note: "Monthly compounding" },
      { inputs: { P: 0, r: 6, t: 10, m: 12, D: 100 }, expect: { A: 16387.93468065 }, note: "100 a month for 10 years" },
    ],
  }),
  def({
    id: "present-value",
    name: "Present value",
    category: "finance",
    description: "What a future amount is worth today.",
    formula: ["PV = FV / (1 + r/m)^(m·t)"],
    assumptions: ["Fixed discount rate"],
    inputs: [inp("FV", "Future amount", "money"), inp("r", "Annual discount rate", "ratio", "percent", { ...nonneg }), inp("t", "Years", "dimensionless", undefined, { ...nonneg }), inp("m", "Compounding per year", "dimensionless", undefined, { min: 1, integer: true, default: 1 })],
    outputs: [out("PV", "Present value", "money")],
    compute: ({ FV, r, t, m }) => ({ values: { PV: presentValue(FV!, r! * 100, t!, m!) } }),
    refs: [{ inputs: { FV: 1000, r: 5, t: 10, m: 1 }, expect: { PV: 613.9132535408 }, note: "1000/1.05¹⁰" }],
  }),
  def({
    id: "cagr",
    name: "CAGR",
    category: "finance",
    description: "Compound annual growth rate between two values.",
    formula: ["CAGR = (end/start)^(1/years) - 1"],
    assumptions: ["Smooth compounding between the two values"],
    inputs: [inp("start", "Start value", "money", undefined, { ...pos }), inp("end", "End value", "money", undefined, { ...pos }), inp("years", "Years", "dimensionless", undefined, { ...pos })],
    outputs: [out("cagr", "CAGR", "ratio", "percent")],
    compute: ({ start, end, years }) => ({ values: { cagr: cagr(start!, end!, years!) / 100 } }),
    refs: [{ inputs: { start: 100, end: 200, years: 5 }, expect: { cagr: 14.86983549970 }, note: "Doubling in 5 years" }],
  }),
  def({
    id: "apy",
    name: "Effective annual rate (APY / EAR)",
    category: "finance",
    description: "Effective yearly rate of a nominal rate compounded several times a year.",
    formula: ["EAR = (1 + r/m)^m - 1", "Continuous: e^r - 1"],
    assumptions: ["Nominal annual rate r"],
    inputs: [inp("r", "Nominal rate", "ratio", "percent", { ...nonneg }), inp("m", "Compounding", "dimensionless", undefined, { options: [{ value: 1, label: "Yearly" }, { value: 2, label: "Half-yearly" }, { value: 4, label: "Quarterly" }, { value: 12, label: "Monthly" }, { value: 365, label: "Daily" }, { value: 0, label: "Continuous" }], default: 12 })],
    outputs: [out("ear", "Effective rate", "ratio", "percent")],
    compute: ({ r, m }) => ({ values: { ear: effectiveRate(r! * 100, m === 0 ? Infinity : m!) / 100 } }),
    refs: [
      { inputs: { r: 5, m: 12 }, expect: { ear: 5.116189788173 }, note: "5 % monthly" },
      { inputs: { r: 5, m: 0 }, expect: { ear: 5.127109637602 }, note: "Continuous" },
    ],
  }),
  def({
    id: "roi",
    name: "Return on investment",
    category: "finance",
    description: "ROI and annualised return of an investment.",
    formula: ["ROI = (final - cost) / cost", "Annualised = (final/cost)^(1/years) - 1"],
    assumptions: ["No intermediate cash flows"],
    inputs: [inp("cost", "Cost", "money", undefined, { ...pos }), inp("final", "Final value", "money", undefined, { ...nonneg }), inp("years", "Years held", "dimensionless", undefined, { optional: true, ...pos })],
    outputs: [out("roi", "ROI", "ratio", "percent"), out("gain", "Gain", "money"), out("annual", "Annualised", "ratio", "percent", { optional: true })],
    compute: ({ cost, final, years }) => ({
      values: { roi: (final! - cost!) / cost!, gain: final! - cost!, ...(years !== undefined && final! > 0 ? { annual: (final! / cost!) ** (1 / years) - 1 } : {}) },
    }),
    refs: [{ inputs: { cost: 1000, final: 1500, years: 2 }, expect: { roi: 50, gain: 500, annual: 22.47448713916 }, note: "√1.5 - 1" }],
  }),
  def({
    id: "roas",
    name: "Return on ad spend",
    category: "finance",
    description: "Revenue per unit of advertising spend.",
    formula: ["ROAS = revenue / ad spend"],
    assumptions: ["Revenue attributed to the ads"],
    inputs: [inp("rev", "Revenue", "money", undefined, { ...nonneg }), inp("spend", "Ad spend", "money", undefined, { ...pos })],
    outputs: [out("roas", "ROAS (×)", "dimensionless"), out("pct", "ROAS", "ratio", "percent")],
    compute: ({ rev, spend }) => ({ values: { roas: rev! / spend!, pct: rev! / spend! } }),
    refs: [{ inputs: { rev: 5000, spend: 1000 }, expect: { roas: 5, pct: 500 }, note: "5×" }],
  }),
  def({
    id: "discount",
    name: "Discount and sale price",
    category: "finance",
    description: "Sale price after a discount, plus tax.",
    formula: ["Sale = price·(1 - discount)", "With tax = sale·(1 + tax)"],
    assumptions: ["Tax charged on the discounted price"],
    inputs: [inp("price", "Original price", "money", undefined, { ...nonneg }), inp("d", "Discount", "ratio", "percent", { min: 0, max: 1 }), inp("tax", "Sales tax / GST", "ratio", "percent", { ...nonneg, default: 0 })],
    outputs: [out("sale", "Sale price", "money"), out("saved", "You save", "money"), out("total", "With tax", "money")],
    compute: ({ price, d, tax }) => {
      const sale = price! * (1 - d!);
      return { values: { sale, saved: price! - sale, total: sale * (1 + tax!) } };
    },
    refs: [{ inputs: { price: 2000, d: 20, tax: 18 }, expect: { sale: 1600, saved: 400, total: 1888 }, note: "20 % off, 18 % GST" }],
  }),
  def({
    id: "tip",
    name: "Tip and bill split",
    category: "finance",
    description: "Tip, total and each person's share.",
    formula: ["Tip = bill·rate", "Each = (bill + tip) / people"],
    assumptions: ["Tip on the bill before tax"],
    inputs: [inp("bill", "Bill", "money", undefined, { ...nonneg }), inp("rate", "Tip", "ratio", "percent", { ...nonneg, default: 10 }), inp("people", "People", "count", undefined, { min: 1, integer: true, default: 1 })],
    outputs: [out("tip", "Tip", "money"), out("total", "Total", "money"), out("each", "Each pays", "money")],
    compute: ({ bill, rate, people }) => {
      const tip = bill! * rate!;
      return { values: { tip, total: bill! + tip, each: (bill! + tip) / people! } };
    },
    refs: [{ inputs: { bill: 1200, rate: 10, people: 4 }, expect: { tip: 120, total: 1320, each: 330 }, note: "10 % among 4" }],
  }),
  def({
    id: "margin-markup",
    name: "Margin and markup",
    category: "finance",
    description: "Profit margin and markup from cost and selling price.",
    formula: ["Margin = (price - cost) / price", "Markup = (price - cost) / cost"],
    assumptions: ["Cost per unit includes everything you count as cost"],
    inputs: [inp("cost", "Cost", "money", undefined, { ...pos }), inp("price", "Selling price", "money", undefined, { ...pos })],
    outputs: [out("margin", "Margin", "ratio", "percent"), out("markup", "Markup", "ratio", "percent"), out("profit", "Profit", "money")],
    compute: ({ cost, price }) => ({ values: { margin: (price! - cost!) / price!, markup: (price! - cost!) / cost!, profit: price! - cost! } }),
    refs: [{ inputs: { cost: 75, price: 100 }, expect: { margin: 25, markup: 33.33333333333, profit: 25 }, note: "25 % margin is 33 % markup" }],
  }),
  def({
    id: "price-from-margin",
    name: "Selling price from margin",
    category: "finance",
    description: "Price that gives a target margin on a cost.",
    formula: ["Price = cost / (1 - margin)"],
    assumptions: ["Margin on the selling price (not markup)"],
    inputs: [inp("cost", "Cost", "money", undefined, { ...pos }), inp("m", "Target margin", "ratio", "percent", { min: 0, max: 1, exclusiveMax: true })],
    outputs: [out("price", "Selling price", "money")],
    compute: ({ cost, m }) => ({ values: { price: cost! / (1 - m!) } }),
    refs: [{ inputs: { cost: 60, m: 40 }, expect: { price: 100 }, note: "60/0.6" }],
  }),
  def({
    id: "break-even",
    name: "Break-even point",
    category: "finance",
    description: "Units to sell to cover fixed costs.",
    formula: ["Units = fixed costs / (price - variable cost)"],
    assumptions: ["Constant price and variable cost per unit"],
    inputs: [inp("fixed", "Fixed costs", "money", undefined, { ...nonneg }), inp("price", "Price per unit", "money", undefined, { ...pos }), inp("variable", "Variable cost per unit", "money", undefined, { ...nonneg })],
    outputs: [out("units", "Break-even units", "dimensionless"), out("revenue", "Break-even revenue", "money")],
    compute: ({ fixed, price, variable }) => {
      if (price! <= variable!) fail("The price must be above the variable cost, or you never break even.", "price");
      const units = fixed! / (price! - variable!);
      return { values: { units, revenue: units * price! } };
    },
    refs: [{ inputs: { fixed: 10000, price: 50, variable: 30 }, expect: { units: 500, revenue: 25000 }, note: "10 000/20" }],
  }),
  def({
    id: "inflation",
    name: "Inflation adjustment",
    category: "finance",
    description: "What an amount is worth after years of inflation.",
    formula: ["Future cost = amount·(1 + i)^years", "Purchasing power = amount / (1 + i)^years"],
    assumptions: ["Constant average inflation rate"],
    inputs: [inp("amount", "Amount", "money", undefined, { ...nonneg }), inp("i", "Inflation per year", "ratio", "percent"), inp("years", "Years", "dimensionless", undefined, { ...nonneg })],
    outputs: [out("future", "Same goods will cost", "money"), out("power", "Today's money will buy", "money")],
    compute: ({ amount, i, years }) => {
      const k = (1 + i!) ** years!;
      return { values: { future: amount! * k, power: amount! / k } };
    },
    refs: [{ inputs: { amount: 100, i: 6, years: 12 }, expect: { future: 201.2196471836, power: 49.69693635770 }, note: "Rule of 72: doubles in 12 years at 6 %" }],
  }),
  def({
    id: "salary",
    name: "Salary converter",
    category: "finance",
    description: "Hourly, monthly and yearly pay from an hourly rate.",
    formula: ["Year = rate·hours/week·weeks/year", "Month = year / 12"],
    assumptions: ["Paid for every working week"],
    inputs: [inp("rate", "Hourly rate", "money", undefined, { ...nonneg }), inp("hours", "Hours per week", "dimensionless", undefined, { ...nonneg, default: 40 }), inp("weeks", "Weeks per year", "dimensionless", undefined, { min: 0, max: 52.18, default: 52 })],
    outputs: [out("year", "Yearly", "money"), out("month", "Monthly", "money"), out("week", "Weekly", "money")],
    compute: ({ rate, hours, weeks }) => {
      const year = rate! * hours! * weeks!;
      return { values: { year, month: year / 12, week: rate! * hours! } };
    },
    refs: [{ inputs: { rate: 25, hours: 40, weeks: 52 }, expect: { year: 52000, month: 4333.333333333, week: 1000 }, note: "25·40·52" }],
  }),
  def({
    id: "financial-ratios",
    name: "Financial ratios",
    category: "finance",
    description: "Current ratio, cash ratio and net profit margin.",
    formula: ["Current ratio = current assets / current liabilities", "Cash ratio = cash / current liabilities", "Net margin = net income / revenue"],
    assumptions: ["Figures from the same balance sheet and period"],
    inputs: [inp("ca", "Current assets", "money", undefined, { ...nonneg }), inp("cash", "Cash and equivalents", "money", undefined, { ...nonneg }), inp("cl", "Current liabilities", "money", undefined, { ...pos }), inp("ni", "Net income", "money"), inp("rev", "Revenue", "money", undefined, { ...pos })],
    outputs: [out("current", "Current ratio", "dimensionless"), out("cashRatio", "Cash ratio", "dimensionless"), out("margin", "Net profit margin", "ratio", "percent")],
    compute: ({ ca, cash, cl, ni, rev }) => ({ values: { current: ca! / cl!, cashRatio: cash! / cl!, margin: ni! / rev! } }),
    refs: [{ inputs: { ca: 200, cash: 50, cl: 100, ni: 15, rev: 150 }, expect: { current: 2, cashRatio: 0.5, margin: 10 }, note: "Textbook figures" }],
  }),
  def({
    id: "dividend-yield",
    name: "Dividend yield and payout",
    category: "finance",
    description: "Dividend yield, payout ratio and EPS.",
    formula: ["Yield = dividend per share / price", "Payout = dividends / net income", "EPS = net income / shares"],
    assumptions: ["Annual dividend"],
    inputs: [inp("dps", "Dividend per share", "money", undefined, { ...nonneg }), inp("price", "Share price", "money", undefined, { ...pos }), inp("ni", "Net income", "money"), inp("shares", "Shares outstanding", "dimensionless", undefined, { ...pos })],
    outputs: [out("yield", "Dividend yield", "ratio", "percent"), out("eps", "EPS", "money"), out("payout", "Payout ratio", "ratio", "percent", { optional: true }), out("pe", "P/E", "dimensionless", undefined, { optional: true })],
    compute: ({ dps, price, ni, shares }) => {
      const eps = ni! / shares!;
      return { values: { yield: dps! / price!, eps, ...(eps !== 0 ? { payout: dps! / eps, pe: price! / eps } : {}) } };
    },
    refs: [{ inputs: { dps: 2, price: 50, ni: 1e6, shares: 2e5 }, expect: { yield: 4, eps: 5, payout: 40, pe: 10 }, note: "EPS 5" }],
  }),

  /* ── Health ── */
  def({
    id: "bmi",
    name: "Body mass index",
    category: "health",
    description: "BMI and its WHO category.",
    formula: ["BMI = mass / height²"],
    assumptions: ["Adults; not a diagnosis (muscle mass and build aren't counted)", "WHO: under 18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, 30+ obese"],
    inputs: [inp("m", "Weight", "mass", "kg", { ...pos }), inp("h", "Height", "length", "cm", { ...pos })],
    outputs: [out("bmi", "BMI", "dimensionless")],
    compute: ({ m, h }) => {
      const bmi = m! / (h! * h!);
      const cat = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal weight" : bmi < 30 ? "Overweight" : "Obese";
      return { values: { bmi }, warnings: [`WHO category: ${cat}`] };
    },
    refs: [{ inputs: { m: 70, h: 175 }, expect: { bmi: 22.85714285714 }, note: "70/1.75²" }],
  }),
  def({
    id: "bmr",
    name: "Basal metabolic rate",
    category: "health",
    description: "Resting energy use (Mifflin–St Jeor) and daily needs for an activity level.",
    formula: ["Men: 10·kg + 6.25·cm - 5·age + 5", "Women: 10·kg + 6.25·cm - 5·age - 161", "Daily = BMR·activity factor"],
    assumptions: ["Mifflin–St Jeor (1990); estimates vary ±10 % between people", "Activity: 1.2 sedentary, 1.375 light, 1.55 moderate, 1.725 very active"],
    inputs: [
      inp("sex", "Sex", "dimensionless", undefined, { options: SEX, default: 1 }),
      inp("m", "Weight", "mass", "kg", { ...pos }),
      inp("h", "Height", "length", "cm", { ...pos }),
      inp("age", "Age (years)", "dimensionless", undefined, { min: 1, max: 120 }),
      inp("act", "Activity", "dimensionless", undefined, { options: [{ value: 1.2, label: "Sedentary" }, { value: 1.375, label: "Light" }, { value: 1.55, label: "Moderate" }, { value: 1.725, label: "Very active" }, { value: 1.9, label: "Extra active" }], default: 1.2 }),
    ],
    outputs: [out("bmr", "BMR (kcal/day)", "dimensionless"), out("tdee", "Daily need (kcal/day)", "dimensionless")],
    compute: ({ sex, m, h, age, act }) => {
      const bmr = 10 * m! + 625 * h! - 5 * age! + (sex === 1 ? 5 : -161);
      return { values: { bmr, tdee: bmr * act! } };
    },
    refs: [
      { inputs: { sex: 1, m: 70, h: 175, age: 30, act: 1.2 }, expect: { bmr: 1648.75, tdee: 1978.5 }, note: "Mifflin–St Jeor, man" },
      { inputs: { sex: 2, m: 60, h: 165, age: 25, act: 1.55 }, expect: { bmr: 1345.25 }, note: "Woman" },
    ],
  }),
  def({
    id: "body-fat-navy",
    name: "Body fat (US Navy method)",
    category: "health",
    description: "Body-fat percentage from tape measurements.",
    formula: ["Men: 495 / (1.0324 - 0.19077·log₁₀(waist - neck) + 0.15456·log₁₀(height)) - 450", "Women: 495 / (1.29579 - 0.35004·log₁₀(waist + hip - neck) + 0.22100·log₁₀(height)) - 450"],
    assumptions: ["Measurements in cm; an estimate (±3–4 %)"],
    inputs: [
      inp("sex", "Sex", "dimensionless", undefined, { options: SEX, default: 1 }),
      inp("h", "Height", "length", "cm", { ...pos }),
      inp("neck", "Neck", "length", "cm", { ...pos }),
      inp("waist", "Waist", "length", "cm", { ...pos }),
      inp("hip", "Hip (women)", "length", "cm", { optional: true, ...pos }),
    ],
    outputs: [out("bf", "Body fat", "ratio", "percent")],
    compute: ({ sex, h, neck, waist, hip }) => {
      const cm = (v: number) => v * 100;
      let bf: number;
      if (sex === 1) {
        if (waist! <= neck!) fail("The waist must be larger than the neck.", "waist");
        bf = 495 / (1.0324 - 0.19077 * Math.log10(cm(waist! - neck!)) + 0.15456 * Math.log10(cm(h!))) - 450;
      } else {
        if (hip === undefined) fail("Women's formula needs the hip measurement.", "hip");
        bf = 495 / (1.29579 - 0.35004 * Math.log10(cm(waist! + hip - neck!)) + 0.221 * Math.log10(cm(h!))) - 450;
      }
      return { values: { bf: bf / 100 } };
    },
    refs: [{ inputs: { sex: 1, h: 178, neck: 38, waist: 90 }, expect: { bf: 20.14665715400 }, note: "US Navy, man" }],
  }),
  def({
    id: "lean-body-mass",
    name: "Lean body mass (Boer)",
    category: "health",
    description: "Lean body mass by the Boer formula.",
    formula: ["Men: 0.407·kg + 0.267·cm - 19.2", "Women: 0.252·kg + 0.473·cm - 48.3"],
    assumptions: ["Adults; an estimate"],
    inputs: [inp("sex", "Sex", "dimensionless", undefined, { options: SEX, default: 1 }), inp("m", "Weight", "mass", "kg", { ...pos }), inp("h", "Height", "length", "cm", { ...pos })],
    outputs: [out("lbm", "Lean body mass", "mass", "kg"), out("fat", "Body fat (estimate)", "ratio", "percent")],
    compute: ({ sex, m, h }) => {
      const lbm = sex === 1 ? 0.407 * m! + 26.7 * h! - 19.2 : 0.252 * m! + 47.3 * h! - 48.3;
      return { values: { lbm, fat: 1 - lbm / m! } };
    },
    refs: [{ inputs: { sex: 1, m: 70, h: 175 }, expect: { lbm: 56.015 }, note: "0.407·70 + 0.267·175 - 19.2" }],
  }),
  def({
    id: "pace",
    name: "Running pace",
    category: "health",
    description: "Pace and speed from distance and time.",
    formula: ["Pace = time / distance", "Speed = distance / time"],
    assumptions: ["Even pace"],
    inputs: [inp("d", "Distance", "length", "km", { ...pos }), inp("t", "Time", "time", "min", { ...pos })],
    outputs: [out("pace", "Pace (min per km)", "dimensionless"), out("v", "Speed", "speed", "km/h")],
    compute: ({ d, t }) => ({ values: { pace: t! / 60 / (d! / 1000), v: d! / t! } }),
    refs: [{ inputs: { d: 10, t: 60 }, expect: { pace: 6, v: 10 }, note: "10 km in an hour" }],
  }),
  def({
    id: "calories-burned",
    name: "Calories burned (MET)",
    category: "health",
    description: "Energy used in an activity from its MET value.",
    formula: ["kcal = MET·kg·hours"],
    assumptions: ["MET from the Compendium of Physical Activities (walking 3.5, running 8–10, cycling 6–8)"],
    inputs: [inp("met", "MET", "dimensionless", undefined, { ...pos }), inp("m", "Weight", "mass", "kg", { ...pos }), inp("t", "Duration", "time", "min", { ...pos })],
    outputs: [out("kcal", "Energy", "energy", "kcal")],
    compute: ({ met, m, t }) => ({ values: { kcal: met! * m! * (t! / 3600) * 4184 } }),
    refs: [{ inputs: { met: 8, m: 70, t: 60 }, expect: { kcal: 560 }, note: "8·70·1" }],
  }),
  def({
    id: "fuel-cost",
    name: "Trip fuel cost",
    category: "everyday",
    description: "Fuel used and its cost for a trip.",
    formula: ["Fuel = distance / economy", "Cost = fuel·price"],
    assumptions: ["Average fuel economy for the route"],
    inputs: [inp("d", "Distance", "length", "km", { ...pos }), inp("eco", "Fuel economy", "fuelEconomy", "km/L", { ...pos }), inp("price", "Price per litre", "money", undefined, { ...nonneg })],
    outputs: [out("fuel", "Fuel", "volume", "L"), out("cost", "Cost", "money")],
    compute: ({ d, eco, price }) => {
      const litres = d! / 1000 / eco!;
      return { values: { fuel: litres / 1000, cost: litres * price! } };
    },
    refs: [{ inputs: { d: 300, eco: 15, price: 100 }, expect: { fuel: 20, cost: 2000 }, note: "300/15 = 20 L" }],
  }),
  def({
    id: "unit-price",
    name: "Unit price comparison",
    category: "everyday",
    description: "Which of two packs is cheaper per unit.",
    formula: ["Unit price = price / quantity"],
    assumptions: ["Same unit for both quantities"],
    inputs: [inp("p1", "Price A", "money", undefined, { ...nonneg }), inp("q1", "Quantity A", "dimensionless", undefined, { ...pos }), inp("p2", "Price B", "money", undefined, { ...nonneg }), inp("q2", "Quantity B", "dimensionless", undefined, { ...pos })],
    outputs: [out("u1", "Unit price A", "money"), out("u2", "Unit price B", "money"), out("saving", "B vs A", "ratio", "percent")],
    compute: ({ p1, q1, p2, q2 }) => {
      const u1 = p1! / q1!;
      const u2 = p2! / q2!;
      if (u1 === 0) fail("Price A can't be zero for a comparison.", "p1");
      return { values: { u1, u2, saving: (u2 - u1) / u1 }, warnings: [u1 < u2 ? "A is cheaper per unit." : u2 < u1 ? "B is cheaper per unit." : "Same unit price."] };
    },
    refs: [{ inputs: { p1: 100, q1: 500, p2: 180, q2: 1000 }, expect: { u1: 0.2, u2: 0.18, saving: -10 }, note: "B is 10 % cheaper" }],
  }),
];
