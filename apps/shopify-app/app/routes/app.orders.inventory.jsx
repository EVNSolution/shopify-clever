import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryInventoryDetail } from "../features/delivery/inventories.server";
import { getServiceErrorNotice } from "../features/service-errors";

const pageStyle = {
  display: "grid",
  gap: "12px",
  padding: "8px 12px 12px",
};

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  overflow: "hidden",
};

const sectionStyle = {
  display: "grid",
  gap: "8px",
  padding: "14px 16px",
};

const titleStyle = {
  margin: 0,
  fontSize: "22px",
  lineHeight: "30px",
};

const tableStyle = {
  borderCollapse: "collapse",
  fontSize: "13px",
  lineHeight: "18px",
  width: "100%",
};

const cellStyle = {
  borderTop: "1px solid #ebebeb",
  padding: "7px 8px",
  textAlign: "left",
};

const noticeStyle = {
  background: "#fff4f4",
  borderBottom: "1px solid #fed7d7",
  color: "#8a1f11",
  fontSize: "12px",
  padding: "8px 10px",
};

export const loader = async ({ request }) => {
  const inventoryId = new URL(request.url).searchParams.get("id");
  const result = await fetchDeliveryInventoryDetail(request, inventoryId);
  return {
    errors: result.errors ?? [],
    inventory: result.inventory,
  };
};

export default function InventoryDetailPage() {
  const { errors, inventory } = useLoaderData();
  const notice = getServiceErrorNotice([{ errors }], { context: "inventory_detail" });
  const itemSummary = inventory?.itemSummary ?? { items: [], totalQuantity: 0 };
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  const lastChange = Array.isArray(inventory?.lastChange) ? inventory.lastChange : [];
  const orderQuantity = (order) => (order.items ?? []).reduce((total, item) => total + (Number(item.quantity) || 0), 0);
  const formatOptions = (options) => (options ?? []).map((option) => `${option.key}: ${option.value}`).join(", ") || "—";

  return (
    <main style={pageStyle}>
      <Link to="/app/orders?view=inventory">← Back to Inventory</Link>
      <section style={panelStyle}>
        {notice ? <div role="alert" style={noticeStyle}>{notice}</div> : null}
        <div style={sectionStyle}>
          <h1 style={titleStyle}>{inventory?.name ?? "Inventory"}</h1>
          <span>Total items: {itemSummary.totalQuantity ?? 0}</span>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={sectionStyle}>
          <h2>Total items</h2>
          <table aria-label="Inventory total items" style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Item</th>
                <th style={cellStyle}>Options</th>
                <th style={cellStyle}>SKU</th>
                <th style={cellStyle}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {(itemSummary.items ?? []).length === 0 ? (
                <tr><td colSpan={4} style={cellStyle}>No items</td></tr>
              ) : itemSummary.items.map((item, index) => (
                <tr key={`${item.name}-${item.sku ?? ""}-${index}`}>
                  <td style={cellStyle}>{item.name}</td>
                  <td style={cellStyle}>{formatOptions(item.options)}</td>
                  <td style={cellStyle}>{item.sku ?? "—"}</td>
                  <td style={cellStyle}>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={sectionStyle}>
          <h2>Order-by-order items</h2>
          <table aria-label="Inventory order-by-order items" style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Order</th>
                <th style={cellStyle}>Items</th>
                <th style={cellStyle}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={3} style={cellStyle}>No orders</td></tr>
              ) : orders.map((order) => (
                <tr key={order.id}>
                  <td style={cellStyle}>{order.name ?? order.id}</td>
                  <td style={cellStyle}>{(order.items ?? []).map((item) => item.name).join(", ") || "—"}</td>
                  <td style={cellStyle}>{orderQuantity(order)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panelStyle}>
        <div style={sectionStyle}>
          <h2>Delta remarks</h2>
          <table aria-label="Inventory delta remarks" style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Action</th>
                <th style={cellStyle}>Item</th>
                <th style={cellStyle}>Delta</th>
                <th style={cellStyle}>Changed time</th>
              </tr>
            </thead>
            <tbody>
              {lastChange.length === 0 ? (
                <tr><td colSpan={4} style={cellStyle}>No changes</td></tr>
              ) : lastChange.map((change, index) => (
                <tr key={`${change.orderId}-${change.name}-${index}`}>
                  <td style={cellStyle}>{change.action}</td>
                  <td style={cellStyle}>{change.name}</td>
                  <td style={cellStyle}>{change.quantityDelta}</td>
                  <td style={cellStyle}>{change.createdAt ? new Date(change.createdAt).toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
