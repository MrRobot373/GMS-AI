export function similarity(a: string, b: string): number;
export function repairEdit(content: string, oldString: string, newString: string): { oldString: string; newString: string; how: string } | null;
export function nearestRegion(content: string, oldString: string, maxLines?: number): { from: number; to: number; text: string } | null;
export function editHint(error: string, content: string, oldString: string, newString: string, file: string, misses?: number): string | null;
