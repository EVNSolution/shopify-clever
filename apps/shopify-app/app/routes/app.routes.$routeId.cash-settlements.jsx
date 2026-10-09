import {
  fetchRouteCashSettlements,
  requireKfoodOffice,
} from "../features/delivery/route-office-options.server";
import { authenticate } from "../shopify.server";

export async function loader({ params, request }) {
  const { session } = await authenticate.admin(request);
  requireKfoodOffice(session);
  return Response.json(
    await fetchRouteCashSettlements(request, params.routeId, {
      cacheKey: session?.shop,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
