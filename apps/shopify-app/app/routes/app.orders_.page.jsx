import { loadOrdersPageResource } from "../features/orders/orders-page.server";

export const action = async ({ request }) => loadOrdersPageResource(request);
