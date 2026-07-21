/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Link, useLoaderData, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchDeliveryInventoryOrderView } from "../features/delivery/inventories.server";
import { buildInventoryHistoryItems, buildInventoryProductMatrix } from "../features/delivery/inventory-matrix";
import { getInventoryPrintTextLineCount } from "../features/delivery/inventory-print";
import { getServiceErrorNotice } from "../features/service-errors";

export const meta = ({ data }) => [{ title: data?.inventory?.name ?? "Inventory" }];

const pageStyle = {
  boxSizing: "border-box",
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "210mm 360px",
  justifyContent: "center",
  margin: "0 auto",
  maxWidth: "calc(210mm + 380px)",
  minWidth: "calc(210mm + 380px)",
  padding: "4px 12px 12px",
  width: "100%",
};

const sheetStyle = {
  alignContent: "start",
  boxSizing: "border-box",
  display: "grid",
  gap: "8px",
  maxWidth: "210mm",
  minHeight: "297mm",
  width: "210mm",
};

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  overflow: "hidden",
};

const historyPanelStyle = {
  ...panelStyle,
  alignSelf: "start",
  boxSizing: "border-box",
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto",
  paddingRight: "6px",
  position: "sticky",
  scrollbarGutter: "stable",
  top: "12px",
};

const sectionStyle = {
  display: "grid",
  gap: "8px",
  padding: "10px 14px",
};

const tableSectionStyle = {
  ...sectionStyle,
  overflow: "auto",
  scrollbarGutter: "stable",
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

const viewToggleStyle = {
  background: "#f6f6f7",
  border: "1px solid #d6d6d6",
  borderRadius: "999px",
  display: "inline-flex",
  gap: "2px",
  padding: "2px",
};

const viewToggleButtonStyle = {
  background: "transparent",
  border: 0,
  borderRadius: "999px",
  color: "#616161",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: "16px",
  padding: "3px 9px",
};

const activeViewToggleButtonStyle = {
  ...viewToggleButtonStyle,
  background: "#202223",
  color: "#ffffff",
  cursor: "default",
  opacity: 1,
};

const hiddenStyle = {
  display: "none",
};

const strongDividerStyle = "1px solid var(--app-divider-strong)";
const subtleDividerStyle = "1px solid var(--app-divider-subtle)";

const orderViewStyle = {
  display: "grid",
  gap: "8px",
};

const orderViewMetaStyle = {
  border: subtleDividerStyle,
  display: "grid",
  fontSize: "11px",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
};

const orderViewMetaCellStyle = {
  borderRight: subtleDividerStyle,
  display: "grid",
  gap: "2px",
  minWidth: 0,
  padding: "6px",
};

const orderViewMetaLabelStyle = {
  color: "#6b7280",
  fontSize: "9px",
  fontWeight: 750,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const orderViewMetaValueStyle = {
  fontSize: "11px",
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderViewColumns = "70px minmax(190px, 260px) 52px 70px 68px minmax(112px, 1fr) 112px";

const orderViewOrdersListStyle = {
  display: "grid",
  gap: "10px",
  width: "100%",
};

const orderViewHeaderRowStyle = {
  alignItems: "start",
  borderBottom: strongDividerStyle,
  color: "#374151",
  display: "grid",
  fontSize: "11px",
  fontWeight: 750,
  gap: "0 10px",
  gridTemplateColumns: orderViewColumns,
  lineHeight: "14px",
  padding: "4px 0 8px",
};

const orderViewHeaderCellStyle = {
  minWidth: 0,
  whiteSpace: "normal",
};

const orderViewOrderCardStyle = {
  borderTop: strongDividerStyle,
  breakInside: "avoid",
  display: "grid",
  gap: 0,
  pageBreakInside: "avoid",
};

const firstOrderViewOrderCardStyle = {
  ...orderViewOrderCardStyle,
  borderTop: 0,
};

const orderViewOrderRowStyle = {
  alignItems: "start",
  borderBottom: subtleDividerStyle,
  display: "grid",
  fontSize: "11px",
  gap: "0 10px",
  gridTemplateColumns: orderViewColumns,
  lineHeight: "16px",
  minHeight: "34px",
  padding: "8px 0",
};

const orderViewCellStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  wordBreak: "keep-all",
};

const orderViewCenterCellStyle = {
  ...orderViewCellStyle,
  textAlign: "center",
};

const orderViewAddressCellStyle = {
  ...orderViewCellStyle,
  display: "grid",
  gap: "1px",
  lineHeight: "15px",
  maxHeight: "31px",
  overflow: "hidden",
};

const orderViewAddressLineStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const orderViewPriceCellStyle = {
  ...orderViewCellStyle,
  alignContent: "start",
  display: "grid",
  whiteSpace: "nowrap",
};

const orderViewPaymentPillBaseStyle = {
  borderRadius: "999px",
  display: "inline-block",
  fontSize: "10px",
  fontWeight: 700,
  lineHeight: "14px",
  padding: "1px 7px",
  width: "fit-content",
};

const orderViewPhoneLineStyle = {
  color: "#6b7280",
  fontSize: "10px",
  lineHeight: "14px",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
};

const orderViewCustomerCellStyle = {
  ...orderViewCellStyle,
  display: "grid",
  gap: "2px",
};

const orderViewDetailsStyle = {
  alignItems: "start",
  background: "#f8f8f8",
  borderBottom: 0,
  display: "grid",
  fontSize: "11px",
  gap: "10px",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  lineHeight: "17px",
  padding: "8px",
};

const orderViewPaymentOnlyDetailsStyle = {
  ...orderViewDetailsStyle,
  padding: "2px 8px 4px",
};

const orderViewNoteStyle = {
  display: "grid",
  gap: "3px",
  minWidth: 0,
};

const orderViewNoteFullWidthStyle = {
  ...orderViewNoteStyle,
  gridColumn: "1 / -1",
};

const orderViewNoteLabelStyle = {
  color: "#4b5563",
  fontWeight: 750,
};

const orderViewNoteTextStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
};

const orderViewItemsCellStyle = {
  display: "grid",
  gap: "2px",
  padding: "6px 0 8px",
};

const orderViewItemLineStyle = {
  fontSize: "11px",
  lineHeight: "17px",
  overflowWrap: "anywhere",
};

const historyCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "9px 10px",
};

const historyCardContentStyle = {
  boxSizing: "border-box",
  maxHeight: "300px",
  overflowY: "auto",
  paddingRight: "8px",
  scrollbarGutter: "stable",
};

const historyMetaStyle = {
  color: "#616161",
  fontSize: "12px",
  margin: "4px 0 0",
};

const historyOrderListStyle = {
  display: "grid",
  gap: "6px",
  marginTop: "8px",
};

const historyOrderStyle = {
  border: "1px solid #ebebeb",
  borderRadius: "8px",
  overflow: "hidden",
};

const historyOrderSummaryStyle = {
  alignItems: "center",
  cursor: "pointer",
  display: "grid",
  fontSize: "12px",
  gap: "6px",
  gridTemplateColumns: "70px minmax(0, 1fr) 54px",
  padding: "7px 8px",
};

const historyOrderCustomerStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const historyOrderItemCountStyle = {
  borderRadius: "999px",
  fontWeight: 750,
  justifySelf: "end",
  padding: "1px 7px",
};

const historyOrderAddStyle = {
  ...historyOrderItemCountStyle,
  background: "#e6f4ea",
  color: "#137333",
};

const historyOrderRemoveStyle = {
  ...historyOrderItemCountStyle,
  background: "#fce8e6",
  color: "#c5221f",
};

const historyItemListStyle = {
  background: "#fafafa",
  borderTop: "1px solid #ebebeb",
  display: "grid",
  fontSize: "12px",
  gap: "4px",
  margin: 0,
  padding: "7px 8px 7px 24px",
};

const tableWrapStyle = {
  display: "grid",
  gap: "8px",
  overflow: "visible",
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
  padding: "6px 4px",
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
  fontSize: "12px",
  lineHeight: "14px",
  padding: "5px 5px",
  whiteSpace: "nowrap",
};

const productHeadCellStyle = {
  ...headCellStyle,
  fontSize: "12px",
  lineHeight: "14px",
  overflowWrap: "anywhere",
  padding: "5px 6px",
  whiteSpace: "normal",
  wordBreak: "keep-all",
};

const productHeadLabelStyle = {
  display: "-webkit-box",
  maxHeight: "28px",
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
  gap: "1px",
  gridTemplateColumns: "22px 34px",
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
  width: "70px",
};

const totalColumnStyle = {
  width: "76px",
};

const PRODUCT_COLUMNS_PER_TABLE = 6;
const PRINT_PAGE_HEIGHT_MM = 297;
const PRINT_PAGE_MARGIN_MM = 10;
const PRINT_CONTENT_HEIGHT_MM = PRINT_PAGE_HEIGHT_MM - PRINT_PAGE_MARGIN_MM * 2;
const CSS_PX_PER_MM = 96 / 25.4;
const PRINT_ORDER_SECTION_GAP_MM = 4;
const PRINT_ORDER_LIST_GAP_PX = PRINT_ORDER_SECTION_GAP_MM * CSS_PX_PER_MM;
const PRINT_ORDER_HEADER_HEIGHT_PX = 16 + 3 * CSS_PX_PER_MM + 2;
const PRINT_ORDER_ROW_VERTICAL_PADDING_PX = 6 * CSS_PX_PER_MM;
const PRINT_ORDER_ROW_BASE_CONTENT_HEIGHT_PX = 53;
const PRINT_ORDER_ROW_BORDER_PX = 2;
const PRINT_ORDER_CUSTOMER_LINE_HEIGHT_PX = 17;
const PRINT_ORDER_CUSTOMER_GAP_PX = 1 * CSS_PX_PER_MM;
const PRINT_ORDER_CUSTOMER_TEXT_UNITS_PER_LINE = 14;
const PRINT_ORDER_ITEMS_PADDING_PX = 5 * CSS_PX_PER_MM;
const PRINT_ORDER_ITEM_LINE_HEIGHT_PX = 17;
const PRINT_ORDER_ITEM_GAP_PX = 1 * CSS_PX_PER_MM;
const PRINT_ORDER_DETAILS_PADDING_PX = 4 * CSS_PX_PER_MM;
const PRINT_ORDER_PAYMENT_ONLY_PADDING_PX = 1 * CSS_PX_PER_MM;
const PRINT_ORDER_DETAILS_PAYMENT_HEIGHT_PX = 18;
const PRINT_ORDER_NOTE_LABEL_HEIGHT_PX = 16;
const PRINT_ORDER_NOTE_GAP_PX = 1 * CSS_PX_PER_MM;
const PRINT_ORDER_NOTE_LINE_HEIGHT_PX = 17;
const PRINT_ORDER_BREAK_SAFETY_PX = 12;
const INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE = "Invalid Shopify session token";
const SESSION_TOKEN_REFRESH_PARAM = "_shopify_session_refreshed";

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
  .inventory-detail-page { box-sizing: border-box !important; display: block !important; margin: 0 !important; max-width: none !important; min-height: 0 !important; min-width: 0 !important; padding: 0 !important; width: 100% !important; }
  .inventory-detail-sheet { box-sizing: border-box !important; font-size: 13px !important; max-width: none !important; min-height: 0 !important; min-width: 0 !important; width: 100% !important; }
  .inventory-detail-history { display: none !important; }
  .inventory-detail-panel { border: 0 !important; border-radius: 0 !important; overflow: visible !important; }
  .inventory-detail-table-wrap { overflow: visible !important; }
  .inventory-detail-table { font-size: 13px !important; width: 100% !important; }
  .inventory-detail-table th, .inventory-detail-table td { line-height: 17px !important; padding: 5px 6px !important; }
  .inventory-detail-group-total-head { font-size: 13px !important; }
  .inventory-detail-total-col { width: 64px !important; }
  .inventory-detail-page h1 { font-size: 17px !important; line-height: 22px !important; }
  .inventory-detail-product-label { max-height: 34px !important; }
  .inventory-detail-row-header { position: static !important; }
  .inventory-detail-orders-list { display: block !important; width: 100% !important; }
  .inventory-detail-orders-head, .inventory-detail-order-row { column-gap: 1mm !important; display: grid !important; grid-template-columns: 17mm minmax(0, 1fr) 9mm 24mm 23mm 20mm 19mm !important; }
  .inventory-detail-orders-head { border-bottom: ${strongDividerStyle} !important; font-size: 12px !important; font-weight: 750 !important; line-height: 16px !important; margin-bottom: ${PRINT_ORDER_SECTION_GAP_MM}mm !important; padding: 0 0 3mm !important; }
  .inventory-detail-orders-head > span { white-space: nowrap !important; }
  .inventory-detail-orders-head > span:last-child { text-align: right !important; }
  .inventory-detail-order-card { -webkit-column-break-inside: avoid !important; border-top: ${strongDividerStyle} !important; break-inside: avoid !important; break-inside: avoid-page !important; display: block !important; gap: 0 !important; margin: 0 0 ${PRINT_ORDER_SECTION_GAP_MM}mm !important; padding: 0 !important; page-break-inside: avoid !important; }
  .inventory-detail-order-card:first-of-type { border-top: 0 !important; }
  .inventory-detail-order-row { border-bottom: ${subtleDividerStyle} !important; font-size: 12px !important; line-height: 17px !important; padding: 3mm 0 !important; }
  .inventory-detail-order-address { line-height: 17px !important; max-height: 53px !important; overflow: hidden !important; }
  .inventory-detail-order-address > span { display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
  .inventory-detail-order-price { display: grid !important; justify-items: end !important; text-align: right !important; white-space: nowrap !important; }
  .inventory-detail-order-payment { font-size: 12px !important; line-height: 16px !important; padding: 0 2mm !important; }
  .inventory-detail-order-customer { display: grid !important; gap: 1mm !important; line-height: 17px !important; overflow: visible !important; }
  .inventory-detail-order-details { align-items: start !important; background: transparent !important; border-bottom: 0 !important; break-inside: avoid !important; display: grid !important; font-size: 12px !important; gap: 3mm !important; grid-template-columns: max-content minmax(0, 1fr) !important; line-height: 17px !important; padding: 2mm 0 !important; page-break-inside: avoid !important; }
  .inventory-detail-order-details--payment-only { padding: 0 0 1mm !important; }
  .inventory-detail-order-note { display: grid !important; gap: 1mm !important; min-width: 0 !important; }
  .inventory-detail-order-note-text { overflow-wrap: anywhere !important; white-space: pre-wrap !important; }
  .inventory-detail-order-items { break-inside: avoid !important; display: grid !important; font-size: 12px !important; gap: 1mm !important; line-height: 17px !important; padding: 2mm 0 3mm !important; page-break-inside: avoid !important; }
  .inventory-detail-order-phone { font-size: 12px !important; line-height: 17px !important; overflow: visible !important; overflow-wrap: anywhere !important; white-space: normal !important; }
  .inventory-detail-order-items > div { break-inside: avoid !important; page-break-inside: avoid !important; }
  .inventory-detail-order-meta { break-inside: avoid !important; page-break-inside: avoid !important; }
  @page { size: A4 portrait; margin: 10mm; }
}
`;


function getPrintContentHeightPx() {
  return PRINT_CONTENT_HEIGHT_MM * CSS_PX_PER_MM;
}

function getPrintOrderHeightPx(card) {
  const itemLines = Math.max(1, card.querySelectorAll(".inventory-detail-order-items > div").length);
  const customer = card.querySelector(".inventory-detail-order-customer");
  const customerLines = Number.parseInt(customer?.dataset.printLineCount ?? "0", 10) || 0;
  const customerHeight = customerLines * PRINT_ORDER_CUSTOMER_LINE_HEIGHT_PX +
    Math.max(0, customerLines - 1) * PRINT_ORDER_CUSTOMER_GAP_PX;
  const rowHeight = PRINT_ORDER_ROW_VERTICAL_PADDING_PX +
    Math.max(PRINT_ORDER_ROW_BASE_CONTENT_HEIGHT_PX, customerHeight) +
    PRINT_ORDER_ROW_BORDER_PX;
  const details = card.querySelector(".inventory-detail-order-details");
  const note = card.querySelector(".inventory-detail-order-note");
  const noteLines = Number.parseInt(note?.dataset.printLineCount ?? "0", 10) || 0;
  const noteHeight = note
    ? PRINT_ORDER_NOTE_LABEL_HEIGHT_PX + PRINT_ORDER_NOTE_GAP_PX + noteLines * PRINT_ORDER_NOTE_LINE_HEIGHT_PX
    : 0;
  const detailsPadding = note ? PRINT_ORDER_DETAILS_PADDING_PX : PRINT_ORDER_PAYMENT_ONLY_PADDING_PX;
  const detailsHeight = details
    ? detailsPadding + Math.max(PRINT_ORDER_DETAILS_PAYMENT_HEIGHT_PX, noteHeight)
    : 0;
  return Math.ceil(
    rowHeight +
    PRINT_ORDER_ITEMS_PADDING_PX +
    itemLines * PRINT_ORDER_ITEM_LINE_HEIGHT_PX +
    Math.max(0, itemLines - 1) * PRINT_ORDER_ITEM_GAP_PX +
    detailsHeight +
    PRINT_ORDER_BREAK_SAFETY_PX,
  );
}

function clearInventoryOrderPrintBreaks(root) {
  const targetRoot = root ?? globalThis.document;
  targetRoot?.querySelectorAll(".inventory-detail-order-card").forEach((card) => {
    card.style.breakBefore = "";
    card.style.pageBreakBefore = "";
  });
}

function applyInventoryOrderPrintBreaks(root) {
  const targetRoot = root ?? globalThis.document;
  const page = targetRoot?.querySelector(".inventory-detail-view-orders");
  const list = page?.querySelector(".inventory-detail-orders-list");
  if (!page || !list || typeof globalThis.window === "undefined") return;

  const cards = Array.from(list.querySelectorAll(".inventory-detail-order-card"));
  if (cards.length === 0) return;

  clearInventoryOrderPrintBreaks(targetRoot);

  const pageHeight = getPrintContentHeightPx();
  const pageTop = page.getBoundingClientRect().top;
  const listTop = list.getBoundingClientRect().top;
  const header = list.querySelector(".inventory-detail-orders-head");
  const gap = PRINT_ORDER_LIST_GAP_PX;
  let usedHeight = (((listTop - pageTop) % pageHeight) + pageHeight) % pageHeight;
  if (header) {
    usedHeight = (usedHeight + PRINT_ORDER_HEADER_HEIGHT_PX + gap) % pageHeight;
  }

  cards.forEach((card, index) => {
    const height = getPrintOrderHeightPx(card);
    const requiredHeight = height + (index === 0 ? 0 : gap);
    const canFitOnOnePage = height < pageHeight;

    if (index > 0 && canFitOnOnePage && usedHeight + requiredHeight > pageHeight) {
      card.style.breakBefore = "page";
      card.style.pageBreakBefore = "always";
      usedHeight = height % pageHeight;
      return;
    }

    usedHeight = (usedHeight + requiredHeight) % pageHeight;
  });
}

export const loader = async ({ request }) => {
  const inventoryId = new URL(request.url).searchParams.get("id");
  const result = await fetchDeliveryInventoryOrderView(request, inventoryId);
  const errors = result.errors ?? [];
  logInventoryDetailPayload(inventoryId, result, buildInventoryDetailApiPath(inventoryId));
  return {
    errors,
    generatedAt: new Date().toISOString(),
    inventory: result.inventory,
    needsSessionTokenRefresh: hasSessionTokenRefreshError(errors),
  };
};

function hasSessionTokenRefreshError(errors) {
  return errors.some((error) =>
    error?.code === "DELIVERY_SESSION_TOKEN_MISSING" ||
    (
      error?.code === "UNAUTHORIZED" &&
      error?.message === INVALID_SHOPIFY_SESSION_TOKEN_MESSAGE
    ),
  );
}

function buildInventoryDetailApiPath(inventoryId) {
  return inventoryId ? `/admin/inventories/${encodeURIComponent(inventoryId)}/order-view` : null;
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


function buildInventoryOrderRouteMeta(inventory, matrix, orders) {
  const route = Array.isArray(inventory?.linkedRoutes) ? inventory.linkedRoutes[0] : null;
  return [
    { label: "Driver", value: textOrDisplay(route?.driver?.displayName ?? route?.driverName) },
    { label: "Route", value: textOrDisplay(route?.name ?? inventory?.routeName ?? inventory?.name) },
    { label: "Delivery date", value: matrix.rows.length === 1 ? matrix.rows[0].label : "-" },
    { label: "Start", value: textOrDisplay(route?.startTime ?? route?.scheduledStartAt) },
    { label: "Orders", value: String(orders.length) },
    { label: "Items", value: String(matrix.totalQuantity ?? 0) },
  ];
}

function buildInventoryOrderViewRows(orders) {
  return (Array.isArray(orders) ? orders : []).map((order, index) => {
    return {
      addressLines: getInventoryOrderAddressLines(order),
      customer: getInventoryOrderCustomer(order),
      customerNote: getInventoryOrderCustomerNote(order),
      driveTime: formatInventoryRouteTime(order?.driveTime ?? order?.driveTimeMinutes ?? order?.routeStop?.driveTime),
      eta: textOrDisplay(order?.eta ?? order?.routeStop?.eta),
      items: getInventoryOrderLineItems(order).map(formatInventoryOrderLineItem),
      orderId: getInventoryOrderName(order, index),
      payment: formatInventoryOrderPayment(order),
      phone: getInventoryOrderPhone(order),
      price: formatInventoryOrderPrice(order),
      stopTime: formatInventoryRouteTime(order?.stopTime ?? order?.stopTimeMinutes ?? order?.routeStop?.stopTime),
    };
  });
}

function getInventoryOrderLineItems(order) {
  if (Array.isArray(order?.items)) return order.items;
  const lineItems = order?.lineItems ?? order?.shopifyOrderSnapshot?.lineItems ?? order?.rawPayload?.lineItems;
  if (Array.isArray(lineItems)) return lineItems;
  if (Array.isArray(lineItems?.nodes)) return lineItems.nodes;
  if (Array.isArray(lineItems?.edges)) return lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  return [];
}

function formatInventoryOrderLineItem(item) {
  const name = textOrDisplay(item?.name ?? item?.title ?? item?.productTitle, "Item");
  const options = formatInventoryOrderOptions(item?.options) || textOrUndefined(item?.variantTitle);
  const quantity = Math.abs(Number(item?.quantityDelta ?? item?.quantity ?? item?.currentQuantity) || 1);
  return `${quantity} EA ${options ? `${name} (${options})` : name}`;
}

function formatInventoryOrderOptions(options) {
  if (!Array.isArray(options)) return "";
  return options
    .map((option) => {
      const key = textOrUndefined(option?.key);
      const value = textOrUndefined(option?.value);
      return key && value ? `${key}: ${value}` : value;
    })
    .filter(Boolean)
    .join(", ");
}

function getInventoryOrderName(order, index) {
  const id = textOrUndefined(order?.id);
  return textOrUndefined(order?.orderName)
    ?? textOrUndefined(order?.name)
    ?? textOrUndefined(order?.shopifyOrderName)
    ?? textOrUndefined(order?.orderNumber)
    ?? textOrUndefined(order?.shopifyOrderNumber)
    ?? (id ? id.split("/").pop() : null)
    ?? `Order ${index + 1}`;
}

function getInventoryOrderCustomer(order) {
  return textOrDisplay(
    order?.recipientName
      ?? order?.customer
      ?? order?.customerName
      ?? order?.shippingAddress?.name
      ?? order?.deliveryAddress?.name
      ?? order?.shopifyOrderSnapshot?.shippingAddress?.name
      ?? order?.rawPayload?.recipientName
      ?? order?.rawPayload?.shippingAddress?.name,
    "Unknown customer",
  );
}

function getInventoryOrderCustomerNote(order) {
  return textOrUndefined(
    order?.customerNote
      ?? order?.instructions
      ?? order?.note
      ?? order?.rawPayload?.customer_note
      ?? order?.rawPayload?.customerNote
      ?? order?.rawPayload?.note
      ?? order?.rawPayload?.customer?.note,
  );
}

function getInventoryOrderAddress(order) {
  return textOrDisplay(
    order?.address
      ?? formatInventoryAddress(order?.shippingAddress)
      ?? formatInventoryAddress(order?.deliveryAddress)
      ?? formatInventoryAddress(order?.shopifyOrderSnapshot?.shippingAddress)
      ?? formatInventoryAddress(order?.rawPayload?.shippingAddress),
  );
}

function getInventoryOrderAddressLines(order) {
  const address = getInventoryOrderAddress(order);
  if (address === "-") return [address];
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 4) return [address];
  const cityIndex = parts.length >= 5 ? parts.length - 4 : parts.length - 3;
  return [
    parts.slice(0, cityIndex).join(", "),
    [parts[cityIndex], parts[cityIndex + 1]].filter(Boolean).join(", "),
    parts.slice(cityIndex + 2).join(", "),
  ].filter(Boolean);
}

function formatInventoryAddress(address) {
  if (typeof address === "string") return textOrUndefined(address);
  if (!address || typeof address !== "object") return undefined;
  return [address.address1, address.address2, address.city, address.province ?? address.provinceCode, address.zip, address.countryCodeV2 ?? address.country]
    .map(textOrUndefined)
    .filter(Boolean)
    .join(", ") || undefined;
}

function getInventoryOrderPhone(order) {
  return textOrUndefined(
    order?.phone
      ?? order?.shippingPhone
      ?? order?.shippingAddress?.phone
      ?? order?.deliveryAddress?.phone
      ?? order?.shopifyOrderSnapshot?.shippingAddress?.phone
      ?? order?.shopifyOrderSnapshot?.phone
      ?? order?.rawPayload?.shippingAddress?.phone
      ?? order?.rawPayload?.phone,
  );
}

function formatInventoryOrderPrice(order) {
  const amount = Number(
    order?.totalPriceAmount
      ?? order?.currentTotalPriceSet?.shopMoney?.amount
      ?? order?.rawPayload?.currentTotalPriceSet?.shopMoney?.amount
      ?? order?.shopifyOrderSnapshot?.currentTotalPriceSet?.shopMoney?.amount,
  );
  if (!Number.isFinite(amount)) return "-";
  const currency = textOrUndefined(
    order?.currencyCode
      ?? order?.currentTotalPriceSet?.shopMoney?.currencyCode
      ?? order?.rawPayload?.currentTotalPriceSet?.shopMoney?.currencyCode
      ?? order?.shopifyOrderSnapshot?.currentTotalPriceSet?.shopMoney?.currencyCode,
  );
  return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
}

function getOrderViewPaymentPillStyle(payment) {
  if (payment === "Paid") return { ...orderViewPaymentPillBaseStyle, background: "#d9f3e6", color: "#087443" };
  if (payment === "Pending") return { ...orderViewPaymentPillBaseStyle, background: "#fff1d6", color: "#8a6116" };
  return { ...orderViewPaymentPillBaseStyle, background: "#f1f2f4", color: "#4b5563" };
}

function formatInventoryOrderPayment(order) {
  const status = textOrUndefined(
    order?.paymentStatus
      ?? order?.financialStatus
      ?? order?.rawPayload?.displayFinancialStatus
      ?? order?.shopifyOrderSnapshot?.displayFinancialStatus,
  );
  if (!status) return "-";
  const normalized = status.replace(/\s+/g, "_").toUpperCase();
  if (normalized === "PAID") return "Paid";
  if (normalized === "PENDING") return "Pending";
  return status;
}

function formatInventoryRouteTime(value) {
  const text = textOrUndefined(value);
  if (!text) return "-";
  const number = Number(text);
  return Number.isFinite(number) ? `${number} min` : text;
}

function textOrDisplay(value, fallback = "-") {
  return textOrUndefined(value) ?? fallback;
}

function textOrUndefined(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
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
  const { errors, generatedAt, inventory, needsSessionTokenRefresh } = useLoaderData();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionTokenRefreshSubmittedRef = useRef(false);
  const [inventoryDetailView, setInventoryDetailView] = useState("products");
  const notice = getServiceErrorNotice([{ errors }], { context: "inventory_detail" });
  const orders = Array.isArray(inventory?.orders) ? inventory.orders : [];
  const matrix = buildInventoryProductMatrix(orders);
  const hasMatrix = matrix.rows.length > 0 && matrix.products.length > 0;
  const productChunks = hasMatrix ? getProductChunks(matrix.products) : [];
  const historyItems = buildInventoryHistoryItems(inventory);
  const orderRouteMeta = buildInventoryOrderRouteMeta(inventory, matrix, orders);
  const orderViewRows = buildInventoryOrderViewRows(orders);

  useEffect(() => {
    if (!needsSessionTokenRefresh || searchParams.get(SESSION_TOKEN_REFRESH_PARAM)) return;
    if (sessionTokenRefreshSubmittedRef.current) return;

    let cancelled = false;
    sessionTokenRefreshSubmittedRef.current = true;

    shopify
      .idToken()
      .then((sessionToken) => {
        if (cancelled || !sessionToken) return;

        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.set("id_token", sessionToken);
        nextSearchParams.set(SESSION_TOKEN_REFRESH_PARAM, "1");
        setSearchParams(nextSearchParams, {
          preventScrollReset: true,
          replace: true,
        });
      })
      .catch(() => {
        sessionTokenRefreshSubmittedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [needsSessionTokenRefresh, searchParams, setSearchParams, shopify]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (inventoryDetailView !== "orders") {
      clearInventoryOrderPrintBreaks();
      return undefined;
    }

    const handleBeforePrint = () => applyInventoryOrderPrintBreaks();
    const handleAfterPrint = () => clearInventoryOrderPrintBreaks();

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
      clearInventoryOrderPrintBreaks();
    };
  }, [inventoryDetailView, orderViewRows.length]);

  return (
    <main className={`inventory-detail-page inventory-detail-view-${inventoryDetailView}`} style={pageStyle}>
      <style>{printCss}</style>
      <div className="inventory-detail-sheet" style={sheetStyle}>
        <section className="inventory-detail-panel" style={panelStyle}>
          {notice ? <div role="alert" style={noticeStyle}>{notice}</div> : null}
          <div style={sectionStyle}>
            <div style={headerTopBarStyle}>
              <Link className="inventory-detail-no-print" style={backLinkStyle} to="/app/orders?view=inventory">
                ← Back to Inventory
              </Link>
              <div style={headerActionStyle}>
                <div className="inventory-detail-no-print" role="group" aria-label="Inventory detail view" style={viewToggleStyle}>
                  <button
                    aria-pressed={inventoryDetailView === "products"}
                    disabled={inventoryDetailView === "products"}
                    onClick={() => setInventoryDetailView("products")}
                    style={inventoryDetailView === "products" ? activeViewToggleButtonStyle : viewToggleButtonStyle}
                    type="button"
                  >Products</button>
                  <button
                    aria-pressed={inventoryDetailView === "orders"}
                    disabled={inventoryDetailView === "orders"}
                    onClick={() => setInventoryDetailView("orders")}
                    style={inventoryDetailView === "orders" ? activeViewToggleButtonStyle : viewToggleButtonStyle}
                    type="button"
                  >Orders</button>
                </div>
                <span style={outputTimeStyle}>Output: {formatOutputTime(generatedAt)}</span>
                <button
                  className="inventory-detail-no-print"
                  type="button"
                  onClick={() => {
                    applyInventoryOrderPrintBreaks();
                    window.print();
                  }}
                >Print</button>
              </div>
            </div>
          </div>
        </section>

        <section className="inventory-detail-panel" style={panelStyle}>
          <div style={tableSectionStyle}>
            <div style={sectionTitleRowStyle}>
              <h1 style={titleStyle}>{inventory?.name ?? "Inventory"}</h1>
              {hasMatrix ? <span style={summaryStyle}>Overall total: {matrix.totalQuantity}</span> : null}
            </div>
            {inventoryDetailView === "orders" ? (
              <div style={orderViewStyle}>
                <div className="inventory-detail-order-meta" style={orderViewMetaStyle}>
                  {orderRouteMeta.map((meta, index) => (
                    <div key={meta.label} style={index === orderRouteMeta.length - 1 ? { ...orderViewMetaCellStyle, borderRight: 0 } : orderViewMetaCellStyle}>
                      <span style={orderViewMetaLabelStyle}>{meta.label}</span>
                      <span style={orderViewMetaValueStyle}>{meta.value}</span>
                    </div>
                  ))}
                </div>
                {orderViewRows.length === 0 ? (
                  <p style={historyMetaStyle}>No orders</p>
                ) : (
                  <div aria-label="Inventory orders" className="inventory-detail-orders-list" style={orderViewOrdersListStyle}>
                    <div className="inventory-detail-orders-head" style={orderViewHeaderRowStyle}>
                      <span style={orderViewHeaderCellStyle}>{"Order\u00a0id"}</span>
                      <span style={orderViewHeaderCellStyle}>Address</span>
                      <span style={orderViewHeaderCellStyle}>ETA</span>
                      <span style={orderViewHeaderCellStyle}>{"Drive\u00a0time"}</span>
                      <span style={orderViewHeaderCellStyle}>{"Stop\u00a0time"}</span>
                      <span style={orderViewHeaderCellStyle}>Customer</span>
                      <span style={orderViewHeaderCellStyle}>Price</span>
                    </div>
                    {orderViewRows.map((order, orderIndex) => (
                      <article
                        className="inventory-detail-order-card"
                        key={order.orderId}
                        style={orderIndex === 0 ? firstOrderViewOrderCardStyle : orderViewOrderCardStyle}
                      >
                        <div className="inventory-detail-order-row" style={orderViewOrderRowStyle}>
                          <div style={orderViewCellStyle}><strong>{order.orderId}</strong></div>
                          <div className="inventory-detail-order-address" style={orderViewAddressCellStyle}>
                            {order.addressLines.map((line, lineIndex) => <span key={lineIndex} style={orderViewAddressLineStyle}>{line}</span>)}
                          </div>
                          <div style={orderViewCenterCellStyle}>{order.eta}</div>
                          <div style={orderViewCenterCellStyle}>{order.driveTime}</div>
                          <div style={orderViewCenterCellStyle}>{order.stopTime}</div>
                          <div
                            className="inventory-detail-order-customer"
                            data-print-line-count={getInventoryPrintTextLineCount(
                              [order.customer, order.phone].filter(Boolean).join("\n"),
                              PRINT_ORDER_CUSTOMER_TEXT_UNITS_PER_LINE,
                            )}
                            style={orderViewCustomerCellStyle}
                          >
                            <span>{order.customer}</span>
                            {order.phone ? <span className="inventory-detail-order-phone" style={orderViewPhoneLineStyle}>{order.phone}</span> : null}
                          </div>
                          <div className="inventory-detail-order-price" style={orderViewPriceCellStyle}>
                            <span>{order.price}</span>
                          </div>
                        </div>
                        <div className="inventory-detail-order-items" style={orderViewItemsCellStyle}>
                          {(order.items.length > 0 ? order.items : ["No items"]).map((item, itemIndex) => (
                            <div key={`${order.orderId}-${itemIndex}`} style={orderViewItemLineStyle}>{item}</div>
                          ))}
                        </div>
                        {order.payment !== "-" || order.customerNote ? (
                          <div
                            className={`inventory-detail-order-details${order.customerNote ? "" : " inventory-detail-order-details--payment-only"}`}
                            style={order.customerNote ? orderViewDetailsStyle : orderViewPaymentOnlyDetailsStyle}
                          >
                            {order.payment !== "-" ? <span className="inventory-detail-order-payment" style={getOrderViewPaymentPillStyle(order.payment)}>{order.payment}</span> : null}
                            {order.customerNote ? (
                              <div
                                className="inventory-detail-order-note"
                                data-print-line-count={getInventoryPrintTextLineCount(order.customerNote)}
                                style={order.payment !== "-" ? orderViewNoteStyle : orderViewNoteFullWidthStyle}
                              >
                                <span style={orderViewNoteLabelStyle}>Customer Note</span>
                                <span className="inventory-detail-order-note-text" style={orderViewNoteTextStyle}>{order.customerNote}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="inventory-detail-table-wrap" style={inventoryDetailView === "orders" ? hiddenStyle : tableWrapStyle}>
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
                      <col className="inventory-detail-total-col" style={totalColumnStyle} />
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
                        <th className="inventory-detail-group-total-head" style={groupTotalHeadCellStyle}>Group total</th>
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
      </div>

      <aside className="inventory-detail-history inventory-detail-no-print" style={historyPanelStyle}>
        <div style={sectionStyle}>
          <div>
            <h2 style={titleStyle}>History</h2>
            <p style={historyMetaStyle}>Orders in this inventory</p>
          </div>
          {historyItems.length === 0 ? (
            <p style={historyMetaStyle}>No order history</p>
          ) : historyItems.map((item, index) => (
            <details key={item.title} open={index === 0} style={historyCardStyle}>
              <summary>
                <strong>{item.title}</strong>
                <p style={historyMetaStyle}>{item.meta}</p>
              </summary>
              <div style={historyCardContentStyle}>
                <div style={historyOrderListStyle}>
                  {item.orders.map((order) => (
                    <details key={order.order} style={historyOrderStyle}>
                      <summary style={historyOrderSummaryStyle}>
                        <strong>{order.order}</strong>
                        <span style={historyOrderCustomerStyle}>{order.customer}</span>
                        <span style={order.itemDelta < 0 ? historyOrderRemoveStyle : historyOrderAddStyle}>
                          {order.itemDelta > 0 ? `+${order.itemDelta}` : order.itemDelta}
                        </span>
                      </summary>
                      <ul style={historyItemListStyle}>
                        {order.items.map((historyItem, itemIndex) => <li key={`${historyItem}-${itemIndex}`}>{historyItem}</li>)}
                      </ul>
                    </details>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </aside>
    </main>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
