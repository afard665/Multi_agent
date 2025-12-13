export function ensureString(value: any, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function ensureNumber(value: any, fallback = 0): number {
  return typeof value === "number" && !isNaN(value) ? value : fallback;
}

export function ensureArray<T>(value: any, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}
