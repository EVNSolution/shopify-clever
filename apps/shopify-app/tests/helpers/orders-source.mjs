import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ordersPageSourceFiles = [
  "app/routes/app.orders.jsx",
  "app/features/orders/orders-page.shared.js",
  "app/features/orders/orders-page.server.js",
  "app/features/orders/orders-page.jsx",
];

export function readOrdersPageSource(root = process.cwd()) {
  return ordersPageSourceFiles
    .map((relativePath) => {
      const path = join(root, relativePath);
      return existsSync(path) ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}
