import { requireKfoodOffice } from "../features/delivery/route-office-options.server";
import { authenticate } from "../shopify.server";
import { readRouteOptionsForm } from "../features/delivery/route-office-options";
import { saveRouteOptions } from "../features/delivery/route-office-options.server";

export async function action({ params, request }) {
  const { session } = await authenticate.admin(request);
  requireKfoodOffice(session);
  const form = await request.formData();
  try {
    const expectedUpdatedAt = String(
      form.get("expectedUpdatedAt") ?? "",
    ).trim();
    if (!expectedUpdatedAt)
      throw new Error("Reload the route revision before saving options.");
    return await saveRouteOptions(
      request,
      params.routeId,
      { ...readRouteOptionsForm(form), expectedUpdatedAt },
      {
        cacheKey: session?.shop,
        sessionToken: form.get("shopifySessionToken"),
      },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    return { errors: [{ message: error.message }] };
  }
}
