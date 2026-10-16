/** Matrix and vector operations (dense, real). */
import { ExprError } from "./expression";

export type Matrix = number[][];

function check(A: Matrix, name = "The matrix") {
  if (!A.length || !A[0]!.length || A.some((r) => r.length !== A[0]!.length)) throw new ExprError(`${name} must be rectangular and not empty`);
  if (!A.flat().every(Number.isFinite)) throw new ExprError(`${name} has an entry that isn't a number`);
}
const dims = (A: Matrix) => [A.length, A[0]!.length] as const;
const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(14)));

export function add(A: Matrix, B: Matrix, sign = 1): Matrix {
  check(A, "A");
  check(B, "B");
  const [r, c] = dims(A);
  const [r2, c2] = dims(B);
  if (r !== r2 || c !== c2) throw new ExprError(`Adding needs the same size: A is ${r}×${c}, B is ${r2}×${c2}`);
  return A.map((row, i) => row.map((v, j) => v + sign * B[i]![j]!));
}
export const subtract = (A: Matrix, B: Matrix) => add(A, B, -1);

export function multiply(A: Matrix, B: Matrix): Matrix {
  check(A, "A");
  check(B, "B");
  const [r, c] = dims(A);
  const [r2, c2] = dims(B);
  if (c !== r2) throw new ExprError(`A's columns (${c}) must match B's rows (${r2})`);
  return Array.from({ length: r }, (_, i) => Array.from({ length: c2 }, (_, j) => clean(A[i]!.reduce((s, v, k) => s + v * B[k]![j]!, 0))));
}

export const scale = (A: Matrix, k: number): Matrix => A.map((r) => r.map((v) => v * k));

export function transpose(A: Matrix): Matrix {
  check(A);
  return A[0]!.map((_, j) => A.map((r) => r[j]!));
}

export function determinant(A: Matrix): number {
  check(A);
  const n = A.length;
  if (A[0]!.length !== n) throw new ExprError("The determinant needs a square matrix");
  const M = A.map((r) => [...r]);
  let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (M[p]![c] === 0) return 0;
    if (p !== c) {
      [M[p], M[c]] = [M[c]!, M[p]!];
      det = -det;
    }
    det *= M[c]![c]!;
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k < n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return clean(det);
}

export function inverse(A: Matrix): Matrix {
  check(A);
  const n = A.length;
  if (A[0]!.length !== n) throw new ExprError("Only a square matrix has an inverse");
  const scaleMax = Math.max(1, ...A.flat().map(Math.abs));
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-12 * scaleMax) throw new ExprError("The matrix is singular (determinant 0): it has no inverse");
    [M[p], M[c]] = [M[c]!, M[p]!];
    const d = M[c]![c]!;
    for (let k = 0; k < 2 * n; k++) M[c]![k]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]!;
      for (let k = 0; k < 2 * n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r) => r.slice(n).map(clean));
}

export function trace(A: Matrix): number {
  check(A);
  if (A.length !== A[0]!.length) throw new ExprError("The trace needs a square matrix");
  return A.reduce((s, r, i) => s + r[i]!, 0);
}

export function power(A: Matrix, n: number): Matrix {
  if (!Number.isInteger(n) || n < 0) throw new ExprError("The power must be a whole number ≥ 0");
  check(A);
  if (A.length !== A[0]!.length) throw new ExprError("Powers need a square matrix");
  let R: Matrix = A.map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
  let B = A;
  while (n > 0) {
    if (n & 1) R = multiply(R, B);
    B = multiply(B, B);
    n >>= 1;
  }
  return R;
}

/** Eigenvalues of a 2×2 or 3×3 real matrix (real parts; complex pairs reported as such). */
export function eigenvalues2(A: Matrix): { re: number; im: number }[] {
  if (A.length !== 2 || A[0]!.length !== 2) throw new ExprError("Eigenvalues here need a 2×2 matrix");
  const t = A[0]![0]! + A[1]![1]!;
  const d = determinant(A);
  const D = t * t - 4 * d;
  if (D >= 0) return [{ re: (t - Math.sqrt(D)) / 2, im: 0 }, { re: (t + Math.sqrt(D)) / 2, im: 0 }];
  return [{ re: t / 2, im: -Math.sqrt(-D) / 2 }, { re: t / 2, im: Math.sqrt(-D) / 2 }];
}

/* ───────────── Vectors ───────────── */

export const dot = (a: number[], b: number[]) => {
  if (a.length !== b.length) throw new ExprError("The vectors must have the same length");
  return a.reduce((s, v, i) => s + v * b[i]!, 0);
};
export function cross(a: number[], b: number[]): number[] {
  if (a.length !== 3 || b.length !== 3) throw new ExprError("The cross product needs two 3D vectors");
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
export const magnitude = (a: number[]) => Math.hypot(...a);
export function angleBetween(a: number[], b: number[]): number {
  const m = magnitude(a) * magnitude(b);
  if (m === 0) throw new ExprError("The angle with a zero vector is undefined");
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / m)));
}
