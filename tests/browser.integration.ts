import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
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
      locale: "th-TH",
      timezoneId: "Asia/Bangkok",
      viewport: { width: 1280, height: 800 },
      screen: { width: 1280, height: 800 },
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
    assert.equal(await first.evaluate(() => window.screen.width), 1280);
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
    await assert.rejects(() =>
      engine.launchPersistentContext(path.join(root, "one"), {
        headless: true,
      }),
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
    await Promise.all(contexts.map((c) => c.close()));
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});
