export function summarizeAllRoutes(rows) {
  const routes = rows.filter((row) => !row.isUnassigned);
  const sum = (values, field) => values.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const total = (read) => {
    let sumOfRoutes = 0;
    for (const row of routes) {
      const value = read(row);
      if (value == null && !row.stopsCount) continue;
      if (value == null || !Number.isFinite(Number(value))) return null;
      sumOfRoutes += Number(value);
    }
    return sumOfRoutes;
  };
  const metricTotal = (field) => total((row) => row.optimized?.metrics?.[field]);
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
    totalTimeSeconds: total((row) => row.plannedTotalSeconds),
  };
}
