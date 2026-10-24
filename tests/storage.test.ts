import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../electron/storage.js";
test("migration survives reopening and preserves saved data", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "masterbrowser-db-"));
  const file = path.join(dir, "db.sqlite");
  try {
    let db = openDatabase(file);
    db.prepare("INSERT INTO profiles VALUES (?,?)").run(
      "id",
      '{"name":"Saved"}',
    );
    db.close();
    db = openDatabase(file);
    assert.equal(db.prepare("SELECT * FROM profiles").all().length, 1);
    assert.equal(
      (db.prepare("PRAGMA user_version").get() as any).user_version,
      2,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("older application refuses to downgrade a future database", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "masterbrowser-future-"));
  const file = path.join(dir, "db.sqlite");
  try {
    const db = new DatabaseSync(file);
    db.exec("PRAGMA user_version=3");
    db.close();
    assert.throws(() => openDatabase(file), /รุ่นใหม่กว่า/);
    const verify = new DatabaseSync(file);
    assert.equal(
      (verify.prepare("PRAGMA user_version").get() as any).user_version,
      3,
    );
    verify.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("version one migration preserves profiles and adds separate tab records", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "masterbrowser-migrate-"));
  const file = path.join(dir, "db.sqlite");
  try {
    const old = new DatabaseSync(file);
    old.exec(
      "CREATE TABLE profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE proxies(id TEXT PRIMARY KEY,data TEXT NOT NULL); PRAGMA user_version=1;",
    );
    old
      .prepare("INSERT INTO profiles VALUES (?,?)")
      .run("existing", '{"name":"Original"}');
    old.close();
    const db = openDatabase(file);
    assert.equal(db.prepare("SELECT * FROM profiles").all().length, 1);
    assert.equal(db.prepare("SELECT * FROM profile_tabs").all().length, 0);
    assert.equal(
      (db.prepare("PRAGMA user_version").get() as any).user_version,
      2,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
