import { requireKfoodOffice } from "../features/delivery/route-office-options.server";
import { authenticate } from "../shopify.server";
import { buildSettlementPayload } from "../features/delivery/route-office-options";
import {
  fetchRouteCashSettlements,
  confirmRouteCashSettlement,
} from "../features/delivery/route-office-options.server";

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

export async function action({ params, request }) {
  const { session } = await authenticate.admin(request);
  requireKfoodOffice(session);
  const form = await request.formData();
  let payload;
  try {
    payload = buildSettlementPayload({
      commandId: form.get("commandId"),
      receiptId: form.get("receiptId"),
      expectedRevision:
        form.has("expectedRevision") && form.get("expectedRevision") !== ""
          ? Number(form.get("expectedRevision"))
          : undefined,
      confirmedAmount: form.get("confirmedAmount"),
      currency: form.get("currency"),
      reason: form.get("reason"),
    });
  } catch (error) {
    return { errors: [{ message: error.message }] };
  }
  const result = await confirmRouteCashSettlement(
    request,
    params.routeId,
    payload,
    { cacheKey: session?.shop, sessionToken: form.get("shopifySessionToken") },
  );
  if (result.errors.length) return result;
  return {
    ...(await fetchRouteCashSettlements(request, params.routeId, {
      cacheKey: session?.shop,
      sessionToken: form.get("shopifySessionToken"),
    })),
    saved: true,
  };
}
