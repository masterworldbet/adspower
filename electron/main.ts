import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./storage.js";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium, firefox, request, type BrowserContext } from "playwright";
import { z } from "zod";
import { vpnStatus as vpn, changeVpn } from "./vpn.js";
import { reserveProfile } from "./profile-lock.js";
import { parseProxyList } from "./proxy-import.js";
import { profileSchema, proxySchema, idSchema, chooseProxy } from "./schema.js";
const smoke = process.argv.includes("--smoke-test");
if (smoke)
  app.setPath(
    "userData",
    mkdtempSync(path.join(tmpdir(), "masterbrowser-smoke-")),
  );
const here = path.dirname(fileURLToPath(import.meta.url));
const live = new Map<string, BrowserContext>();
const opening = new Set<string>();
let db: DatabaseSync;
let root: string;
function rows(table: "profiles" | "proxies") {
  return db
    .prepare(`SELECT * FROM ${table}`)
    .all()
    .map((r: any) => ({ ...JSON.parse(r.data), id: r.id }));
}
function get(table: "profiles" | "proxies", id: string) {
  const r: any = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id);
  if (!r) throw Error("ไม่พบรายการ");
  return { ...JSON.parse(r.data), id };
}
function put(table: "profiles" | "proxies", id: string, data: any) {
  db.prepare(`INSERT OR REPLACE INTO ${table}(id,data) VALUES (?,?)`).run(
    id,
    JSON.stringify(data),
  );
}
function proxyConfig(p: any) {
  return {
    server: `${p.protocol}://${p.host}:${p.port}`,
    username: p.username || undefined,
    password: p.secret
      ? safeStorage.decryptString(Buffer.from(p.secret, "base64"))
      : undefined,
  };
}
async function checkProxy(p: any) {
  const ctx = await request.newContext({
    proxy: proxyConfig(p),
    timeout: 15000,
  });
  try {
    const start = Date.now();
    const res = await ctx.get("https://api.ipify.org?format=json");
    if (!res.ok()) throw Error("Proxy IP check failed");
    const body = await res.json();
    if (typeof body.ip !== "string" || !isIP(body.ip))
      throw Error("Invalid IP response");
    return { ip: body.ip, latency: Date.now() - start, status: "available" };
  } finally {
    await ctx.dispose();
  }
}
app.whenReady().then(() => {
  root = app.getPath("userData");
  mkdirSync(root, { recursive: true });
  db = openDatabase(path.join(root, "masterbrowser.sqlite"));
  const handlers: Record<string, (v: any) => any> = {
    list: () => ({
      profiles: rows("profiles").map((p) => ({
        ...p,
        status: live.has(p.id)
          ? "running"
          : opening.has(p.id)
            ? "opening"
            : "stopped",
      })),
      proxies: rows("proxies").map(({ secret: _secret, ...p }) => ({
        ...p,
        hasPassword: !!_secret,
      })),
      platform: process.platform,
    }),
    "profile.save": (v) => {
      const input = z
        .object({ id: idSchema.optional(), data: profileSchema })
        .parse(v);
      const id = input.id || randomUUID();
      if (live.has(id) || opening.has(id))
        throw Error("กรุณาปิดโปรไฟล์ก่อนแก้ไข");
      if (input.data.proxyId) get("proxies", input.data.proxyId);
      put("profiles", id, input.data);
      return id;
    },
    "profile.delete": (v) => {
      const id = idSchema.parse(v);
      if (live.has(id) || opening.has(id)) throw Error("โปรไฟล์กำลังทำงาน");
      db.prepare("DELETE FROM profiles WHERE id=?").run(id);
    },
    "profile.duplicate": (v) => {
      const p = get("profiles", idSchema.parse(v));
      put("profiles", randomUUID(), {
        ...p,
        name: p.name + " (สำเนา)",
        id: undefined,
        lastOpened: undefined,
        ip: undefined,
      });
    },
    "profile.close": async (v) => {
      const id = idSchema.parse(v);
      await live.get(id)?.close();
    },
    "profile.open": async (v) => {
      const id = idSchema.parse(v);
      reserveProfile(id, live, opening);
      let ctx: BrowserContext | undefined;
      try {
        const p = get("profiles", id);
        if (p.vpnName) {
          const state = await vpn();
          if (
            !state.supported ||
            !state.connections.some(
              (c: any) =>
                c.Name === p.vpnName && c.ConnectionStatus === "Connected",
            )
          )
            throw Error(
              "VPN ที่เลือกยังไม่ได้เชื่อมต่อ เปิด Windows Settings ก่อน",
            );
        }
        if (p.randomProxy) {
          p.proxyId = chooseProxy(rows("proxies")).id;
          put("profiles", id, p);
        }
        const proxy = p.proxyId ? get("proxies", p.proxyId) : null;
        if (proxy) {
          try {
            const result = await checkProxy(proxy);
            p.ip = result.ip;
            put("proxies", proxy.id, { ...proxy, ...result });
          } catch {
            put("proxies", proxy.id, { ...proxy, status: "failed" });
            throw Error("Proxy ไม่พร้อมใช้งาน");
          }
        } else {
          const direct = await request.newContext({ timeout: 15000 });
          try {
            const response = await direct.get(
              "https://api.ipify.org?format=json",
            );
            if (!response.ok()) throw Error("ตรวจ IP ไม่สำเร็จ");
            p.ip = (await response.json()).ip;
            if (typeof p.ip !== "string") throw Error("IP response ไม่ถูกต้อง");
          } finally {
            await direct.dispose();
          }
        }
        ctx = await (
          p.engine === "firefox" ? firefox : chromium
        ).launchPersistentContext(path.join(root, "sessions", id), {
          headless: false,
          channel: ["chrome", "msedge"].includes(p.engine)
            ? p.engine
            : undefined,
          proxy: proxy ? proxyConfig(proxy) : undefined,
          locale: p.locale,
          timezoneId: p.timezone,
          viewport: { width: p.width, height: p.height },
          screen: { width: p.width, height: p.height },
        });
        live.set(id, ctx);
        ctx.on("close", () => live.delete(id));
        await (ctx.pages()[0] || (await ctx.newPage())).goto(
          "https://www.facebook.com/",
        );
        put("profiles", id, {
          ...p,
          lastOpened: new Date().toISOString(),
          browserVersion: ctx.browser()?.version() || "unknown",
          os: process.platform,
        });
        return { version: ctx.browser()?.version() };
      } catch {
        await ctx?.close();
        throw Error(
          "เปิดเบราว์เซอร์ไม่สำเร็จ: ตรวจ Binary, Proxy และเครือข่าย ไม่มีการสลับเป็น Direct อัตโนมัติ",
        );
      } finally {
        opening.delete(id);
      }
    },
    "proxy.save": (v) => {
      const p = proxySchema.parse(v);
      if (p.password && !safeStorage.isEncryptionAvailable())
        throw Error("ระบบเข้ารหัสไม่พร้อม");
      const { password, ...rest } = p;
      const secret = password
        ? safeStorage.encryptString(password).toString("base64")
        : null;
      if (
        rows("proxies").some(
          (x) =>
            x.host === p.host &&
            x.port === p.port &&
            x.protocol === p.protocol &&
            x.username === p.username,
        )
      )
        throw Error("Proxy ซ้ำ");
      put("proxies", randomUUID(), { ...rest, secret, status: "untested" });
    },
    "proxy.import": (v) => {
      const parsed = parseProxyList(z.string().max(1_000_000).parse(v));
      if (
        parsed.some((p) => p.password) &&
        !safeStorage.isEncryptionAvailable()
      )
        throw Error("ระบบเข้ารหัสไม่พร้อม");
      const all = rows("proxies");
      let count = 0;
      db.exec("BEGIN");
      try {
        for (const p of parsed) {
          if (
            all.some(
              (x) =>
                x.host === p.host &&
                x.port === p.port &&
                x.protocol === p.protocol &&
                x.username === p.username,
            )
          )
            continue;
          const { password, ...rest } = p;
          const saved = {
            ...rest,
            secret: password
              ? safeStorage.encryptString(password).toString("base64")
              : null,
            status: "untested",
          };
          put("proxies", randomUUID(), saved);
          all.push(saved);
          count++;
        }
        db.exec("COMMIT");
        return count;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    "proxy.test": async (v) => {
      const p = get("proxies", idSchema.parse(v));
      try {
        const r = await checkProxy(p);
        put("proxies", p.id, { ...p, ...r });
        return r;
      } catch {
        put("proxies", p.id, { ...p, status: "failed" });
        throw Error("Proxy ไม่พร้อมใช้งาน");
      }
    },
    "proxy.delete": (v) => {
      const id = idSchema.parse(v);
      if (rows("profiles").some((p) => p.proxyId === id))
        throw Error("Proxy ถูกใช้โดยโปรไฟล์");
      db.prepare("DELETE FROM proxies WHERE id=?").run(id);
    },
    "network.ip": async () => {
      const context = await request.newContext({ timeout: 15000 });
      try {
        const r = await context.get("https://api.ipify.org?format=json");
        if (!r.ok()) throw Error("ตรวจ IP ไม่สำเร็จ");
        return (await r.json()).ip;
      } finally {
        await context.dispose();
      }
    },
    "vpn.status": vpn,
    "vpn.connect": async (v) => changeVpn(z.string().parse(v), true),
    "vpn.disconnect": async (v) => changeVpn(z.string().parse(v), false),
    "vpn.settings": async () => {
      if (process.platform !== "win32") throw Error("รองรับ Windows เท่านั้น");
      const { shell } = await import("electron");
      await shell.openExternal("ms-settings:network-vpn");
    },
    browsers: () =>
      ["chromium", "firefox", "chrome", "msedge"].map((engine) => ({
        engine,
        available:
          engine === "chromium"
            ? existsSync(chromium.executablePath())
            : engine === "firefox"
              ? existsSync(firefox.executablePath())
              : process.platform === "win32" &&
                [
                  process.env.PROGRAMFILES,
                  process.env["PROGRAMFILES(X86)"],
                  process.env.LOCALAPPDATA,
                ]
                  .filter(Boolean)
                  .some((base) =>
                    existsSync(
                      path.join(
                        base!,
                        engine === "chrome"
                          ? "Google/Chrome/Application/chrome.exe"
                          : "Microsoft/Edge/Application/msedge.exe",
                      ),
                    ),
                  ),
      })),
    backup: async () => {
      const result = await dialog.showSaveDialog({
        defaultPath: "masterbrowser.json",
      });
      if (result.canceled || !result.filePath) return;
      writeFileSync(
        result.filePath,
        JSON.stringify(
          {
            version: 1,
            profiles: rows("profiles").map((p) => ({
              ...p,
              proxyId: null,
              randomProxy: false,
            })),
          },
          null,
          2,
        ),
      );
      return "สำรองการตั้งค่าโปรไฟล์แล้ว (ไม่รวม Session และ Proxy)";
    },
    restore: async () => {
      if (live.size || opening.size) throw Error("ปิดทุกโปรไฟล์ก่อน");
      const r = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (r.canceled) return;
      const content = readFileSync(r.filePaths[0]!);
      if (content.length > 5_000_000) throw Error("ไฟล์ใหญ่เกินไป");
      const parsed = z
        .object({
          version: z.literal(1),
          profiles: z.array(profileSchema).max(1000),
        })
        .parse(JSON.parse(content.toString()));
      db.exec("BEGIN");
      try {
        for (const p of parsed.profiles)
          put("profiles", randomUUID(), {
            ...p,
            proxyId: null,
            randomProxy: false,
          });
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return "นำเข้าการตั้งค่าแล้ว";
    },
  };
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  ipcMain.handle("masterbrowser", async (event, action, argument) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      typeof action !== "string" ||
      !Object.hasOwn(handlers, action)
    )
      throw Error("Unauthorized IPC");
    try {
      return { ok: true, value: await handlers[action]!(argument) };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Operation failed",
      };
    }
  });
  if (smoke) {
    win.webContents.once("did-finish-load", () => {
      void win.webContents
        .executeJavaScript(
          "window.masterbrowser.invoke('list').then(r=>r.ok && Array.isArray(r.value.profiles))",
        )
        .then((ok) => app.exit(ok ? 0 : 1))
        .catch(() => app.exit(1));
    });
    setTimeout(() => app.exit(1), 30000).unref();
  }
  win.loadFile(path.join(here, "../dist/index.html"));
});
app.on("window-all-closed", () => {
  void Promise.all([...live.values()].map((c) => c.close())).finally(() =>
    app.quit(),
  );
});
