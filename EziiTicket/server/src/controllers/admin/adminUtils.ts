export function asInt(v: unknown) {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

