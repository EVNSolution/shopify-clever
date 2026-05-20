import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

const PERF_LOG_PATH = join(process.cwd(), ".omx/perf/orders-navigation.jsonl");
const MAX_PERF_PAYLOAD_BYTES = 32_000;

function isPerformanceCaptureEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.CLEVER_PERF_CAPTURE === "1";
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}


function sanitizeMetricUrl(value) {
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

function sanitizeMetricPayload(metric) {
  return {
    ...metric,
    url: sanitizeMetricUrl(metric.url),
    referrer: sanitizeMetricUrl(metric.referrer),
  };
}

async function parseMetricPayload(request) {
  const rawPayload = await request.text();

  if (rawPayload.length > MAX_PERF_PAYLOAD_BYTES) {
    throw new Error("Performance payload is too large");
  }

  return JSON.parse(rawPayload);
}

export async function action({ request }) {
  if (!isPerformanceCaptureEnabled()) {
    return jsonResponse({ ok: false, error: "disabled" }, { status: 404 });
  }

  try {
    const metric = sanitizeMetricPayload(await parseMetricPayload(request));
    const entry = {
      capturedAt: new Date().toISOString(),
      ...metric,
    };

    await mkdir(dirname(PERF_LOG_PATH), { recursive: true });
    await appendFile(PERF_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 400 },
    );
  }
}

export async function loader() {
  if (!isPerformanceCaptureEnabled()) {
    return jsonResponse({ ok: false, error: "disabled" }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}
