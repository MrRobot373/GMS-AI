export const UNTRUSTED: string;
export const SEARCH_CITE_LINE: string;
export const SEARCH_READ_LINE: string;
export const WEB_GUIDANCE: string;
export interface FetchedPage {
  url: string;
  status?: number;
  title?: string | null;
  kind?: "html" | "pdf" | "text";
  text: string;
  offset: number;
  next: number | null;
  total: number;
  cut?: boolean;
  /** A PDF's pages: how many were read (from the first) and how many it has. */
  pages?: { read: number; total: number } | null;
}
export function formatPage(p: FetchedPage): string;
export function webTools(defineTool: (def: unknown) => unknown, call: (path: string, init?: RequestInit) => Promise<any>): unknown[];
