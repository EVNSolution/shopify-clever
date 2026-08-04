function enabled(value) {
  return /^(1|true|yes|on)$/iu.test(value ?? "");
}

export function resolveOrdersResourceFeatureFlags(env) {
  const canonicalFirst = enabled(env.CLEVER_ORDERS_CANONICAL_FIRST);
  const autoSyncOrdersOnLoad = enabled(env.CLEVER_ORDERS_AUTO_SYNC_ON_LOAD);
  const pagination = canonicalFirst &&
    !autoSyncOrdersOnLoad &&
    enabled(env.CLEVER_ORDERS_SERVER_PAGINATION);

  return {
    autoSyncOrdersOnLoad,
    canonicalFirst,
    compactMap: pagination && enabled(env.CLEVER_ORDERS_MAP_PROJECTION),
    mountSync: autoSyncOrdersOnLoad,
    pagination,
    selectionSnapshots: pagination && enabled(env.CLEVER_ORDERS_SELECTION_SNAPSHOTS),
    shopifyFullScan: !canonicalFirst,
  };
}
