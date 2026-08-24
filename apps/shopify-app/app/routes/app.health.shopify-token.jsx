import { getShopifyTokenSyncHealth } from "../features/delivery/shopify-token-sync.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  return Response.json({
    data: { tokenSync: getShopifyTokenSyncHealth(session?.shop) },
    error: null,
  });
}
