export function formatView(v: unknown): string;
export function browserTools(defineTool: (def: unknown) => unknown, browser: (body: object, signal?: AbortSignal) => Promise<any>): unknown[];
