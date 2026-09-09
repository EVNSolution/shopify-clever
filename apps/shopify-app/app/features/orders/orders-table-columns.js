export const ORDER_TABLE_COLUMN_WIDTHS = {
  select: "2.5%",
  name: "64px",
  notes: "44px",
  orderedDate: "8%",
  customer: "9%",
  address: "calc(52.5% - 88px)",
  itemCount: "5%",
  totalPriceAmount: "7%",
  deliveryLabel: "9%",
  planningStatus: "8%",
};
export const MIN_TABLE_COLUMN_WIDTH = 44;
const TABLE_CELL_HORIZONTAL_PADDING_PX = 16;

export const SORTABLE_ORDER_COLUMNS = [
  { key: "name", label: "ID", translationKey: "orders.table.id" },
  { key: "orderedDate", label: "Ordered", translationKey: "orders.table.ordered" },
  { key: "customer", label: "Recipient", translationKey: "orders.table.recipient" },
  { key: "address", label: "Address", translationKey: "orders.table.address" },
  { key: "itemCount", label: "Items", translationKey: "orders.table.items" },
  { key: "totalPriceAmount", label: "Amount", translationKey: "orders.table.amount" },
  { key: "deliveryLabel", label: "Delivery", translationKey: "orders.table.delivery" },
  { key: "planningStatus", label: "State", translationKey: "orders.table.state" },
];

export const DEFAULT_TABLE_COLUMN_WIDTHS = [
  ORDER_TABLE_COLUMN_WIDTHS.select,
  ...SORTABLE_ORDER_COLUMNS.flatMap((column) => [
    ORDER_TABLE_COLUMN_WIDTHS[column.key],
    ...(column.key === "name" ? [ORDER_TABLE_COLUMN_WIDTHS.notes] : []),
  ]),
];

export function getTableColumnPixelState(tableElement) {
  const widths = Array.from(
    tableElement.querySelectorAll("thead th"),
    (headerCell) => Math.round(headerCell.getBoundingClientRect().width),
  );
  const tableWidth = Math.round(tableElement.getBoundingClientRect().width);
  const roundingDiff = tableWidth - widths.reduce((total, width) => total + width, 0);

  if (widths.length > 0 && roundingDiff !== 0) {
    widths[widths.length - 1] += roundingDiff;
  }

  return { tableWidth, widths };
}

export function getTableColumnFitWidth(tableElement, columnIndex) {
  const cells = tableElement.querySelectorAll(
    `thead th:nth-child(${columnIndex + 1}), tbody td:nth-child(${columnIndex + 1})`,
  );

  return Math.max(
    MIN_TABLE_COLUMN_WIDTH,
    ...Array.from(cells, (cell) => {
      const clone = cell.cloneNode(true);

      Object.assign(clone.style, {
        display: "inline-block",
        height: "auto",
        left: "-10000px",
        maxWidth: "none",
        minWidth: "0",
        overflow: "visible",
        pointerEvents: "none",
        position: "fixed",
        textOverflow: "clip",
        top: "-10000px",
        visibility: "hidden",
        whiteSpace: "nowrap",
        width: "max-content",
        zIndex: "-1",
      });

      clone.querySelectorAll("*").forEach((element) => {
        Object.assign(element.style, {
          maxWidth: "none",
          overflow: "visible",
          textOverflow: "clip",
          width: "auto",
        });
      });

      document.body.append(clone);
      const width = Math.ceil(clone.getBoundingClientRect().width);
      clone.remove();

      return width + 2;
    }),
  );
}

export function getTableColumnPillMinWidth(tableElement, columnIndex) {
  const pills = tableElement.querySelectorAll(`tbody td:nth-child(${columnIndex + 1}) .info-pill`);
  if (pills.length === 0) return null;

  return Math.max(
    MIN_TABLE_COLUMN_WIDTH,
    ...Array.from(pills, (pill) => Math.ceil(pill.scrollWidth) + TABLE_CELL_HORIZONTAL_PADDING_PX),
  );
}

export function getTableColumnMinWidth(tableElement, columnIndex) {
  return getTableColumnPillMinWidth(tableElement, columnIndex) ?? MIN_TABLE_COLUMN_WIDTH;
}

export function getTableColumnPillMinWidths(tableElement, columnCount) {
  return Array.from({ length: columnCount }, (_, columnIndex) =>
    getTableColumnPillMinWidth(tableElement, columnIndex),
  );
}
