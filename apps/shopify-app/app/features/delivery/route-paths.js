export const ROUTES_ROOT_PATH = "/app/routes";

export function routeGroupPath(routeGroupId) {
  return `${ROUTES_ROOT_PATH}/groups/${encodeURIComponent(routeGroupId)}`;
}

export function routeGroupChildPath(routeGroupId, routePlanId) {
  return `${routeGroupPath(routeGroupId)}/routes/${encodeURIComponent(routePlanId)}`;
}

export function routePlanPath(routePlanId) {
  return `${ROUTES_ROOT_PATH}/${encodeURIComponent(routePlanId)}`;
}

export function appendIdToken(path, idToken) {
  if (!idToken) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}id_token=${encodeURIComponent(idToken)}`;
}
