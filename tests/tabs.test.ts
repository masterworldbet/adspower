import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../electron/storage.js";
import {
  tabSnapshot,
  saveTabs,
  loadTabs,
  restorableUrl,
} from "../electron/tabs.js";
const encode = (value: string) => Buffer.from(value).toString("base64");
const decode = (value: string) => Buffer.from(value, "base64").toString();
test("tab state excludes executable URLs and embedded credentials, preserving eligible order and active tab", () => {
  const snapshot = tabSnapshot(
    [
      "about:blank",
      "https://example.org/a",
      "javascript:alert(1)",
      "https://example.org/b",
      "https://user:password@example.org/",
    ],
    3,
  );
  assert.deepEqual(snapshot, {
    version: 1,
    urls: ["https://example.org/a", "https://example.org/b"],
    activeIndex: 1,
  });
  assert.equal(restorableUrl("file:///C:/Windows"), false);
  assert.equal(
    tabSnapshot(Array(150).fill("https://example.org")).urls.length,
    100,
  );
});
test("tab records remain per profile, encoded through the supplied storage codec and reject corrupted data", () => {
  const db = openDatabase(":memory:");
  try {
    const first = tabSnapshot(
      ["https://example.org/a", "https://example.org/b"],
      1,
    );
    saveTabs(db, "a", first, encode);
    saveTabs(db, "b", tabSnapshot(["https://example.org/other"]), encode);
    assert.deepEqual(loadTabs(db, "a", decode), first);
    assert.deepEqual(loadTabs(db, "b", decode)?.urls, [
      "https://example.org/other",
    ]);
    assert.equal(loadTabs(db, "missing", decode), undefined);
    const raw = db
      .prepare("SELECT data FROM profile_tabs WHERE profile_id=?")
      .get("a") as any;
    assert.ok(!raw.data.includes("https://"));
    saveTabs(db, "a", tabSnapshot([]), encode);
    assert.deepEqual(loadTabs(db, "a", decode), first);
    db.prepare("UPDATE profile_tabs SET data=? WHERE profile_id=?").run(
      "broken",
      "a",
    );
    assert.throws(() => loadTabs(db, "a", decode));
  } finally {
    db.close();
  }
});
import { EventEmitter } from "node:events";
import type { BrowserContext } from "playwright";
import { TabTracker } from "../electron/tabs.js";
test("overlapping tab flush requests are serialized before closing", async () => {
  let active = 0,
    maximum = 0;
  const page = new EventEmitter() as any;
  page.isClosed = () => false;
  page.url = () => "https://example.org/";
  page.evaluate = async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return true;
  };
  const context = new EventEmitter() as any;
  context.pages = () => [page];
  const tracker = new TabTracker(context as BrowserContext, () => {});
  try {
    await Promise.all([tracker.flush(), tracker.flush(), tracker.flush()]);
    assert.equal(maximum, 1);
  } finally {
    tracker.stop();
  }
});
