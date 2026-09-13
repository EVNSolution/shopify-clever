import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fetchDriverAppReleaseNotice } from "../app/features/drivers/driver-app-release.server.js";

const root = process.cwd();
const driversPageSource = readFileSync(join(root, "app/routes/app.drivers-vehicles.jsx"), "utf8");

test("K-Food does not fetch or advertise the direct release as a Play update", async () => {
  const calls = [];
  const notice = await fetchDriverAppReleaseNotice({
    useGooglePlay: true,
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

  assert.equal(notice, null);
  assert.deepEqual(calls, []);
});

test("non-K-Food notices retain validated direct release metadata", async () => {
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

test("Drivers retains the stable download and Google Play actions", () => {
  assert.match(driversPageSource, /fetchDriverAppReleaseNotice/);
  assert.match(driversPageSource, /driverAppRelease/);
  assert.match(driversPageSource, /role="status"/);
  assert.match(driversPageSource, /CLEVER Routes \{driverAppRelease\.latestVersionName\}/);
  assert.match(driversPageSource, /Version code \{driverAppRelease\.latestVersionCode\}/);
  assert.match(driversPageSource, /onClick=\{openDownloadModal\}/);
  assert.match(driversPageSource, /getDriverDownloadLink\(undefined, \{ useGooglePlay \}\)/);
  assert.match(driversPageSource, /clever-routes-play-qr\.svg/);
  assert.match(driversPageSource, /play\.google\.com\/apps\/testing\/com\.evnsolution\.clever\.routes/);
  assert.doesNotMatch(driversPageSource, /driverAppRelease\.installUrl/);
});
