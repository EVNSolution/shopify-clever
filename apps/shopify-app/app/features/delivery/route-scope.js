export function buildRouteScopeFromOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return null;

  const routeScopes = orders.map(mapOrderToRouteScope);
  if (routeScopes.some((routeScope) => !routeScope)) return null;

  const [firstRouteScope] = routeScopes;
  const hasMixedScope = routeScopes.some(
    (routeScope) => routeScope.routeScopeKey !== firstRouteScope.routeScopeKey,
  );

  return hasMixedScope ? null : firstRouteScope;
}

function mapOrderToRouteScope(order) {
  const deliveryDate = textOrNull(order?.deliveryDate);
  const routeScopeKey = textOrNull(order?.routeScopeKey);

  if (!deliveryDate || !routeScopeKey) return null;

  const deliverySession =
    textOrNull(order?.deliverySession) ??
    deriveDeliverySession(order?.serviceType);
  const serviceType =
    textOrNull(order?.serviceType) ??
    deriveServiceType(deliverySession);

  return {
    deliveryDate,
    serviceType,
    deliverySession,
    timeWindowStart: textOrNull(order?.timeWindowStart),
    timeWindowEnd: textOrNull(order?.timeWindowEnd),
    routeScopeKey,
  };
}

function deriveDeliverySession(serviceType) {
  return textOrNull(serviceType) === "EVENING_DELIVERY" ? "EVENING" : "DAY";
}

function deriveServiceType(deliverySession) {
  return textOrNull(deliverySession) === "EVENING"
    ? "EVENING_DELIVERY"
    : "DELIVERY";
}

function textOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}
