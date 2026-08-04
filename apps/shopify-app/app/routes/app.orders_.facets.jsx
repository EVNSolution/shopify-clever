import { loadOrdersFacetsResource } from "../features/orders/orders-page.server";

export const action = async ({ request }) => loadOrdersFacetsResource(request);
