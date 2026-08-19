import { loadOrdersRouteGroupsResource } from "../features/orders/orders-page.server";

export const action = async ({ request }) => loadOrdersRouteGroupsResource(request);
