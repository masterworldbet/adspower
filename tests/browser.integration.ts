import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { environmentOptions } from "../electron/environment.js";
import { reserveProfile } from "../electron/profile-lock.js";
const engine =
  process.env.BROWSER_TEST_ENGINE === "firefox" ? firefox : chromium;
test(`${engine.name()} persistent browser profiles isolate cookies and local storage`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "masterbrowser-"));
  const server = createServer((_req, res) =>
    res.end("<html><title>Session check</title></html>"),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test address");
  const url = `http://127.0.0.1:${address.port}`;
  const contexts = [];
  try {
    const one = await engine.launchPersistentContext(path.join(root, "one"), {
      headless: true,
      ...environmentOptions({
        locale: "th-TH",
        timezone: "Asia/Bangkok",
        width: 1280,
        height: 800,
        screenWidth: 1920,
        screenHeight: 1080,
        colorScheme: "dark",
        locationMode: "custom",
        latitude: 13.75,
        longitude: 100.5,
        accuracy: 50,
      }),
    });
    contexts.push(one);
    const first = await one.newPage();
    await first.goto(url);
    assert.equal(await first.evaluate(() => navigator.language), "th-TH");
    assert.equal(
      await first.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
      "Asia/Bangkok",
    );
    assert.equal(await first.evaluate(() => window.innerWidth), 1280);
    assert.equal(await first.evaluate(() => window.screen.width), 1920);
    assert.equal(
      await first.evaluate(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
      ),
      true,
    );
    await one.grantPermissions(["geolocation"], { origin: url });
    const coords = await first.evaluate(
      () =>
        new Promise<{ latitude: number; longitude: number }>(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              (p) =>
                resolve({
                  latitude: p.coords.latitude,
                  longitude: p.coords.longitude,
                }),
              reject,
              { timeout: 5000 },
            ),
        ),
    );
    assert.deepEqual(coords, { latitude: 13.75, longitude: 100.5 });
    await first.evaluate(() => {
      localStorage.setItem("owner", "one");
      document.cookie = "owner=one; Max-Age=86400; SameSite=Lax";
    });
    const two = await engine.launchPersistentContext(path.join(root, "two"), {
      headless: true,
    });
    contexts.push(two);
    const second = await two.newPage();
    await second.goto(url);
    assert.equal(
      await second.evaluate(() => localStorage.getItem("owner")),
      null,
    );
    assert.equal(await second.evaluate(() => document.cookie), "");
    // Verify the application's guard rather than relying on engine-specific
    // behavior when two processes are given the same profile directory.
    const live = new Map([["one", one]]);
    const opening = new Set<string>();
    assert.throws(
      () => reserveProfile("one", live, opening),
      /โปรไฟล์เปิดอยู่แล้ว/,
    );
    await one.close();
    const reopened = await engine.launchPersistentContext(
      path.join(root, "one"),
      { headless: true },
    );
    contexts.push(reopened);
    const persisted = await reopened.newPage();
    await persisted.goto(url);
    assert.equal(
      await persisted.evaluate(() => localStorage.getItem("owner")),
      "one",
    );
    assert.equal(await persisted.evaluate(() => document.cookie), "owner=one");
  } finally {
    try {
      await Promise.all(contexts.map((c) => c.close()));
    } finally {
      // Browser HTTP keep-alive connections must not keep the test runner alive.
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  }
});
import { devicePresets } from "../electron/device-presets.js";
for (const mode of ["android", "iphone"] as const) {
  test(
    `${mode} mobile emulation applies touch, screen and scale with the real Chromium UA`,
    {
      skip:
        engine.name() === "firefox"
          ? "Mobile mode is explicitly unsupported on Firefox"
          : false,
    },
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const preset = devicePresets[mode];
        const context = await browser.newContext(
          environmentOptions({
            deviceMode: mode,
            locale: "th-TH",
            timezone: "Asia/Bangkok",
            width: preset.width,
            height: preset.height,
          }),
        );
        const page = await context.newPage();
        await page.setContent(
          '<meta name="viewport" content="width=device-width,initial-scale=1"><button onclick="this.textContent=\'tapped\'">tap</button>',
        );
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          screen: screen.width,
          ratio: devicePixelRatio,
          touch: navigator.maxTouchPoints,
          ua: navigator.userAgent,
        }));
        assert.equal(metrics.width, preset.width);
        assert.equal(metrics.screen, preset.width);
        assert.equal(metrics.ratio, preset.scale);
        assert.ok(metrics.touch > 0);
        assert.ok(!metrics.ua.includes("iPhone"));
        assert.ok(!metrics.ua.includes("Android"));
        await page.getByRole("button", { name: "tap", exact: true }).tap();
        assert.equal(await page.getByRole("button").textContent(), "tapped");
        await context.close();
      } finally {
        await browser.close();
      }
    },
  );
}
