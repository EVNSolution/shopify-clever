import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const perfLogPath = join(root, ".omx/perf/orders-navigation.jsonl");
const artifactPath = join(root, ".omx/perf/orders-performance-cohorts.json");
const flagMatrixPath = join(root, ".omx/perf/orders-flag-matrix.json");
const sampleCount = Number.parseInt(process.env.PERF_SAMPLE_COUNT ?? "100", 10);
const waitTimeoutMs = Number.parseInt(process.env.PERF_TIMEOUT_MS ?? "15000", 10);
const nextButton = parsePoint(process.env.PERF_NEXT_BUTTON_POINT ?? "364,1019");
const previousButton = parsePoint(process.env.PERF_PREVIOUS_BUTTON_POINT ?? "295,1019");
const tableFocusPoint = parsePoint(process.env.PERF_TABLE_FOCUS_POINT ?? "1000,900");
const serverRoot = process.env.CLEVER_ROUTE_SERVER_ROOT;

if (process.platform !== "darwin") {
  throw new Error("Orders browser cohorts currently require macOS Safari");
}
if (!Number.isInteger(sampleCount) || sampleCount < 1) {
  throw new Error("PERF_SAMPLE_COUNT must be a positive integer");
}
if (!serverRoot) {
  throw new Error("CLEVER_ROUTE_SERVER_ROOT is required");
}

const serverArtifactPath = resolve(
  serverRoot,
  "apps/delivery-api/.omx/perf/orders-server-performance-cohorts.json",
);

function parsePoint(value) {
  const [x, y] = String(value).split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid screen point: ${value}`);
  }
  return { x, y };
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function runAppleScript(script) {
  return execFileSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getSafariUrl() {
  return runAppleScript('tell application "Safari" to get URL of current tab of front window');
}

function setSafariUrl(url) {
  const escapedUrl = url.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  runAppleScript(`tell application "Safari" to set URL of current tab of front window to "${escapedUrl}"`);
}

function setSafariBounds() {
  runAppleScript('tell application "Safari" to activate\ntell application "Safari" to set bounds of front window to {0, 25, 1920, 1080}');
}

function pressEnd() {
  runAppleScript('tell application "Safari" to activate\ntell application "System Events" to key code 119');
}

function buildAppUrl(currentUrl, appPath) {
  const url = new URL(currentUrl);
  const embeddedAppMatch = url.pathname.match(/^(\/store\/[^/]+\/apps\/[^/]+)\/app(?:\/.*)?$/u);
  if (!embeddedAppMatch) {
    throw new Error(
      `Current Safari URL is not inside a Shopify embedded app; set PERF_TARGET_URL: ${currentUrl}`,
    );
  }
  url.pathname = `${embeddedAppMatch[1]}${appPath}`;
  url.search = "";
  url.hash = "";
  return url;
}

function readEvents() {
  if (!existsSync(perfLogPath)) return [];
  return readFileSync(perfLogPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function countMetric(name) {
  return readEvents().filter((event) => event.name === name).length;
}

async function waitForMetricCount(name, expectedCount) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < waitTimeoutMs) {
    if (countMetric(name) >= expectedCount) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${name} count ${expectedCount}`);
}

async function waitForMetricCountToSettle(name, settleMs = 750) {
  const startedAt = Date.now();
  let lastCount = countMetric(name);
  let stableSince = Date.now();

  while (Date.now() - startedAt < waitTimeoutMs) {
    await sleep(50);
    const nextCount = countMetric(name);
    if (nextCount !== lastCount) {
      lastCount = nextCount;
      stableSince = Date.now();
    }
    if (Date.now() - stableSince >= settleMs) return lastCount;
  }
  throw new Error(`Timed out waiting for ${name} to settle`);
}

function compileClickHelper() {
  const tempDirectory = mkdtempSync(join(tmpdir(), "orders-perf-click-"));
  const sourcePath = join(tempDirectory, "click.swift");
  const binaryPath = join(tempDirectory, "click");
  writeFileSync(sourcePath, `
import CoreGraphics
import Foundation
let x = Double(CommandLine.arguments[1])!
let y = Double(CommandLine.arguments[2])!
let point = CGPoint(x: x, y: y)
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)!.post(tap: .cghidEventTap)
let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)!
let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)!
down.post(tap: .cghidEventTap)
usleep(30000)
up.post(tap: .cghidEventTap)
`, "utf8");
  execFileSync("swiftc", [sourcePath, "-o", binaryPath]);
  return {
    click(point) {
      execFileSync(binaryPath, [String(point.x), String(point.y)]);
    },
    cleanup() {
      rmSync(tempDirectory, { force: true, recursive: true });
    },
  };
}

function loaderSampleForFirstUsable(events, firstUsable) {
  const capturedAtMs = Date.parse(firstUsable?.capturedAt);
  if (!Number.isFinite(capturedAtMs)) return null;

  const closestLoader = events
    .filter((event) => event.name === "orders.loader" && Number.isFinite(event.totalMs))
    .map((event) => ({
      event,
      distanceMs: Math.abs(Date.parse(event.capturedAt) - capturedAtMs),
    }))
    .filter(({ distanceMs }) => Number.isFinite(distanceMs) && distanceMs <= 1_000)
    .sort((left, right) => left.distanceMs - right.distanceMs)[0]?.event;

  return closestLoader?.totalMs ?? null;
}

function assertPrivacyCanary(rawLog) {
  const forbiddenPatterns = [
    /id_token=/iu,
    /access[_-]?token/iu,
    /selectionToken/iu,
    /Evidence Customer/iu,
    /Evidence Street/iu,
  ];
  const matched = forbiddenPatterns.find((pattern) => pattern.test(rawLog));
  if (matched) throw new Error(`PII/privacy canary failed: ${matched}`);
}

async function collectNavigationSamples(ordersUrl, routesUrl) {
  setSafariUrl(routesUrl.toString());
  await sleep(500);

  for (let index = 0; index < sampleCount; index += 1) {
    const sampleUrl = new URL(ordersUrl);
    sampleUrl.searchParams.set("perf_cohort", "cold");
    sampleUrl.searchParams.set("perf_sample", String(index + 1));
    setSafariUrl(sampleUrl.toString());
    await waitForMetricCount("orders.loader.first_usable", index + 1);
    if (index + 1 < sampleCount) {
      setSafariUrl(routesUrl.toString());
      await sleep(150);
    }
  }
}

async function collectPageTransitionSamples(clickHelper) {
  setSafariBounds();
  await sleep(1_500);

  const initialCount = await waitForMetricCountToSettle("orders.page.fetch");
  for (let index = 0; index < sampleCount; index += 1) {
    clickHelper.click(tableFocusPoint);
    pressEnd();
    await sleep(100);
    pressEnd();
    await sleep(100);
    clickHelper.click(index % 2 === 0 ? nextButton : previousButton);
    await waitForMetricCount("orders.page.fetch", initialCount + index + 1);
    await sleep(200);
  }
}

function buildArtifact(events, serverArtifact, flagMatrix) {
  const firstUsableEvents = events
    .filter((event) => event.name === "orders.loader.first_usable" && event.status === "success")
    .slice(-sampleCount);
  const pageTransitionEvents = events
    .filter((event) => event.name === "orders.page.fetch" && event.status === "success")
    .slice(-sampleCount);

  if (firstUsableEvents.length !== sampleCount || pageTransitionEvents.length !== sampleCount) {
    throw new Error("Browser cohort sample counts are incomplete");
  }

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    cohorts: {
      ...serverArtifact.cohorts,
      coldFirstUsableMs: firstUsableEvents.map((event) => event.durationMs),
      warmLoaderMs: firstUsableEvents.map((event) => loaderSampleForFirstUsable(events, event)),
      warmPageTransitionAppMs: pageTransitionEvents.map((event) => event.durationMs),
    },
    evidence: {
      browser: "Safari embedded Shopify Admin dev preview",
      browserSampleCount: sampleCount,
      privacyCanary: { pass: true },
      serverArtifact: serverArtifactPath,
    },
    flagMatrix,
  };
}

async function main() {
  if (!existsSync(serverArtifactPath)) {
    throw new Error(`Missing server cohort artifact: ${serverArtifactPath}`);
  }
  if (!existsSync(flagMatrixPath)) {
    throw new Error(`Missing flag matrix artifact: ${flagMatrixPath}`);
  }

  const currentUrl = process.env.PERF_TARGET_URL ?? getSafariUrl();
  const ordersUrl = buildAppUrl(currentUrl, "/app/orders");
  const routesUrl = buildAppUrl(currentUrl, "/app/routes");
  const clickHelper = compileClickHelper();

  try {
    rmSync(perfLogPath, { force: true });
    await collectNavigationSamples(ordersUrl, routesUrl);
    await collectPageTransitionSamples(clickHelper);

    const rawLog = readFileSync(perfLogPath, "utf8");
    assertPrivacyCanary(rawLog);
    const artifact = buildArtifact(
      readEvents(),
      JSON.parse(readFileSync(serverArtifactPath, "utf8")),
      JSON.parse(readFileSync(flagMatrixPath, "utf8")),
    );
    await mkdir(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`Orders browser performance cohorts written: ${artifactPath}`);
  } finally {
    clickHelper.cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
