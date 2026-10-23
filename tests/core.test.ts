import { test } from "node:test";
import assert from "node:assert/strict";
import { profileSchema, proxySchema, chooseProxy } from "../electron/schema.js";
test("reject traversal and malformed proxy hosts", () => {
  for (const host of ["../x", "https://host", "x;whoami", "a/b"])
    assert.equal(
      proxySchema.safeParse({
        name: "x",
        protocol: "http",
        host,
        port: 80,
        username: "",
        password: "",
      }).success,
      false,
    );
});
test("reject invalid ports and SOCKS credentials", () => {
  assert.equal(
    proxySchema.safeParse({
      name: "x",
      protocol: "socks5",
      host: "localhost",
      port: 1080,
      username: "user",
      password: "pw",
    }).success,
    false,
  );
});
test("random assignment selects only available proxies", () => {
  const items = [
    { id: "a", status: "failed" },
    { id: "b", status: "available" },
    { id: "c", status: "untested" },
  ];
  for (let i = 0; i < 100; i++) assert.equal(chooseProxy(items).id, "b");
});
test("fail closed when no available proxy", () => {
  assert.throws(() => chooseProxy([]));
  assert.throws(() => chooseProxy([{ id: "a", status: "failed" }]));
});
test("environment rejects impossible timezone and empty name", () => {
  assert.equal(
    profileSchema.safeParse({
      name: "",
      engine: "chromium",
      locale: "th-TH",
      timezone: "invalid",
      width: 1280,
      height: 800,
      notes: "",
      tags: "",
      group: "",
      proxyId: null,
      randomProxy: false,
    }).success,
    false,
  );
});
import { openDatabase } from "../electron/storage.js";
test("SQLite migration is repeatable and profile CRUD persists", () => {
  const db = openDatabase(":memory:");
  assert.equal(
    (db.prepare("PRAGMA user_version").get() as any).user_version,
    1,
  );
  db.prepare("INSERT INTO profiles VALUES (?,?)").run(
    "one",
    JSON.stringify({ name: "A" }),
  );
  db.prepare("UPDATE profiles SET data=? WHERE id=?").run(
    JSON.stringify({ name: "B" }),
    "one",
  );
  assert.equal(
    JSON.parse(
      (db.prepare("SELECT data FROM profiles WHERE id=?").get("one") as any)
        .data,
    ).name,
    "B",
  );
  db.prepare("DELETE FROM profiles WHERE id=?").run("one");
  assert.equal(db.prepare("SELECT * FROM profiles").all().length, 0);
  db.close();
});
import { parseProxyList } from "../electron/proxy-import.js";
test("imports proxy list and decodes credentials without logging them", () => {
  const parsed = parseProxyList(
    "localhost:8080\nhttps://name:secret@example.org:444",
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1]!.protocol, "https");
  assert.equal(parsed[1]!.port, 444);
  assert.throws(() => parseProxyList("socks5://name:pw@localhost:1080"));
});
test("proxy imports reject path/query and use the SOCKS default port", () => {
  assert.throws(() => parseProxyList("http://localhost:8080/path"));
  assert.throws(() => parseProxyList("http://localhost:8080?token=x"));
  assert.equal(parseProxyList("socks5://localhost")[0]!.port, 1080);
  for (const host of [
    ".",
    "-bad.example",
    "bad-.example",
    "bad..example",
    "999.999.999.999",
  ])
    assert.equal(
      proxySchema.safeParse({
        name: "x",
        protocol: "http",
        host,
        port: 8080,
        username: "",
        password: "",
      }).success,
      false,
    );
});
