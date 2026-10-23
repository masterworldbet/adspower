import { DatabaseSync } from "node:sqlite";
export function openDatabase(file: string) {
  const db = new DatabaseSync(file);
  try {
    const version = (
      db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 1)
      throw Error(
        "ฐานข้อมูลนี้มาจาก MasterBrowser รุ่นใหม่กว่า กรุณาใช้โปรแกรมรุ่นที่รองรับ",
      );
    db.exec("PRAGMA journal_mode=WAL;");
    if (version === 0) {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(
          "CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS proxies(id TEXT PRIMARY KEY,data TEXT NOT NULL); PRAGMA user_version=1; COMMIT;",
        );
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
