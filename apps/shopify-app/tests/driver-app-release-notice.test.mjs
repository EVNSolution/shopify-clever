import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fetchDriverAppReleaseNotice } from "../app/features/drivers/driver-app-release.server.js";

const root = process.cwd();
const driversPageSource = readFileSync(join(root, "app/routes/app.drivers-vehicles.jsx"), "utf8");

test("reads the canonical CLEVER Routes release for the K-Food notice", async () => {
  const calls = [];
  const notice = await fetchDriverAppReleaseNotice({
    fetchImpl: async (url, init) => {
      calls.push({ init, url });
      return {
        json: async () => ({
          data: {
            installUrl: "https://clever-route.cleversystem.ai/routes-app",
            latestVersionCode: 24,
            latestVersionName: "1.2.6",
          },
          error: null,
        }),
        ok: true,
      };
    },
  });

  assert.deepEqual(notice, {
    installUrl: "https://clever-route.cleversystem.ai/routes-app",
    latestVersionCode: 24,
    latestVersionName: "1.2.6",
  });
  assert.equal(calls[0].url, "https://clever-route.cleversystem.ai/routes-app/release/android");
  assert.equal(calls[0].init.headers["Cache-Control"], "no-store");
});

test("release lookup failure does not fail the Drivers page", async () => {
  assert.equal(await fetchDriverAppReleaseNotice({
    fetchImpl: async () => ({ json: async () => ({}), ok: false }),
  }), null);
  assert.equal(await fetchDriverAppReleaseNotice({
    fetchImpl: async () => ({ json: async () => ({ data: { latestVersionCode: 0 } }), ok: true }),
  }), null);
  assert.equal(await fetchDriverAppReleaseNotice({
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  }), null);
});

test("Drivers shows the canonical release notice and existing stable update action", () => {
  assert.match(driversPageSource, /fetchDriverAppReleaseNotice/);
  assert.match(driversPageSource, /driverAppRelease/);
  assert.match(driversPageSource, /role="status"/);
  assert.match(driversPageSource, /CLEVER Routes \{driverAppRelease\.latestVersionName\}/);
  assert.match(driversPageSource, /Version code \{driverAppRelease\.latestVersionCode\}/);
  assert.match(driversPageSource, /onClick=\{openDownloadModal\}/);
  assert.doesNotMatch(driversPageSource, /driverAppRelease\.installUrl/);
});
