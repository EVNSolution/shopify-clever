import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryInventoryDetail } from "../features/delivery/inventories.server";
import { buildInventoryProductMatrix } from "../features/delivery/inventory-matrix";
import { getServiceErrorNotice } from "../features/service-errors";

const pageStyle = {
  boxSizing: "border-box",
  display: "grid",
  gap: "8px",
  margin: "0 auto",
  maxWidth: "210mm",
  minHeight: "297mm",
  padding: "4px 12px 12px",
  width: "100%",
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
  padding: "10px 14px",
};

const headerTopBarStyle = {
  alignItems: "center",
  display: "flex",
  gap: "12px",
  justifyContent: "space-between",
};

const headerActionStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  marginLeft: "auto",
};

const backLinkStyle = {
  alignItems: "center",
  color: "#4b5563",
  display: "inline-flex",
  fontSize: "13px",
  fontWeight: 650,
  gap: "6px",
  lineHeight: 1.2,
  minHeight: "26px",
  textDecoration: "none",
};

const titleStyle = {
  margin: 0,
  fontSize: "16px",
  lineHeight: "22px",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sectionTitleRowStyle = {
  alignItems: "baseline",
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "space-between",
};

const summaryStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
};

const outputTimeStyle = {
  color: "#616161",
  fontSize: "11px",
};

const tableWrapStyle = {
  display: "grid",
  gap: "8px",
  overflowX: "auto",
};

const tableStyle = {
  borderLeft: "1px solid #e5e7eb",
  borderTop: "1px solid #e5e7eb",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "13px",
  lineHeight: "18px",
  minWidth: "520px",
  tableLayout: "fixed",
  width: "100%",
};

const cellStyle = {
  borderBottom: "1px solid #ebebeb",
  borderRight: "1px solid #e5e7eb",
  padding: "6px 8px",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const rowHeaderStyle = {
  ...cellStyle,
  background: "#ffffff",
  left: 0,
  padding: "6px 5px",
  position: "sticky",
  textAlign: "left",
  zIndex: 1,
};

const headCellStyle = {
  ...cellStyle,
  background: "#f7f7f7",
  borderBottom: "1px solid #dcdfe4",
  fontWeight: 600,
  textAlign: "center",
};

const groupTotalHeadCellStyle = {
  ...headCellStyle,
  lineHeight: "14px",
  whiteSpace: "normal",
};

const productHeadCellStyle = {
  ...headCellStyle,
  lineHeight: "16px",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  wordBreak: "keep-all",
};

const productHeadLabelStyle = {
  display: "-webkit-box",
  maxHeight: "32px",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
};

const headRowHeaderStyle = {
  ...rowHeaderStyle,
  ...headCellStyle,
  zIndex: 2,
};

const totalColumnCellStyle = {
  ...cellStyle,
  fontWeight: 600,
};

const totalRowCellStyle = {
  ...cellStyle,
  background: "#f3f4f6",
  borderTop: "1px solid #ebebeb",
  fontWeight: 700,
};

const totalRowHeaderStyle = {
  ...rowHeaderStyle,
  background: "#f3f4f6",
  borderTop: "1px solid #ebebeb",
  fontWeight: 700,
};

const dateLabelStyle = {
  alignItems: "center",
  display: "grid",
  gap: "3px",
  gridTemplateColumns: "24px 38px",
  justifyContent: "center",
};

const dateWeekdayStyle = {
  textAlign: "left",
};

const dateValueStyle = {
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
};

const dateColumnStyle = {
  width: "78px",
};

const totalColumnStyle = {
  width: "68px",
};

const PRODUCT_COLUMNS_PER_TABLE = 6;

const noticeStyle = {
  background: "#fff4f4",
  borderBottom: "1px solid #fed7d7",
  color: "#8a1f11",
  fontSize: "12px",
  padding: "8px 10px",
};

const printCss = `
@media print {
  html, body { margin: 0 !important; }
  .inventory-detail-no-print { display: none !important; }
  .inventory-detail-page { box-sizing: border-box !important; font-size: 11px !important; justify-content: center !important; margin: 0 auto !important; max-width: none !important; min-height: 297mm !important; padding: 5mm 8mm 8mm !important; width: 210mm !important; }
  .inventory-detail-panel { border: 0 !important; border-radius: 0 !important; }
  .inventory-detail-table-wrap { overflow: visible !important; }
  .inventory-detail-table { font-size: 11px !important; width: 100% !important; }
  .inventory-detail-table th, .inventory-detail-table td { line-height: 14px !important; padding: 4px 5px !important; }
  .inventory-detail-page h1 { font-size: 13px !important; line-height: 17px !important; }
  .inventory-detail-product-label { max-height: 28px !important; }
  .inventory-detail-row-header { position: static !important; }
  @page { size: A4 portrait; margin: 0; }
}
`;

export const loader = async ({ request }) => {
  const inventoryId = new URL(request.url).searchParams.get("id");
  const result = await fetchDeliveryInventoryDetail(request, inventoryId);
  logInventoryDetailPayload(inventoryId, result, buildInventoryDetailApiPath(inventoryId));
  return {
    errors: result.errors ?? [],
    generatedAt: new Date().toISOString(),
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

function getProductChunks(products) {
  const chunks = [];
  for (let index = 0; index < products.length; index += PRODUCT_COLUMNS_PER_TABLE) {
    chunks.push(products.slice(index, index + PRODUCT_COLUMNS_PER_TABLE));
  }
  return chunks;
}

function getProductSlots(products) {
  return Array.from({ length: PRODUCT_COLUMNS_PER_TABLE }, (_, index) => products[index] ?? null);
}

function formatOutputTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function DateCellLabel({ label }) {
  const match = String(label).match(/^([A-Za-z]{3}),\s*(\d{2}\/\d{2})$/);
  if (!match) return label;
  return (
    <span style={dateLabelStyle}>
      <span style={dateWeekdayStyle}>{match[1]}</span>
      <span style={dateValueStyle}>{match[2]}</span>
    </span>
  );
}

export default function InventoryDetailPage() {
  const { errors, generatedAt, inventory } = useLoaderData();
  const notice = getServiceErrorNotice([{ errors }], { context: "inventory_detail" });
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  const matrix = buildInventoryProductMatrix(orders);
  const hasMatrix = matrix.rows.length > 0 && matrix.products.length > 0;
  const productChunks = hasMatrix ? getProductChunks(matrix.products) : [];

  return (
    <main className="inventory-detail-page" style={pageStyle}>
      <style>{printCss}</style>
      <section className="inventory-detail-panel" style={panelStyle}>
        {notice ? <div role="alert" style={noticeStyle}>{notice}</div> : null}
        <div style={sectionStyle}>
          <div style={headerTopBarStyle}>
            <Link className="inventory-detail-no-print" style={backLinkStyle} to="/app/orders?view=inventory">
              ← Back to Inventory
            </Link>
            <div style={headerActionStyle}>
              <span style={outputTimeStyle}>Output: {formatOutputTime(generatedAt)}</span>
              <button className="inventory-detail-no-print" type="button" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </div>
      </section>

      <section className="inventory-detail-panel" style={panelStyle}>
        <div style={sectionStyle}>
          <div style={sectionTitleRowStyle}>
            <h1 style={titleStyle}>{inventory?.name ?? "Inventory"}</h1>
            {hasMatrix ? <span style={summaryStyle}>Overall total: {matrix.totalQuantity}</span> : null}
          </div>
          <div className="inventory-detail-table-wrap" style={tableWrapStyle}>
            {!hasMatrix ? (
              <table aria-label="Inventory product matrix" className="inventory-detail-table" style={tableStyle}>
                <tbody>
                  <tr><td style={cellStyle}>No items</td></tr>
                </tbody>
              </table>
            ) : productChunks.map((products, chunkIndex) => {
              const productSlots = getProductSlots(products);
              return (
                <table
                  aria-label={
                    productChunks.length === 1
                      ? "Inventory product matrix"
                      : `Inventory product matrix group ${chunkIndex + 1}`
                  }
                  className="inventory-detail-table"
                  key={products.map((product) => product.key).join("|")}
                  style={tableStyle}
                >
                  <colgroup>
                    <col style={dateColumnStyle} />
                    {productSlots.map((product, index) => <col key={product?.key ?? `empty-${index}`} />)}
                    <col style={totalColumnStyle} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="inventory-detail-row-header" style={headRowHeaderStyle}>Date</th>
                      {productSlots.map((product, index) => (
                        product ? (
                          <th key={product.key} style={productHeadCellStyle} title={product.label}>
                            <span className="inventory-detail-product-label" style={productHeadLabelStyle}>{product.displayLabel ?? product.label}</span>
                          </th>
                        ) : (
                          <th aria-hidden="true" key={`empty-${index}`} style={productHeadCellStyle} />
                        )
                      ))}
                      <th style={groupTotalHeadCellStyle}>Group total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => {
                      const groupTotal = products.reduce(
                        (total, product) => total + (row.quantities[product.key] ?? 0),
                        0,
                      );
                      return (
                        <tr key={row.date}>
                          <th className="inventory-detail-row-header" scope="row" style={rowHeaderStyle}>
                            <DateCellLabel label={row.label} />
                          </th>
                          {productSlots.map((product, index) => (
                            product ? (
                              <td key={product.key} style={cellStyle}>{row.quantities[product.key] ?? 0}</td>
                            ) : (
                              <td aria-hidden="true" key={`empty-${index}`} style={cellStyle} />
                            )
                          ))}
                          <td style={totalColumnCellStyle}>{groupTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th className="inventory-detail-row-header" scope="row" style={totalRowHeaderStyle}>Total</th>
                      {productSlots.map((product, index) => (
                        product ? (
                          <td key={product.key} style={totalRowCellStyle}>{matrix.productTotals[product.key] ?? 0}</td>
                        ) : (
                          <td aria-hidden="true" key={`empty-${index}`} style={totalRowCellStyle} />
                        )
                      ))}
                      <td style={totalRowCellStyle}>
                        {products.reduce((total, product) => total + (matrix.productTotals[product.key] ?? 0), 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              );
            })}
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
