/* eslint-disable react/prop-types */
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  createDeliveryRouteGroupBranch,
  deleteDeliveryRouteGroupBranch,
  fetchDeliveryRouteGroupDetail,
  generateDeliveryRouteGroupChildRoutes,
  resolveDeliveryRouteGroupAssignments,
  saveDeliveryRouteGroupPolygons,
  updateDeliveryRouteGroupBranchOrders,
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

  if (intent === "createBranch") {
    return createDeliveryRouteGroupBranch(
      request,
      params.routeGroupId,
      readJsonFormValue(formData.get("payload"), {}),
      { sessionToken },
    );
  }

  if (intent === "updateBranchOrders") {
    return updateDeliveryRouteGroupBranchOrders(
      request,
      params.routeGroupId,
      formData.get("branchId"),
      readJsonFormValue(formData.get("payload"), {}),
      { sessionToken },
    );
  }

  if (intent === "deleteBranch") {
    return deleteDeliveryRouteGroupBranch(
      request,
      params.routeGroupId,
      formData.get("branchId"),
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
  const assignments = currentRouteGroup?.assignments ?? [];
  const branches = currentRouteGroup?.branches ?? [];
  const branchedOrderIds = new Set(branches.flatMap((branch) => branch.orderIds ?? []));
  const unbranchedOrderIds = assignments.filter((assignment) => !branchedOrderIds.has(assignment.orderId)).map((assignment) => assignment.orderId);

  const submitIntent = async (intent, payload = {}, fields = {}) => {
    const sessionToken = await shopify.idToken();
    const formData = new FormData();
    formData.set("_intent", intent);
    formData.set("payload", JSON.stringify(payload));
    formData.set("shopifySessionToken", sessionToken);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
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
        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
          <s-heading>Branches</s-heading>
          <button
            type="button"
            disabled={!currentRouteGroup || unbranchedOrderIds.length === 0 || actionFetcher.state !== "idle"}
            onClick={() => submitIntent("createBranch", { label: `Branch ${branches.length + 1}`, orderIds: unbranchedOrderIds })}
          >Create branch</button>
        </div>
        <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
          {branches.map((branch) => (
            <div key={branch.id} style={{ border: "1px solid #eee", borderRadius: "8px", display: "grid", gap: "6px", padding: "8px" }}>
              <strong>{branch.label ?? branch.driverName ?? "Unassigned branch"}</strong>
              <span>{branch.ordersCount ?? 0} orders · {branch.driverName ?? "No driver"}</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  disabled={(branch.orderIds ?? []).length === 0 || actionFetcher.state !== "idle"}
                  onClick={() => submitIntent("updateBranchOrders", { removeOrderIds: branch.orderIds ?? [] }, { branchId: branch.id })}
                >Release orders</button>
                <button
                  type="button"
                  disabled={actionFetcher.state !== "idle"}
                  onClick={() => submitIntent("deleteBranch", {}, { branchId: branch.id })}
                >Delete branch</button>
              </div>
            </div>
          ))}
          {branches.length === 0 ? <p>모든 주문이 기본 미등록 상태입니다.</p> : null}
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: "12px", padding: "12px" }}>
        <s-heading>Orders</s-heading>
        <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
          {assignments.map((assignment) => (
            <div key={assignment.orderId} style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 140px", gap: "8px" }}>
              <strong>{assignment.orderName}</strong>
              <span>{assignment.addressLabel}</span>
              <span>{assignment.assignmentStatus}</span>
              <span>{branchLabelForOrder(branches, assignment.orderId)}</span>
            </div>
          ))}
          {assignments.length === 0 ? <p>No orders.</p> : null}
        </div>
      </section>

      <details>
        <summary>Legacy child route projection</summary>
        <button
          type="button"
          disabled={!currentRouteGroup || actionFetcher.state !== "idle"}
          onClick={() => submitIntent("generateChildRoutes", { confirmRisk: false })}
        >Generate child routes</button>
      </details>
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

function branchLabelForOrder(branches, orderId) {
  const branch = branches.find((candidate) => (candidate.orderIds ?? []).includes(orderId));
  return branch?.label ?? branch?.driverName ?? "Unassigned";
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
