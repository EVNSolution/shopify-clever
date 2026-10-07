import {
  fetchKfoodLiveChange,
  handleKfoodLiveChangeAction,
  liveChangeJsonResponse,
} from "../features/delivery/live-change.server.js";
import { authenticate } from "../shopify.server";

// This resource has no page component. Document fetches receive JSON directly.
export async function loader({ params, request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const result = await fetchKfoodLiveChange(request, params.routeId, {
    session,
    scopeKey: url.searchParams.get("scopeKey"),
    routePlanId: url.searchParams.get("routePlanId"),
  });
  return liveChangeJsonResponse(result);
}

export async function action({ params, request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent") ?? formData.get("intent");
  return handleKfoodLiveChangeAction(request, params.routeId, intent, formData, { session });
}
