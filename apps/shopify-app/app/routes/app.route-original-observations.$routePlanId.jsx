import { authenticate } from '../shopify.server';
import { proxyDeliveryOriginalObservations } from '../features/delivery/route-original-observations.server';

export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  return proxyDeliveryOriginalObservations(request, params.routePlanId);
};
