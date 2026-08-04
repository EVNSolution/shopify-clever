import { loadOrdersMapPointsResource } from "../features/orders/orders-page.server";

export const action = async ({ request }) => loadOrdersMapPointsResource(request);
