export function normalizeOrderNumberPrefix(value) {
  const search = String(value ?? "").trim();
  const prefix = search.replace(/^#/, "").trimStart();
  // Keep invalid repeated markers intact so the API rejects them without widening the query.
  return prefix.startsWith("#") ? search : prefix;
}
