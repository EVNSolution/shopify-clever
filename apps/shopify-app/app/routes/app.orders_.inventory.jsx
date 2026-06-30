import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryInventoryDetail } from "../features/delivery/inventories.server";
import { buildInventoryProductMatrix } from "../features/delivery/inventory-matrix";
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
  gap: "10px",
  padding: "14px 16px",
};

const headerStyle = {
  alignItems: "center",
  display: "flex",
  gap: "12px",
  justifyContent: "space-between",
};

const titleStyle = {
  margin: 0,
  fontSize: "22px",
  lineHeight: "30px",
};

const tableWrapStyle = {
  overflowX: "auto",
};

const tableStyle = {
  borderCollapse: "collapse",
  fontSize: "13px",
  lineHeight: "18px",
  minWidth: "100%",
  width: "max-content",
};

const cellStyle = {
  borderTop: "1px solid #ebebeb",
  padding: "7px 8px",
  textAlign: "right",
  whiteSpace: "nowrap",
};

const rowHeaderStyle = {
  ...cellStyle,
  left: 0,
  position: "sticky",
  textAlign: "left",
  zIndex: 1,
};

const headCellStyle = {
  ...cellStyle,
  background: "#f7f7f7",
  fontWeight: 600,
};

const headRowHeaderStyle = {
  ...rowHeaderStyle,
  ...headCellStyle,
  zIndex: 2,
};

const totalCellStyle = {
  ...cellStyle,
  fontWeight: 600,
};

const noticeStyle = {
  background: "#fff4f4",
  borderBottom: "1px solid #fed7d7",
  color: "#8a1f11",
  fontSize: "12px",
  padding: "8px 10px",
};

const printCss = `
@media print {
  .inventory-detail-no-print { display: none !important; }
  .inventory-detail-page { padding: 0 !important; }
  .inventory-detail-panel { border: 0 !important; border-radius: 0 !important; }
  .inventory-detail-table-wrap { overflow: visible !important; }
  .inventory-detail-table { font-size: 11px !important; width: 100% !important; }
  .inventory-detail-row-header { position: static !important; }
  @page { margin: 12mm; }
}
`;

export const loader = async ({ request }) => {
  const inventoryId = new URL(request.url).searchParams.get("id");
  const result = await fetchDeliveryInventoryDetail(request, inventoryId);
  logInventoryDetailPayload(inventoryId, result, buildInventoryDetailApiPath(inventoryId));
  return {
    errors: result.errors ?? [],
    inventory: result.inventory,
  };
};

function buildInventoryDetailApiPath(inventoryId) {
  return inventoryId ? `/admin/inventories/${encodeURIComponent(inventoryId)}` : null;
}

function logInventoryDetailPayload(inventoryId, result, apiPath) {
  const inventory = result.inventory;
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  const summaryItems = Array.isArray(inventory?.itemSummary?.items) ? inventory.itemSummary.items : [];
  const orderItems = orders.flatMap((order) => (Array.isArray(order?.items) ? order.items : []));
  const emptyItemReason = getEmptyInventoryItemReason({
    errorCount: result.errors?.length ?? 0,
    ordersCount: orders.length,
    orderItemLines: orderItems.length,
    summaryQuantity: Number(inventory?.itemSummary?.totalQuantity) || 0,
  });

  console.info("orders.inventory.detail.api", {
    apiPath,
    emptyItemReason,
    errorCount: result.errors?.length ?? 0,
    firstOrderItemKeys: Object.keys(orderItems[0] ?? {}),
    firstOrderKeys: Object.keys(orders[0] ?? {}),
    inventoryId,
    name: inventory?.name ?? null,
    orderIdsCount: Array.isArray(inventory?.orderIds) ? inventory.orderIds.length : null,
    ordersCount: orders.length,
    ordersCountField: inventory?.ordersCount ?? null,
    orderItemLines: orderItems.length,
    orderItemQuantity: sumItemQuantity(orderItems),
    summaryItemLines: summaryItems.length,
    summaryItemQuantity: Number(inventory?.itemSummary?.totalQuantity) || 0,
  });
}

function getEmptyInventoryItemReason({ errorCount, ordersCount, orderItemLines, summaryQuantity }) {
  if (errorCount > 0) return "api_error";
  if (ordersCount === 0) return "no_orders";
  if (orderItemLines === 0 && summaryQuantity === 0) return "orders_present_without_items";
  return null;
}

function sumItemQuantity(items) {
  return items.reduce((total, item) => total + (Number(item?.quantity) || 0), 0);
}

export default function InventoryDetailPage() {
  const { errors, inventory } = useLoaderData();
  const notice = getServiceErrorNotice([{ errors }], { context: "inventory_detail" });
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  const matrix = buildInventoryProductMatrix(orders);
  const hasMatrix = matrix.rows.length > 0 && matrix.products.length > 0;

  return (
    <main className="inventory-detail-page" style={pageStyle}>
      <style>{printCss}</style>
      <Link className="inventory-detail-no-print" to="/app/orders?view=inventory">← Back to Inventory</Link>
      <section className="inventory-detail-panel" style={panelStyle}>
        {notice ? <div role="alert" style={noticeStyle}>{notice}</div> : null}
        <div style={sectionStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>{inventory?.name ?? "Inventory"}</h1>
            <button className="inventory-detail-no-print" type="button" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </section>

      <section className="inventory-detail-panel" style={panelStyle}>
        <div style={sectionStyle}>
          <h2>Product quantities by date</h2>
          <div className="inventory-detail-table-wrap" style={tableWrapStyle}>
            <table aria-label="Inventory product matrix" className="inventory-detail-table" style={tableStyle}>
              <thead>
                <tr>
                  <th className="inventory-detail-row-header" style={headRowHeaderStyle}>Date</th>
                  {matrix.products.map((product) => (
                    <th key={product.key} style={headCellStyle}>{product.label}</th>
                  ))}
                  <th style={headCellStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {!hasMatrix ? (
                  <tr><td colSpan={matrix.products.length + 2} style={cellStyle}>No items</td></tr>
                ) : matrix.rows.map((row) => (
                  <tr key={row.date}>
                    <th className="inventory-detail-row-header" scope="row" style={rowHeaderStyle}>{row.label}</th>
                    {matrix.products.map((product) => (
                      <td key={product.key} style={cellStyle}>{row.quantities[product.key] ?? 0}</td>
                    ))}
                    <td style={totalCellStyle}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
              {hasMatrix ? (
                <tfoot>
                  <tr>
                    <th className="inventory-detail-row-header" scope="row" style={headRowHeaderStyle}>Total</th>
                    {matrix.products.map((product) => (
                      <td key={product.key} style={totalCellStyle}>{matrix.productTotals[product.key] ?? 0}</td>
                    ))}
                    <td style={totalCellStyle}>{matrix.totalQuantity}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
