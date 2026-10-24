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
import { mobileUserAgent } from "../electron/mobile-agent.js";
import { devicePresets } from "../electron/device-presets.js";
for (const mode of ["android", "iphone"] as const) {
  test(
    `${mode} mobile emulation serves the mobile page using a version-matched Mobile UA`,
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
        const mobileAgent = mobileUserAgent("chromium", browser.version());
        let receivedAgent = "";
        const server = createServer((req, res) => {
          receivedAgent = req.headers["user-agent"] || "";
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${receivedAgent.includes("Android") && receivedAgent.includes("Mobile") ? "Mobile page" : "Desktop page"}</title><button onclick="this.textContent='tapped'">tap</button>`,
          );
        });
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const address = server.address();
        if (!address || typeof address === "string")
          throw Error("No fixture port");
        try {
          const context = await browser.newContext(
            environmentOptions(
              {
                deviceMode: mode,
                locale: "th-TH",
                timezone: "Asia/Bangkok",
                width: preset.width,
                height: preset.height,
              },
              mobileAgent,
            ),
          );
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${address.port}`);
          assert.equal(await page.title(), "Mobile page");
          assert.equal(receivedAgent, mobileAgent);
          const metrics = await page.evaluate(() => ({
            width: innerWidth,
            screen: screen.width,
            ratio: devicePixelRatio,
            touch: navigator.maxTouchPoints,
            ua: navigator.userAgent,
            hintMobile: (navigator as any).userAgentData?.mobile,
            hintPlatform: (navigator as any).userAgentData?.platform,
          }));
          assert.equal(metrics.width, preset.width);
          assert.equal(metrics.screen, preset.width);
          assert.equal(metrics.ratio, preset.scale);
          assert.ok(metrics.touch > 0);
          assert.ok(!metrics.ua.includes("iPhone"));
          assert.ok(metrics.ua.includes("Android"));
          assert.equal(metrics.ua, mobileAgent);
          assert.equal(metrics.hintMobile, true);
          assert.equal(metrics.hintPlatform, "Android");
          await page.getByRole("button", { name: "tap", exact: true }).tap();
          assert.equal(await page.getByRole("button").textContent(), "tapped");
          await context.close();
        } finally {
          server.closeAllConnections();
          await new Promise<void>((r) => server.close(() => r()));
        }
      } finally {
        await browser.close();
      }
    },
  );
}
import {
  TabTracker,
  saveTabs,
  loadTabs,
  restoreTabs,
  restorableUrl,
} from "../electron/tabs.js";
import { openDatabase } from "../electron/storage.js";
test(`${engine.name()} restores per-profile tabs and persistent storage after restart without duplicates`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "masterbrowser-tabs-"));
  const server = createServer((req, res) => {
    if (req.url === "/offline") {
      req.socket.destroy();
      return;
    }
    res.end("<html><title>Tab restoration fixture</title></html>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No server address");
  const url = `http://127.0.0.1:${address.port}`;
  const encode = (value: string) => Buffer.from(value).toString("base64"),
    decode = (value: string) => Buffer.from(value, "base64").toString();
  const db = openDatabase(path.join(root, "tabs.sqlite"));
  const contexts = [];
  try {
    const context = await engine.launchPersistentContext(
      path.join(root, "profile"),
      { headless: true },
    );
    contexts.push(context);
    const first = context.pages()[0] || (await context.newPage());
    await first.goto(url + "/one");
    await first.evaluate(() => {
      localStorage.setItem("owned-session", "kept");
      document.cookie = "owned=kept; Max-Age=86400; SameSite=Lax";
    });
    const second = await context.newPage();
    await second.goto(url + "/two");
    const third = await context.newPage();
    await third.goto(url + "/three");
    const tracker = new TabTracker(context, (state) =>
      saveTabs(db, "profile-a", state, encode),
    );
    await tracker.flush();
    await second.close();
    await tracker.flush();
    const fourth = await context.newPage();
    await fourth.goto(url + "/four");
    await tracker.prepareClose();
    const saved = loadTabs(db, "profile-a", decode)!;
    assert.deepEqual(saved.urls, [url + "/one", url + "/three", url + "/four"]);
    assert.equal(loadTabs(db, "profile-b", decode), undefined);
    await context.close();
    const reopened = await engine.launchPersistentContext(
      path.join(root, "profile"),
      { headless: true },
    );
    contexts.push(reopened);
    assert.equal(
      (await restoreTabs(reopened, saved.urls, saved.activeIndex)).failed,
      0,
    );
    assert.deepEqual(
      reopened
        .pages()
        .map((page) => page.url())
        .filter(restorableUrl),
      saved.urls,
    );
    await restoreTabs(reopened, saved.urls, saved.activeIndex);
    assert.equal(reopened.pages().length, 3);
    assert.equal(
      await reopened
        .pages()[0]!
        .evaluate(() => localStorage.getItem("owned-session")),
      "kept",
    );
    assert.ok(
      (await reopened.cookies()).some(
        (cookie) => cookie.name === "owned" && cookie.value === "kept",
      ),
    );
    const nativeCloseTracker = new TabTracker(reopened, (state) =>
      saveTabs(db, "profile-a", state, encode),
    );
    await nativeCloseTracker.flush();
    const before = loadTabs(db, "profile-a", decode);
    await reopened.close();
    assert.deepEqual(loadTabs(db, "profile-a", decode), before);
    const failed = await engine.launchPersistentContext(
      path.join(root, "failed-page"),
      { headless: true },
    );
    contexts.push(failed);
    const result = await restoreTabs(failed, [url + "/offline"]);
    assert.equal(result.failed, 1);
    assert.ok(failed.pages().some((page) => !page.isClosed()));
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    db.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
