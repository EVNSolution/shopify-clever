import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { resolveOrdersResourceFeatureFlags } from "../app/features/orders/orders-resource-flags.js";
import { ORDERS_FLAG_MATRIX } from "./orders-performance-gate.mjs";

function envFor(flags) {
  return {
    CLEVER_ORDERS_AUTO_SYNC_ON_LOAD: "0",
    CLEVER_ORDERS_CANONICAL_FIRST: "1",
    CLEVER_ORDERS_MAP_PROJECTION: flags.compactMap ? "1" : "0",
    CLEVER_ORDERS_SERVER_PAGINATION: flags.pagination ? "1" : "0",
    CLEVER_ORDERS_SELECTION_SNAPSHOTS: flags.selectionSnapshots ? "1" : "0",
  };
}

const cases = ORDERS_FLAG_MATRIX.map((flags) => ({
  ...flags,
  observed: resolveOrdersResourceFeatureFlags(envFor(flags)),
}));
const rollbackFlags = {
  compactMap: false,
  pagination: false,
  selectionSnapshots: false,
};
const artifact = {
  cases,
  capturedAt: new Date().toISOString(),
  rollback: {
    canonicalSource: "canonical_unpaged",
    observed: resolveOrdersResourceFeatureFlags(envFor(rollbackFlags)),
  },
};
const outputPath = resolve(
  process.argv[2] ?? ".omx/perf/orders-flag-matrix.json",
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Orders flag matrix captured: ${outputPath}`);
