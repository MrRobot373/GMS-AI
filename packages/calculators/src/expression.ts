/**
 * Expression parser and evaluator for the keypad calculators and the calculus tools.
 *
 * Grammar (lowest to highest precedence):
 *   sum      := product (("+" | "-") product)*
 *   product  := implied (("*" | "/" | "mod" | "nPr" | "nCr") implied)*
 *   implied  := unary unary*           a number, name or bracket right after another one multiplies
 *   unary    := ("-" | "+" | "√" | "∛") unary | power
 *   power    := postfix ("^" unary)?    right-associative: 2^3^2 = 2^9; -2^2 = -4
 *   postfix  := atom ("!" | "%" | "°")*
 *   atom     := number | name | name "(" args ")" | "(" sum ")" | "|" sum "|"
 *
 * Multiplication without a sign binds tighter than × and ÷, as on scientific calculators
 * (Casio fx-991EX): 1/2π = 1/(2π), so engineering formulas like 1/2πfC read as written.
 * `a + b%` adds b percent of a (200 + 10% = 220); elsewhere b% is b/100.
 */

export type Node =
  | { type: "num"; value: number }
  | { type: "var"; name: string }
  | { type: "neg"; arg: Node }
  | { type: "bin"; op: "+" | "-" | "*" | "/" | "^" | "mod" | "nPr" | "nCr"; a: Node; b: Node }
  | { type: "call"; fn: string; args: Node[] }
  | { type: "post"; op: "!" | "%" | "°"; arg: Node };

export class ExprError extends Error {
  constructor(
    message: string,
    public readonly position?: number,
  ) {
    super(message);
  }
}

export type AngleMode = "deg" | "rad" | "grad";

/** Physical and mathematical constants (CODATA 2018 exact or recommended values). */
export const CONSTANTS: Record<string, { value: number; name: string; unit: string }> = {
  pi: { value: Math.PI, name: "π", unit: "" },
  "π": { value: Math.PI, name: "π", unit: "" },
  e: { value: Math.E, name: "Euler's number", unit: "" },
  phi: { value: (1 + Math.sqrt(5)) / 2, name: "golden ratio φ", unit: "" },
  "φ": { value: (1 + Math.sqrt(5)) / 2, name: "golden ratio φ", unit: "" },
  c0: { value: 299792458, name: "speed of light in vacuum", unit: "m/s" },
  hP: { value: 6.62607015e-34, name: "Planck constant", unit: "J·s" },
  hbar: { value: 6.62607015e-34 / (2 * Math.PI), name: "reduced Planck constant", unit: "J·s" },
  NA: { value: 6.02214076e23, name: "Avogadro constant", unit: "1/mol" },
  kB: { value: 1.380649e-23, name: "Boltzmann constant", unit: "J/K" },
  qe: { value: 1.602176634e-19, name: "elementary charge", unit: "C" },
  me: { value: 9.1093837015e-31, name: "electron mass", unit: "kg" },
  mp: { value: 1.67262192369e-27, name: "proton mass", unit: "kg" },
  G: { value: 6.6743e-11, name: "gravitational constant", unit: "m³/(kg·s²)" },
  g0: { value: 9.80665, name: "standard gravity", unit: "m/s²" },
  Rgas: { value: 8.314462618, name: "molar gas constant", unit: "J/(mol·K)" },
  eps0: { value: 8.8541878128e-12, name: "vacuum permittivity", unit: "F/m" },
  mu0: { value: 1.25663706212e-6, name: "vacuum permeability", unit: "N/A²" },
  sigmaSB: { value: 5.670374419e-8, name: "Stefan–Boltzmann constant", unit: "W/(m²·K⁴)" },
  atm: { value: 101325, name: "standard atmosphere", unit: "Pa" },
};

/** Functions by name: how many arguments, and whether they read angles. */
const FUNCTIONS: Record<string, { min: number; max: number }> = {
  sin: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  tan: { min: 1, max: 1 },
  sec: { min: 1, max: 1 },
  csc: { min: 1, max: 1 },
  cot: { min: 1, max: 1 },
  asin: { min: 1, max: 1 },
  acos: { min: 1, max: 1 },
  atan: { min: 1, max: 1 },
  atan2: { min: 2, max: 2 },
  sinh: { min: 1, max: 1 },
  cosh: { min: 1, max: 1 },
  tanh: { min: 1, max: 1 },
  asinh: { min: 1, max: 1 },
  acosh: { min: 1, max: 1 },
  atanh: { min: 1, max: 1 },
  ln: { min: 1, max: 1 },
  log: { min: 1, max: 2 },
  log2: { min: 1, max: 1 },
  exp: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  cbrt: { min: 1, max: 1 },
  root: { min: 2, max: 2 },
  abs: { min: 1, max: 1 },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  sign: { min: 1, max: 1 },
  fact: { min: 1, max: 1 },
  gamma: { min: 1, max: 1 },
  nPr: { min: 2, max: 2 },
  nCr: { min: 2, max: 2 },
  mod: { min: 2, max: 2 },
  gcd: { min: 2, max: 20 },
  lcm: { min: 2, max: 20 },
  min: { min: 1, max: 50 },
  max: { min: 1, max: 50 },
  hypot: { min: 2, max: 20 },
  rand: { min: 0, max: 0 },
  randint: { min: 2, max: 2 },
};
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/* ───────────── Tokens ───────────── */

type Tok =
  | { t: "num"; v: number; p: number }
  | { t: "id"; v: string; p: number }
  | { t: "op"; v: string; p: number }
  | { t: "(" | ")" | "," | "|"; p: number };

const ALIASES: Record<string, string> = { "×": "*", "·": "*", "÷": "/", "−": "-", "–": "-", "²": "^2", "³": "^3", "⁻¹": "^(-1)", "[": "(", "]": ")", "{": "(", "}": ")" };

export function tokenize(src: string): Tok[] {
  let s = src;
  for (const [a, b] of Object.entries(ALIASES)) s = s.split(a).join(b);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // The EXP key writes ᴇ (×10ⁿ, as on a Casio): 2ᴇ-3, 2ᴇ(-3), or 2ᴇ(-3 as the keypad's (−) leaves it.
    // A bare ᴇ3 is 1×10³. The letter E stays a variable.
    const exp = /^(\d+\.?\d*|\.\d+)?ᴇ\s*(?:\(\s*([+-]?\d+)\s*(?:\)|(?![\d.]))|([+-]?\d+)(?![\d.]))/.exec(s.slice(i));
    if (exp) {
      out.push({ t: "num", v: Number(`${exp[1] ?? "1"}e${exp[2] ?? exp[3]}`), p: i });
      i += exp[0].length;
      continue;
    }
    if (ch === "ᴇ") throw new ExprError("EXP needs a whole-number power of ten after it, e.g. 2ᴇ-3", i);
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) {
      // "2e" followed by a letter is 2·e, not an exponent.
      out.push({ t: "num", v: Number(num[0]), p: i });
      i += num[0].length;
      continue;
    }
    const id = /^([A-Za-z_][A-Za-z0-9_]*|π|φ)/.exec(s.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0], p: i });
      i += id[0].length;
      continue;
    }
    if ("+-*/^!%°√∛".includes(ch)) {
      out.push({ t: "op", v: ch, p: i });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "," || ch === "|") {
      out.push({ t: ch, p: i });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character "${ch}"`, i);
  }
  return out;
}

/* ───────────── Parser ───────────── */

const INFIX_WORDS = new Set(["mod", "nPr", "nCr"]);

export function parse(src: string): Node {
  if (!src.trim()) throw new ExprError("Enter an expression");
  const toks = tokenize(src);
  let i = 0;
  let absDepth = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => {
    const k = peek();
    return k?.t === "op" && k.v === v;
  };
  const isWord = (v: string) => {
    const k = peek();
    return k?.t === "id" && k.v === v;
  };

  function sum(): Node {
    let a = product();
    for (;;) {
      if (isOp("+") || isOp("-")) {
        const op = (toks[i++] as { v: string }).v as "+" | "-";
        a = { type: "bin", op, a, b: product() };
      } else return a;
    }
  }
  function product(): Node {
    let a = implied();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (toks[i++] as { v: string }).v as "*" | "/";
        a = { type: "bin", op, a, b: implied() };
      } else if (peek()?.t === "id" && INFIX_WORDS.has((peek() as { v: string }).v) && toks[i + 1]?.t !== "(") {
        const op = (toks[i++] as { v: string }).v as "mod" | "nPr" | "nCr";
        a = { type: "bin", op, a, b: implied() };
      } else return a;
    }
  }
  /** Can the next token start an operand that multiplies the previous one? */
  function startsOperand(): boolean {
    const k = peek();
    if (!k) return false;
    // A number right after a number is a typo (1.2.3, 2 3), never a product: 1.2.3 was once 1.2 × 0.3.
    if (k.t === "num" && toks[i - 1]?.t === "num") throw new ExprError("Two numbers in a row: put an operator between them", k.p);
    if (k.t === "num" || k.t === "(") return true;
    if (k.t === "id") return !INFIX_WORDS.has(k.v) || toks[i + 1]?.t === "(";
    if (k.t === "op") return k.v === "√" || k.v === "∛";
    // An opening bar only when we're not inside |…| (where it closes).
    if (k.t === "|") return absDepth === 0;
    return false;
  }
  function implied(): Node {
    let a = unary();
    while (startsOperand()) a = { type: "bin", op: "*", a, b: isOp("√") || isOp("∛") ? unary() : power() };
    return a;
  }
  function unary(): Node {
    if (isOp("-")) {
      i++;
      return { type: "neg", arg: unary() };
    }
    if (isOp("+")) {
      i++;
      return unary();
    }
    if (isOp("√")) {
      i++;
      return { type: "call", fn: "sqrt", args: [unary()] };
    }
    if (isOp("∛")) {
      i++;
      return { type: "call", fn: "cbrt", args: [unary()] };
    }
    return power();
  }
  function power(): Node {
    const base = postfix();
    if (isOp("^")) {
      i++;
      return { type: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function postfix(): Node {
    let a = atom();
    while (isOp("!") || isOp("%") || isOp("°")) a = { type: "post", op: (toks[i++] as { v: string }).v as "!" | "%" | "°", arg: a };
    return a;
  }
  function atom(): Node {
    const k = toks[i];
    if (!k) throw new ExprError("The expression ends too early", src.length);
    if (k.t === "num") {
      i++;
      return { type: "num", value: k.v };
    }
    if (k.t === "(") {
      i++;
      const inner = sum();
      if (peek()?.t !== ")") throw new ExprError("Missing closing bracket", peek()?.p ?? src.length);
      i++;
      return inner;
    }
    if (k.t === "|") {
      i++;
      absDepth++;
      const inner = sum();
      absDepth--;
      if (peek()?.t !== "|") throw new ExprError("Missing closing |", peek()?.p ?? src.length);
      i++;
      return { type: "call", fn: "abs", args: [inner] };
    }
    if (k.t === "id") {
      i++;
      const name = k.v;
      if (FUNCTIONS[name] && peek()?.t === "(") {
        i++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(sum());
          while (peek()?.t === ",") {
            i++;
            args.push(sum());
          }
        }
        if (peek()?.t !== ")") throw new ExprError(`Missing closing bracket after ${name}(`, peek()?.p ?? src.length);
        i++;
        const f = FUNCTIONS[name]!;
        if (args.length < f.min || args.length > f.max) {
          throw new ExprError(f.min === f.max ? `${name} takes ${f.min} value${f.min === 1 ? "" : "s"}` : `${name} takes ${f.min} to ${f.max} values`, k.p);
        }
        return { type: "call", fn: name, args };
      }
      if (FUNCTIONS[name] && FUNCTIONS[name]!.min === 1) {
        // sin 30 → sin(30): a function name followed directly by an operand.
        const arg = power();
        return { type: "call", fn: name, args: [arg] };
      }
      return { type: "var", name };
    }
    if (k.t === "op") throw new ExprError(`"${k.v}" needs a number before it`, k.p);
    if (k.t === ")") throw new ExprError("Unexpected closing bracket", k.p);
    throw new ExprError(`Unexpected "${k.t}"`, k.p);
  }

  const node = sum();
  if (i < toks.length) {
    const k = toks[i]!;
    throw new ExprError(k.t === ")" ? "Unexpected closing bracket" : "Unexpected input", k.p);
  }
  return node;
}

/* ───────────── Evaluation ───────────── */

export interface EvalOptions {
  angle?: AngleMode;
  vars?: Record<string, number>;
  /** Random source (tests pass a fixed one). */
  random?: () => number;
}

const toRad = (v: number, m: AngleMode) => (m === "deg" ? (v * Math.PI) / 180 : m === "grad" ? (v * Math.PI) / 200 : v);
const fromRad = (v: number, m: AngleMode) => (m === "deg" ? (v * 180) / Math.PI : m === "grad" ? (v * 200) / Math.PI : v);

/** Lanczos approximation (g = 7, n = 9); exact for integers up to 170 through factorial(). */
export function gamma(x: number): number {
  if (Number.isInteger(x)) {
    if (x <= 0) return NaN;
    return factorial(x - 1);
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let k = 1; k < 9; k++) a += c[k]! / (x + k);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new ExprError("Factorial needs a whole number ≥ 0 (use gamma() for others)");
  if (n > 170) return Infinity;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

export function nPr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) throw new ExprError("nPr needs whole numbers ≥ 0");
  if (r > n) return 0;
  let out = 1;
  for (let k = n - r + 1; k <= n; k++) out *= k;
  return out;
}

export function nCr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) throw new ExprError("nCr needs whole numbers ≥ 0");
  if (r > n) return 0;
  r = Math.min(r, n - r);
  let out = 1;
  for (let k = 1; k <= r; k++) out = (out * (n - r + k)) / k;
  return Math.round(out);
}

export function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Remainder with the sign of the divisor (as in mathematics: -7 mod 3 = 2). */
export function mod(a: number, b: number): number {
  if (b === 0) throw new ExprError("Division by zero in mod");
  return ((a % b) + b) % b;
}

/** Round off floating-point noise in trig results (sin 180° = 0, not 1.2e-16). */
function clean(v: number): number {
  return Math.abs(v) < 1e-15 ? 0 : v;
}

export function evaluate(node: Node, opts: EvalOptions = {}): number {
  const angle = opts.angle ?? "rad";
  const vars = opts.vars ?? {};
  const rnd = opts.random ?? Math.random;
  const ev = (n: Node): number => {
    switch (n.type) {
      case "num":
        return n.value;
      case "var": {
        if (n.name in vars) return vars[n.name]!;
        const c = CONSTANTS[n.name];
        if (c) return c.value;
        // Letters written together multiply, as on a calculator: πfC = π·f·C.
        const parts = splitName(n.name, vars);
        if (parts) return parts.reduce((acc, p) => acc * (p in vars ? vars[p]! : CONSTANTS[p]!.value), 1);
        throw new ExprError(`Unknown name "${n.name}"`);
      }
      case "neg":
        return -ev(n.arg);
      case "post": {
        const v = ev(n.arg);
        if (n.op === "!") return factorial(v);
        if (n.op === "°") return angle === "deg" ? v : toRadFromDeg(v, angle);
        return v / 100;
      }
      case "bin": {
        // a ± b%: b percent of a.
        if ((n.op === "+" || n.op === "-") && n.b.type === "post" && n.b.op === "%") {
          const a = ev(n.a);
          const p = ev(n.b.arg) / 100;
          return n.op === "+" ? a * (1 + p) : a * (1 - p);
        }
        const a = ev(n.a);
        const b = ev(n.b);
        switch (n.op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            if (b === 0) throw new ExprError("Division by zero");
            return a / b;
          case "^": {
            if (a === 0 && b < 0) throw new ExprError("Division by zero");
            // A real odd root of a negative number: (-8)^(1/3) = -2.
            if (a < 0 && !Number.isInteger(b)) {
              const inv = 1 / b;
              if (Number.isInteger(Math.round(inv * 1e9) / 1e9) && Math.round(inv) % 2 !== 0) return -((-a) ** b);
              throw new ExprError("A negative number to a fractional power isn't a real number");
            }
            return a ** b;
          }
          case "mod":
            return mod(a, b);
          case "nPr":
            return nPr(a, b);
          case "nCr":
            return nCr(a, b);
        }
        break;
      }
      case "call": {
        const x = n.args.map(ev);
        const [p, q] = [x[0]!, x[1]!];
        switch (n.fn) {
          case "sin":
            return clean(Math.sin(toRad(p, angle)));
          case "cos":
            return clean(Math.cos(toRad(p, angle)));
          case "tan": {
            const c = clean(Math.cos(toRad(p, angle)));
            if (c === 0) throw new ExprError("tan is undefined here (cos = 0)");
            return clean(Math.tan(toRad(p, angle)));
          }
          case "sec": {
            const c = clean(Math.cos(toRad(p, angle)));
            if (c === 0) throw new ExprError("sec is undefined here (cos = 0)");
            return 1 / c;
          }
          case "csc": {
            const s = clean(Math.sin(toRad(p, angle)));
            if (s === 0) throw new ExprError("csc is undefined here (sin = 0)");
            return 1 / s;
          }
          case "cot": {
            const s = clean(Math.sin(toRad(p, angle)));
            if (s === 0) throw new ExprError("cot is undefined here (sin = 0)");
            return clean(Math.cos(toRad(p, angle))) / s;
          }
          case "asin":
            if (p < -1 || p > 1) throw new ExprError("asin needs a value from -1 to 1");
            return fromRad(Math.asin(p), angle);
          case "acos":
            if (p < -1 || p > 1) throw new ExprError("acos needs a value from -1 to 1");
            return fromRad(Math.acos(p), angle);
          case "atan":
            return fromRad(Math.atan(p), angle);
          case "atan2":
            return fromRad(Math.atan2(p, q), angle);
          case "sinh":
            return Math.sinh(p);
          case "cosh":
            return Math.cosh(p);
          case "tanh":
            return Math.tanh(p);
          case "asinh":
            return Math.asinh(p);
          case "acosh":
            if (p < 1) throw new ExprError("acosh needs a value ≥ 1");
            return Math.acosh(p);
          case "atanh":
            if (p <= -1 || p >= 1) throw new ExprError("atanh needs a value between -1 and 1");
            return Math.atanh(p);
          case "ln":
            if (p <= 0) throw new ExprError("ln needs a value greater than 0");
            return Math.log(p);
          case "log":
            if (p <= 0) throw new ExprError("log needs a value greater than 0");
            if (x.length === 2) {
              if (q <= 0 || q === 1) throw new ExprError("A logarithm's base must be positive and not 1");
              return Math.log(p) / Math.log(q);
            }
            return Math.log10(p);
          case "log2":
            if (p <= 0) throw new ExprError("log2 needs a value greater than 0");
            return Math.log2(p);
          case "exp":
            return Math.exp(p);
          case "sqrt":
            if (p < 0) throw new ExprError("The square root of a negative number isn't a real number");
            return Math.sqrt(p);
          case "cbrt":
            return Math.cbrt(p);
          case "root": {
            // root(x, n): the nth root.
            if (q === 0) throw new ExprError("The 0th root is undefined");
            if (p < 0) {
              if (Number.isInteger(q) && q % 2 !== 0) return -((-p) ** (1 / q));
              throw new ExprError("An even root of a negative number isn't a real number");
            }
            return p ** (1 / q);
          }
          case "abs":
            return Math.abs(p);
          case "floor":
            return Math.floor(p);
          case "ceil":
            return Math.ceil(p);
          case "round": {
            const d = x.length === 2 ? q : 0;
            const f = 10 ** d;
            return Math.round(p * f) / f;
          }
          case "sign":
            return Math.sign(p);
          case "fact":
            return factorial(p);
          case "gamma":
            return gamma(p);
          case "nPr":
            return nPr(p, q);
          case "nCr":
            return nCr(p, q);
          case "mod":
            return mod(p, q);
          case "gcd":
            if (!x.every(Number.isInteger)) throw new ExprError("gcd needs whole numbers");
            return x.reduce(gcd2);
          case "lcm":
            if (!x.every(Number.isInteger)) throw new ExprError("lcm needs whole numbers");
            return x.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd2(a, b)));
          case "min":
            return Math.min(...x);
          case "max":
            return Math.max(...x);
          case "hypot":
            return Math.hypot(...x);
          case "rand":
            return rnd();
          case "randint": {
            if (!Number.isInteger(p) || !Number.isInteger(q) || q < p) throw new ExprError("randint needs two whole numbers, the first not larger");
            return p + Math.floor(rnd() * (q - p + 1));
          }
        }
        throw new ExprError(`Unknown function "${n.fn}"`);
      }
    }
    throw new ExprError("Can't evaluate this");
  };
  const v = ev(node);
  if (Number.isNaN(v)) throw new ExprError("The result isn't a real number");
  if (!Number.isFinite(v)) throw new ExprError("The result is too large (overflow)");
  return v;
}

/** "fC" → ["f", "C"] when every piece is a variable or a constant (longest names first). */
function splitName(name: string, vars: Record<string, number>): string[] | null {
  const known = (p: string) => p in vars || p in CONSTANTS;
  const memo = new Map<number, string[] | null>();
  const go = (i: number): string[] | null => {
    if (i === name.length) return [];
    if (memo.has(i)) return memo.get(i)!;
    let out: string[] | null = null;
    for (let j = name.length; j > i && !out; j--) {
      const piece = name.slice(i, j);
      if (known(piece)) {
        const rest = go(j);
        if (rest) out = [piece, ...rest];
      }
    }
    memo.set(i, out);
    return out;
  };
  return go(0);
}

/** 30° typed in radian or gradian mode: the degrees are converted to that mode first. */
function toRadFromDeg(v: number, mode: AngleMode): number {
  return mode === "rad" ? (v * Math.PI) / 180 : (v * 200) / 180;
}

/** Parse and evaluate in one go. */
export function calc(src: string, opts: EvalOptions = {}): number {
  return tidy(evaluate(parse(src), opts));
}

/** Drop binary floating-point noise from a final result: 0.1 + 0.2 = 0.3, sin 30° = 0.5. */
export function tidy(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  const r = Number(v.toPrecision(15));
  return Math.abs(r) < 1e-300 ? 0 : r;
}

/** Names an expression uses that aren't constants (the variables it needs). */
export function freeVariables(node: Node): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.type === "var" && !(n.name in CONSTANTS)) out.add(n.name);
    if (n.type === "neg" || n.type === "post") walk(n.arg);
    if (n.type === "bin") {
      walk(n.a);
      walk(n.b);
    }
    if (n.type === "call") n.args.forEach(walk);
  };
  walk(node);
  return [...out];
}

/** A function of one variable, for plotting and the calculus tools (radians). */
export function compileFn(src: string, variable = "x"): (x: number) => number {
  const node = parse(src);
  const free = freeVariables(node).filter((v) => v !== variable);
  if (free.length) throw new ExprError(`Unknown name "${free[0]}" (the variable is ${variable})`);
  return (x: number) => {
    try {
      return evaluate(node, { vars: { [variable]: x }, angle: "rad" });
    } catch {
      return NaN;
    }
  };
}
