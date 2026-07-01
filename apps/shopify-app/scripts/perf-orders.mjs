import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const perfLogPath = join(root, ".omx/perf/orders-navigation.jsonl");
const artifactPath = join(root, ".omx/perf/orders-navigation-summary.json");
const waitTimeoutMs = Number.parseInt(process.env.PERF_TIMEOUT_MS ?? "18000", 10);
const settleMs = Number.parseInt(process.env.PERF_SETTLE_MS ?? "800", 10);

const requiredMetricNames = [
  "shopify.admin.iframe",
  "app.document.navigation",
  "orders.loader",
  "orders.render.commit",
  "orders.maplibre.init",
  "orders.maplibre.remove",
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runAppleScript(script) {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getSafariUrl() {
  return runAppleScript(`
tell application "Safari"
  repeat with safariWindow in windows
    repeat with safariTab in tabs of safariWindow
      set tabUrl to URL of safariTab as text
      if tabUrl contains "admin.shopify.com" and tabUrl contains "/apps/" and tabUrl contains "/app/" then
        set current tab of safariWindow to safariTab
        set index of safariWindow to 1
        return tabUrl
      end if
    end repeat
  end repeat
  return URL of current tab of front window
end tell
`);
}

function setSafariUrl(url) {
  const escapedUrl = url.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  runAppleScript(`
tell application "Safari"
  repeat with safariWindow in windows
    repeat with safariTab in tabs of safariWindow
      set tabUrl to URL of safariTab as text
      if tabUrl contains "admin.shopify.com" and tabUrl contains "/apps/" and tabUrl contains "/app/" then
        set current tab of safariWindow to safariTab
        set index of safariWindow to 1
        set URL of safariTab to "${escapedUrl}"
        return
      end if
    end repeat
  end repeat
  set URL of current tab of front window to "${escapedUrl}"
end tell
`);
}

function buildAppUrl(currentUrl, appPath) {
  const url = new URL(currentUrl);
  const appPathIndex = url.pathname.lastIndexOf("/app");

  if (appPathIndex === -1) {
    throw new Error(`Current Safari URL is not inside the embedded app: ${currentUrl}`);
  }

  url.pathname = `${url.pathname.slice(0, appPathIndex)}${appPath}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function resetPerfLog() {
  if (existsSync(perfLogPath)) {
    rmSync(perfLogPath);
  }

  if (existsSync(artifactPath)) {
    rmSync(artifactPath);
  }
}

function sanitizeUrlValue(value) {
  if (typeof value !== "string" || value.length === 0) return value;

  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeEvent(event) {
  return {
    ...event,
    url: sanitizeUrlValue(event.url),
    referrer: sanitizeUrlValue(event.referrer),
  };
}

function readPerfEvents() {
  if (!existsSync(perfLogPath)) return [];

  return readFileSync(perfLogPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => sanitizeEvent(JSON.parse(line)));
}

function getMetricCount(name) {
  return readPerfEvents().filter((event) => event.name === name).length;
}

async function waitForMetricCount(name, expectedCount) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < waitTimeoutMs) {
    if (getMetricCount(name) >= expectedCount) return;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${name} count ${expectedCount}`);
}

function latestMetric(events, name) {
  return events.filter((event) => event.name === name).at(-1) ?? null;
}

function metricsByName(events, name) {
  return events.filter((event) => event.name === name);
}

function summarizeOrdersLoader(metric) {
  return metric
    ? {
        activeOrdersView: metric.activeOrdersView,
        totalMs: metric.totalMs,
        shopifyOrdersCacheStatus: metric.shopifyOrdersCacheStatus,
        shopifyOrdersMs: metric.shopifyOrdersMs,
        departureLocationMs: metric.departureLocationMs,
        serverOrdersMs: metric.serverOrdersMs,
        inventoriesMs: metric.inventoriesMs,
        shopTimeZoneMs: metric.shopTimeZoneMs,
      }
    : null;
}

function summarizeOrdersRenderCommit(metric) {
  return metric
    ? {
        totalMs: metric.durationMs,
        activeOrdersView: metric.activeOrdersView,
        orderCount: metric.orderCount,
        inventoryCount: metric.inventoryCount,
      }
    : null;
}

function summarizeMapLibreInit(mapInit, mapLoad) {
  return mapInit
    ? {
        totalMs: mapInit.durationMs,
        mapLibreImportMs: mapInit.mapLibreImportMs,
        mapConstructMs: mapInit.mapConstructMs,
        mapLoadWaitMs: mapLoad?.mapLoadWaitMs ?? null,
        mapStyleLoaded: Boolean(mapLoad),
      }
    : null;
}

function summarizeOrdersSourceUpdate(metric) {
  return metric
    ? {
        totalMs: metric.durationMs,
        sourceUpdateMs: metric.sourceUpdateMs,
        orderCount: metric.orderCount,
        plannedOrderCount: metric.plannedOrderCount,
        sourceCreated: metric.sourceCreated,
        sourceSynced: metric.sourceSynced,
      }
    : null;
}

function summarizeOrdersSourceRetry(metrics) {
  return {
    count: metrics.length,
    latest: metrics.at(-1)
      ? {
          trigger: metrics.at(-1).trigger,
          retryAttemptCount: metrics.at(-1).retryAttemptCount,
          mapLoaded: metrics.at(-1).mapLoaded,
          styleLoaded: metrics.at(-1).styleLoaded,
        }
      : null,
  };
}

function summarizeEvents(events) {
  const shopifyIframe = latestMetric(events, "shopify.admin.iframe");
  const documentNavigation = latestMetric(events, "app.document.navigation");
  const ordersLoaders = metricsByName(events, "orders.loader");
  const ordersRenderCommit = latestMetric(events, "orders.render.commit");
  const mapInits = metricsByName(events, "orders.maplibre.init");
  const mapLoads = metricsByName(events, "orders.maplibre.load");
  const mapRemove = latestMetric(events, "orders.maplibre.remove");
  const ordersSourceUpdate = latestMetric(events, "orders.maplibre.source_update");
  const ordersSourceRetries = metricsByName(events, "orders.maplibre.source_retry");
  const ordersLoader = ordersLoaders.at(-1) ?? null;
  const mapInit = mapInits.at(-1) ?? null;
  const mapLoad = mapLoads.at(-1) ?? null;

  return {
    capturedAt: new Date().toISOString(),
    eventCount: events.length,
    shopifyAdminIframeMs: shopifyIframe?.durationMs ?? null,
    devTunnelDocument: documentNavigation
      ? {
          host: documentNavigation.host,
          ttfbMs: documentNavigation.ttfbMs,
          responseEndMs: documentNavigation.responseEndMs,
          domContentLoadedMs: documentNavigation.domContentLoadedMs,
          loadEventEndMs: documentNavigation.loadEventEndMs,
        }
      : null,
    ordersLoader: summarizeOrdersLoader(ordersLoader),
    ordersLoaderCold: summarizeOrdersLoader(ordersLoaders[0]),
    ordersLoaderWarm: summarizeOrdersLoader(ordersLoaders[1]),
    ordersRenderCommit: summarizeOrdersRenderCommit(ordersRenderCommit),
    mapLibreInit: summarizeMapLibreInit(mapInit, mapLoad),
    mapLibreCold: summarizeMapLibreInit(mapInits[0], mapLoads[0]),
    mapLibreWarm: summarizeMapLibreInit(mapInits[1], mapLoads[1]),
    mapLibreRemove: mapRemove
      ? {
          totalMs: mapRemove.durationMs,
          markerCount: mapRemove.markerCount,
          markersRemoveMs: mapRemove.markersRemoveMs,
          mapRemoveMs: mapRemove.mapRemoveMs,
        }
      : null,
    ordersSourceUpdate: summarizeOrdersSourceUpdate(ordersSourceUpdate),
    ordersSourceRetry: summarizeOrdersSourceRetry(ordersSourceRetries),
  };
}

function assertRequiredMetrics(events) {
  const missingMetricNames = requiredMetricNames.filter(
    (metricName) => !events.some((event) => event.name === metricName),
  );

  if (missingMetricNames.length > 0) {
    throw new Error(`Missing required performance metrics: ${missingMetricNames.join(", ")}`);
  }
}

async function main() {
  const currentSafariUrl = process.env.PERF_TARGET_URL ?? getSafariUrl();
  const ordersUrl = buildAppUrl(currentSafariUrl, "/app/orders");
  const routesUrl = buildAppUrl(currentSafariUrl, "/app/routes");

  setSafariUrl(routesUrl);
  await sleep(settleMs);
  resetPerfLog();

  setSafariUrl(ordersUrl);
  await waitForMetricCount("shopify.admin.iframe", 1);
  await waitForMetricCount("app.document.navigation", 1);
  await waitForMetricCount("orders.loader", 1);
  await waitForMetricCount("orders.maplibre.init", 1);
  await sleep(settleMs);

  setSafariUrl(routesUrl);
  await waitForMetricCount("orders.maplibre.remove", 1);
  await sleep(settleMs);

  setSafariUrl(ordersUrl);
  await waitForMetricCount("orders.loader", 2);
  await waitForMetricCount("orders.maplibre.init", 2);
  await sleep(settleMs);

  const events = readPerfEvents();
  assertRequiredMetrics(events);

  const summary = summarizeEvents(events);
  await mkdir(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify({ summary, events }, null, 2)}\n`, "utf8");

  console.log("Orders navigation performance summary");
  console.table(summary);
  console.log(`artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
