import { handleOrdersSelectionSnapshotsResource } from "../features/orders/orders-page.server";

export const action = async ({ request }) => handleOrdersSelectionSnapshotsResource(request);
