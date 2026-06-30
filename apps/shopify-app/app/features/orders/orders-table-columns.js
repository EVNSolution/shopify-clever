export const ORDER_TABLE_COLUMN_WIDTHS = {
  select: "3%",
  name: "7.4%",
  orderedDate: "8.4%",
  customer: "10.4%",
  address: "24.4%",
  itemCount: "6.4%",
  deliveryArea: "8.4%",
  deliveryLabel: "9.4%",
  planningStatus: "7.4%",
  payment: "8.4%",
  hasCoordinates: "6.4%",
};
export const MIN_TABLE_COLUMN_WIDTH = 44;
const TABLE_CELL_HORIZONTAL_PADDING_PX = 16;

export const SORTABLE_ORDER_COLUMNS = [
  { key: "name", label: "Order" },
  { key: "orderedDate", label: "Ordered" },
  { key: "customer", label: "Recipient" },
  { key: "address", label: "Address" },
  { key: "itemCount", label: "Items" },
  { key: "deliveryArea", label: "Area" },
  { key: "deliveryLabel", label: "Delivery" },
  { key: "planningStatus", label: "State" },
  { key: "payment", label: "Payment" },
  { key: "hasCoordinates", label: "Coordinates" },
];

export const DEFAULT_TABLE_COLUMN_WIDTHS = [
  ORDER_TABLE_COLUMN_WIDTHS.select,
  ...SORTABLE_ORDER_COLUMNS.map((column) => ORDER_TABLE_COLUMN_WIDTHS[column.key]),
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
