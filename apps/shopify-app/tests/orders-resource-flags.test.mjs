import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrdersResourceFeatureFlags } from "../app/features/orders/orders-resource-flags.js";

test("Orders resource flags fail closed without canonical-first", () => {
  assert.deepEqual(
    resolveOrdersResourceFeatureFlags({
      CLEVER_ORDERS_MAP_PROJECTION: "1",
      CLEVER_ORDERS_SERVER_PAGINATION: "1",
      CLEVER_ORDERS_SELECTION_SNAPSHOTS: "1",
    }),
    {
      autoSyncOrdersOnLoad: false,
      canonicalFirst: false,
      compactMap: false,
      mountSync: false,
      pagination: false,
      selectionSnapshots: false,
      shopifyFullScan: true,
    },
  );
});

test("Orders resource flags disable pagination dependants during rollback", () => {
  assert.deepEqual(
    resolveOrdersResourceFeatureFlags({
      CLEVER_ORDERS_AUTO_SYNC_ON_LOAD: "0",
      CLEVER_ORDERS_CANONICAL_FIRST: "1",
      CLEVER_ORDERS_MAP_PROJECTION: "1",
      CLEVER_ORDERS_SERVER_PAGINATION: "0",
      CLEVER_ORDERS_SELECTION_SNAPSHOTS: "1",
    }),
    {
      autoSyncOrdersOnLoad: false,
      canonicalFirst: true,
      compactMap: false,
      mountSync: false,
      pagination: false,
      selectionSnapshots: false,
      shopifyFullScan: false,
    },
  );
});
