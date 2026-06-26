import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  fetchDeliveryRouteGroupDetail,
  generateDeliveryRouteGroupChildRoutes,
  resolveDeliveryRouteGroupAssignments,
  saveDeliveryRouteGroupPolygons,
  updateDeliveryRouteGroupOrders,
} from "../features/delivery/route-groups.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ params, request }) => {
  const { session } = await authenticate.admin(request);
  const result = await fetchDeliveryRouteGroupDetail(request, params.routeGroupId, {
    cacheKey: session?.shop,
  });

  return {
    errors: result.errors,
    routeGroup: result.routeGroup,
  };
};

export const action = async ({ params, request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_intent");
  const sessionToken = formData.get("shopifySessionToken");

  if (intent === "generateChildRoutes") {
    return generateDeliveryRouteGroupChildRoutes(
      request,
      params.routeGroupId,
      { confirmRisk: formData.get("confirmRisk") === "true" },
      { sessionToken },
    );
  }

  if (intent === "updateOrders") {
    return updateDeliveryRouteGroupOrders(
      request,
      params.routeGroupId,
      readJsonFormValue(formData.get("payload"), {}),
      { sessionToken },
    );
  }

  if (intent === "savePolygons") {
    return saveDeliveryRouteGroupPolygons(
      request,
      params.routeGroupId,
      readJsonFormValue(formData.get("payload"), {}),
      { sessionToken },
    );
  }

  if (intent === "resolveAssignments") {
    return resolveDeliveryRouteGroupAssignments(
      request,
      params.routeGroupId,
      readJsonFormValue(formData.get("payload"), {}),
      { sessionToken },
    );
  }

  return { errors: [{ message: "지원하지 않는 route group 작업입니다." }], routeGroup: null };
};

export default function RouteGroupDetailPage() {
  const shopify = useAppBridge();
  const { errors = [], routeGroup } = useLoaderData();
  const actionFetcher = useFetcher();
  const currentRouteGroup = actionFetcher.data?.routeGroup ?? routeGroup;
  const currentErrors = actionFetcher.data?.errors ?? errors;

  const handleGenerateChildRoutes = async () => {
    const sessionToken = await shopify.idToken();
    const formData = new FormData();
    formData.set("_intent", "generateChildRoutes");
    formData.set("shopifySessionToken", sessionToken);
    actionFetcher.submit(formData, { method: "post" });
  };

  return (
    <main style={{ display: "grid", gap: "16px", padding: "16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <s-heading>{currentRouteGroup?.name ?? "Route group"}</s-heading>
          <p style={{ margin: "4px 0 0", color: "#616161" }}>
            {formatDateRange(currentRouteGroup)} · {currentRouteGroup?.displayStatus ?? "—"}
          </p>
        </div>
        <button
          type="button"
          disabled={!currentRouteGroup || actionFetcher.state !== "idle"}
          onClick={handleGenerateChildRoutes}
        >Regenerate</button>
      </header>

      {currentErrors.length > 0 ? (
        <div className="orders-error-filter" role="alert">
          {currentErrors.map((error) => error.message ?? "Route group 작업에 실패했습니다.").join(" ")}
        </div>
      ) : null}

      <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "12px" }}>
        <s-heading>Summary</s-heading>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
          <SummaryItem label="Orders" value={currentRouteGroup?.totalOrders ?? 0} />
          <SummaryItem label="Unresolved" value={currentRouteGroup?.unresolvedOrders ?? 0} />
          <SummaryItem label="Children" value={currentRouteGroup?.children?.length ?? 0} />
          <SummaryItem label="Version" value={currentRouteGroup?.currentVersion ?? "—"} />
        </dl>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "12px" }}>
        <s-heading>Orders</s-heading>
        <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
          {(currentRouteGroup?.assignments ?? []).map((assignment) => (
            <div key={assignment.orderId} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px", gap: "8px" }}>
              <strong>{assignment.orderName}</strong>
              <span>{assignment.addressLabel}</span>
              <span>{assignment.assignmentStatus}</span>
            </div>
          ))}
          {(currentRouteGroup?.assignments ?? []).length === 0 ? <p>No orders.</p> : null}
        </div>
      </section>
    </main>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{ background: "#f7f7f7", borderRadius: "8px", padding: "8px" }}>
      <dt style={{ color: "#666", fontSize: "12px" }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 700 }}>{value}</dd>
    </div>
  );
}

function formatDateRange(routeGroup) {
  if (!routeGroup) return "—";
  if (routeGroup.dateRangeStart === routeGroup.dateRangeEnd) return routeGroup.dateRangeStart;
  return `${routeGroup.dateRangeStart} ~ ${routeGroup.dateRangeEnd}`;
}

function readJsonFormValue(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}


export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
