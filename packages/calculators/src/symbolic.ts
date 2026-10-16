/**
 * Symbolic differentiation and simplification on the expression tree, and printing it back.
 * Derivatives use the standard rules (sum, product, quotient, power, chain); simplification folds
 * constants and removes 0 and 1 identities, so results stay readable. Angles are radians.
 */
import { CONSTANTS, ExprError, type Node } from "./expression";

const num = (value: number): Node => ({ type: "num", value });
const bin = (op: "+" | "-" | "*" | "/" | "^", a: Node, b: Node): Node => ({ type: "bin", op, a, b });
const call = (fn: string, ...args: Node[]): Node => ({ type: "call", fn, args });
const neg = (arg: Node): Node => ({ type: "neg", arg });

const isNum = (n: Node): n is { type: "num"; value: number } => n.type === "num";
/** A number node with this exact value (no type narrowing: false says nothing about the kind). */
const isVal = (n: Node, v: number): boolean => n.type === "num" && n.value === v;

/** Does the expression depend on `x`? */
export function dependsOn(n: Node, x: string): boolean {
  switch (n.type) {
    case "num":
      return false;
    case "var":
      return n.name === x;
    case "neg":
    case "post":
      return dependsOn(n.arg, x);
    case "bin":
      return dependsOn(n.a, x) || dependsOn(n.b, x);
    case "call":
      return n.args.some((a) => dependsOn(a, x));
  }
}

export function differentiate(n: Node, x = "x"): Node {
  return simplify(d(n, x));
}

function d(n: Node, x: string): Node {
  if (!dependsOn(n, x)) return num(0);
  switch (n.type) {
    case "var":
      return num(1);
    case "neg":
      return neg(d(n.arg, x));
    case "post":
      if (n.op === "%") return bin("/", d(n.arg, x), num(100));
      throw new ExprError(`Can't differentiate "${n.op}"`);
    case "bin": {
      const { a, b } = n;
      switch (n.op) {
        case "+":
          return bin("+", d(a, x), d(b, x));
        case "-":
          return bin("-", d(a, x), d(b, x));
        case "*":
          return bin("+", bin("*", d(a, x), b), bin("*", a, d(b, x)));
        case "/":
          return bin("/", bin("-", bin("*", d(a, x), b), bin("*", a, d(b, x))), bin("^", b, num(2)));
        case "^":
          if (!dependsOn(b, x)) {
            // d(u^c) = c·u^(c-1)·u'
            return bin("*", bin("*", b, bin("^", a, bin("-", b, num(1)))), d(a, x));
          }
          if (!dependsOn(a, x)) {
            // d(c^v) = c^v·ln(c)·v'
            return bin("*", bin("*", n, call("ln", a)), d(b, x));
          }
          // d(u^v) = u^v·(v'·ln u + v·u'/u)
          return bin("*", n, bin("+", bin("*", d(b, x), call("ln", a)), bin("/", bin("*", b, d(a, x)), a)));
        default:
          throw new ExprError(`Can't differentiate "${n.op}"`);
      }
    }
    case "call": {
      const u = n.args[0]!;
      const du = d(u, x);
      const chain = (outer: Node) => bin("*", outer, du);
      switch (n.fn) {
        case "sin":
          return chain(call("cos", u));
        case "cos":
          return chain(neg(call("sin", u)));
        case "tan":
          return chain(bin("^", call("sec", u), num(2)));
        case "sec":
          return chain(bin("*", call("sec", u), call("tan", u)));
        case "csc":
          return chain(neg(bin("*", call("csc", u), call("cot", u))));
        case "cot":
          return chain(neg(bin("^", call("csc", u), num(2))));
        case "asin":
          return chain(bin("/", num(1), call("sqrt", bin("-", num(1), bin("^", u, num(2))))));
        case "acos":
          return chain(neg(bin("/", num(1), call("sqrt", bin("-", num(1), bin("^", u, num(2)))))));
        case "atan":
          return chain(bin("/", num(1), bin("+", num(1), bin("^", u, num(2)))));
        case "sinh":
          return chain(call("cosh", u));
        case "cosh":
          return chain(call("sinh", u));
        case "tanh":
          return chain(bin("-", num(1), bin("^", call("tanh", u), num(2))));
        case "asinh":
          return chain(bin("/", num(1), call("sqrt", bin("+", bin("^", u, num(2)), num(1)))));
        case "acosh":
          return chain(bin("/", num(1), call("sqrt", bin("-", bin("^", u, num(2)), num(1)))));
        case "atanh":
          return chain(bin("/", num(1), bin("-", num(1), bin("^", u, num(2)))));
        case "exp":
          return chain(call("exp", u));
        case "ln":
          return chain(bin("/", num(1), u));
        case "log":
          if (n.args.length === 2) {
            if (dependsOn(n.args[1]!, x)) throw new ExprError("Can't differentiate a logarithm whose base depends on the variable");
            return chain(bin("/", num(1), bin("*", u, call("ln", n.args[1]!))));
          }
          return chain(bin("/", num(1), bin("*", u, call("ln", num(10)))));
        case "log2":
          return chain(bin("/", num(1), bin("*", u, call("ln", num(2)))));
        case "sqrt":
          return chain(bin("/", num(1), bin("*", num(2), call("sqrt", u))));
        case "cbrt":
          return chain(bin("/", num(1), bin("*", num(3), bin("^", call("cbrt", u), num(2)))));
        case "root":
          return d(bin("^", u, bin("/", num(1), n.args[1]!)), x);
        case "abs":
          return chain(call("sign", u));
        default:
          throw new ExprError(`Can't differentiate ${n.fn}()`);
      }
    }
    default:
      throw new ExprError("Can't differentiate this");
  }
}

function same(a: Node, b: Node): boolean {
  return toString(a) === toString(b);
}

/** Fold constants and drop identities. Repeats until nothing changes. */
export function simplify(n: Node): Node {
  let prev = "";
  let cur = n;
  for (let k = 0; k < 20; k++) {
    cur = step(cur);
    const s = toString(cur);
    if (s === prev) break;
    prev = s;
  }
  return cur;
}

function step(n: Node): Node {
  switch (n.type) {
    case "num":
    case "var":
      return n;
    case "neg": {
      const a = step(n.arg);
      if (isNum(a)) return num(-a.value);
      if (a.type === "neg") return a.arg;
      return neg(a);
    }
    case "post":
      return { ...n, arg: step(n.arg) };
    case "call": {
      const args = n.args.map(step);
      if (n.fn === "ln" && args.length === 1 && isVal(args[0]!, 1)) return num(0);
      if (n.fn === "ln" && args[0]!.type === "var" && args[0]!.name === "e") return num(1);
      if (n.fn === "ln" && args[0]!.type === "call" && args[0]!.fn === "exp") return args[0]!.args[0]!;
      return { ...n, args };
    }
    case "bin": {
      const a = step(n.a);
      const b = step(n.b);
      if (isNum(a) && isNum(b) && n.op !== "mod" && n.op !== "nPr" && n.op !== "nCr") {
        const v = n.op === "+" ? a.value + b.value : n.op === "-" ? a.value - b.value : n.op === "*" ? a.value * b.value : n.op === "/" ? a.value / b.value : a.value ** b.value;
        // Keep fractions like 1/3 as they are; fold only clean results.
        if (Number.isFinite(v) && (n.op !== "/" || Number.isInteger(v)) && (n.op !== "^" || Number.isInteger(v))) return num(v);
      }
      switch (n.op) {
        case "+":
          if (isVal(a, 0)) return b;
          if (isVal(b, 0)) return a;
          if (b.type === "neg") return bin("-", a, b.arg);
          if (isNum(b) && b.value < 0) return bin("-", a, num(-b.value));
          if (same(a, b)) return bin("*", num(2), a);
          break;
        case "-":
          if (isVal(b, 0)) return a;
          if (isVal(a, 0)) return neg(b);
          if (b.type === "neg") return bin("+", a, b.arg);
          if (same(a, b)) return num(0);
          break;
        case "*":
          if (isVal(a, 0) || isVal(b, 0)) return num(0);
          if (isVal(a, 1)) return b;
          if (isVal(b, 1)) return a;
          if (isVal(a, -1)) return neg(b);
          if (isVal(b, -1)) return neg(a);
          if (a.type === "neg") return neg(bin("*", a.arg, b));
          if (b.type === "neg") return neg(bin("*", a, b.arg));
          // Numbers to the front: x·3 → 3·x, 2·(3·x) → 6·x.
          if (isNum(b) && !isNum(a)) return bin("*", b, a);
          if (isNum(a) && b.type === "bin" && b.op === "*" && isNum(b.a)) return bin("*", num(a.value * b.a.value), b.b);
          if (same(a, b)) return bin("^", a, num(2));
          // (p / q)·q → p and q·(p / q) → p
          if (a.type === "bin" && a.op === "/" && same(a.b, b)) return a.a;
          if (b.type === "bin" && b.op === "/" && same(b.b, a)) return b.a;
          // x^n · x → x^(n+1)
          if (a.type === "bin" && a.op === "^" && same(a.a, b) && isNum(a.b)) return bin("^", b, num(a.b.value + 1));
          break;
        case "/":
          if (isVal(a, 0)) return num(0);
          if (isVal(b, 1)) return a;
          if (same(a, b)) return num(1);
          if (a.type === "neg") return neg(bin("/", a.arg, b));
          break;
        case "^":
          if (isVal(b, 0)) return num(1);
          if (isVal(b, 1)) return a;
          if (isVal(a, 1)) return num(1);
          if (a.type === "bin" && a.op === "^" && isNum(a.b) && isNum(b)) return bin("^", a.a, num(a.b.value * b.value));
          // (k·u)^n → kⁿ·uⁿ for a whole power
          if (a.type === "bin" && a.op === "*" && isNum(a.a) && isNum(b) && Number.isInteger(b.value)) return bin("*", num(a.a.value ** b.value), bin("^", a.b, b));
          break;
      }
      return { ...n, a, b };
    }
  }
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, mod: 2, nPr: 2, nCr: 2, "^": 4 };

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const s = Number(v.toPrecision(12)).toString();
  return s;
}

/** Print an expression with as few brackets as its meaning allows. */
export function toString(n: Node): string {
  const p = (c: Node, min: number, right = false, parent?: string): string => {
    const s = toString(c);
    const cp = c.type === "bin" ? PREC[c.op]! : c.type === "neg" ? 3 : 5;
    // On the right of - or /, an operation of the same rank keeps its brackets: a - (b + c), a / (b·c).
    const assoc = c.type === "bin" && ((parent === "+" && c.op === "+") || (parent === "*" && c.op === "*") || c.op === "^");
    const needs = cp < min || (right && cp === min && !assoc) || (c.type === "num" && c.value < 0 && min > 1);
    return needs ? `(${s})` : s;
  };
  switch (n.type) {
    case "num":
      return fmtNum(n.value);
    case "var":
      return n.name === "pi" ? "π" : n.name;
    case "neg":
      return `-${p(n.arg, 3)}`;
    case "post":
      return `${p(n.arg, 5)}${n.op}`;
    case "call":
      return `${n.fn}(${n.args.map(toString).join(", ")})`;
    case "bin": {
      const prec = PREC[n.op]!;
      if (n.op === "^") return `${p(n.a, 5)}^${p(n.b, 4)}`;
      const sym = n.op === "*" ? "·" : n.op === "mod" || n.op === "nPr" || n.op === "nCr" ? ` ${n.op} ` : ` ${n.op} `;
      // 2·x → 2x for a number times a name or a function.
      if (n.op === "*" && n.a.type === "num" && n.a.value >= 0 && (n.b.type === "var" || n.b.type === "call" || (n.b.type === "bin" && n.b.op === "^" && n.b.a.type === "var"))) {
        return `${fmtNum(n.a.value)}${toString(n.b)}`;
      }
      return `${p(n.a, prec)}${sym}${p(n.b, prec, true, n.op)}`;
    }
  }
}

export { CONSTANTS };
