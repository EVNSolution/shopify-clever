import { getShopifyTokenSyncHealth } from "../features/delivery/shopify-token-sync.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return Response.json({ data: { tokenSync: getShopifyTokenSyncHealth() }, error: null });
};
