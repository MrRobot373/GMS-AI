export function classifyRisk(
  call: { name: string; args: unknown },
  policy: { approvals: "risky" | "always" | "never"; askForNetwork: boolean; connectors: { name: string; approveTools: string[] }[] },
): string | null;
export function reviewDenial(reason: string): string;
export interface Confine {
  /** The task's own folders: the working folder first, then the task's own folder (runtime, skills, project copy). */
  roots: string[];
  /** Aatmiq's own data and the server's folder: never, whatever the approvals. */
  protected: string[];
  /** System and program folders a command may name without asking. */
  system: string[];
}
export function placeOf(path: string, confine: Confine): { place: "own" | "protected" | "system" | "outside"; path: string };
export function commandPaths(cmd: string): string[];
export const PROTECTED_DENIAL: string;
export function checkPlace(call: { name: string; args: unknown }, confine: Confine | null | undefined): { deny: string; path: string } | { ask: string } | null;
