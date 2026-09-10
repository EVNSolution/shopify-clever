export function summarizeAllRoutes(rows) {
  const routes = rows.filter((row) => !row.isUnassigned);
  const sum = (values, field) => values.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const metricTotal = (field) => {
    let total = 0;
    for (const row of routes) {
      const value = row.optimized?.metrics?.[field];
      if (value == null && !row.stopsCount) continue;
      if (value == null || !Number.isFinite(Number(value))) return null;
      total += Number(value);
    }
    return total;
  };
  return {
    routes: routes.length,
    stops: sum(rows, "stopsCount"),
    items: sum(rows, "totalItems"),
    allocatedStops: sum(routes, "stopsCount"),
    allocatedItems: sum(routes, "totalItems"),
    delivered: sum(routes, "deliveredCount"),
    attempted: sum(routes, "attemptedCount"),
    durationSeconds: metricTotal("durationSeconds"),
    distanceMeters: metricTotal("distanceMeters"),
  };
}
