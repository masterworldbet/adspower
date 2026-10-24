import { app, BrowserWindow, ipcMain, safeStorage, dialog } from "electron";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./storage.js";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright";
import {
  browserNames,
  findWindowsBrowser,
  requireExecutable,
  launchFailure,
  type Engine,
  type LaunchStage,
} from "./browsers.js";
import { z } from "zod";
import { vpnStatus as vpn, changeVpn } from "./vpn.js";
import { environmentOptions, startupUrls } from "./environment.js";
import {
  TabTracker,
  loadTabs,
  saveTabs,
  restoreTabs,
  tabSnapshot,
} from "./tabs.js";
import { reserveProfile } from "./profile-lock.js";
import { parseProxyList } from "./proxy-import.js";
import { profileSchema, proxySchema, idSchema, chooseProxy } from "./schema.js";
// Resolve bundled browser binaries before Playwright initializes its registry.
if (app.isPackaged)
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.resourcesPath,
    "browsers",
  );
const { chromium, firefox, request } = await import("playwright");
function executable(engine: Engine) {
  return requireExecutable(
    engine,
    engine === "chrome" || engine === "msedge"
      ? findWindowsBrowser(engine)
      : engine === "firefox"
        ? firefox.executablePath()
        : chromium.executablePath(),
  );
}
const smoke = process.argv.includes("--smoke-test");
if (smoke)
  app.setPath(
    "userData",
    mkdtempSync(path.join(tmpdir(), "masterbrowser-smoke-")),
  );
const here = path.dirname(fileURLToPath(import.meta.url));
const live = new Map<string, BrowserContext>();
const opening = new Set<string>();
const tabTrackers = new Map<string, TabTracker>();
const sessionNotices = new Map<string, string>();
function encryptTabs(value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw Error("การเข้ารหัสไม่พร้อม");
  return safeStorage.encryptString(value).toString("base64");
}
function decryptTabs(value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw Error("การเข้ารหัสไม่พร้อม");
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}
async function closeProfile(id: string) {
  await tabTrackers.get(id)?.prepareClose();
  await live.get(id)?.close();
}
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
app.whenReady().then(async () => {
  root = app.getPath("userData");
  mkdirSync(root, { recursive: true });
  db = openDatabase(path.join(root, "masterbrowser.sqlite"));
  const handlers: Record<string, (v: any) => any> = {
    list: () => ({
      profiles: rows("profiles").map((p) => ({
        ...p,
        sessionNotice: sessionNotices.get(p.id),
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
      appVersion: app.getVersion(),
    }),
    "profile.save": (v) => {
      const input = z
        .object({ id: idSchema.optional(), data: profileSchema })
        .parse(v);
      const id = input.id || randomUUID();
      if (live.has(id) || opening.has(id))
        throw Error("กรุณาปิดโปรไฟล์ก่อนแก้ไข");
      if (input.data.proxyId) get("proxies", input.data.proxyId);
      const previous = input.id ? get("profiles", id) : {};
      put("profiles", id, { ...previous, ...input.data });
      if (!input.data.restoreTabs)
        db.prepare("DELETE FROM profile_tabs WHERE profile_id=?").run(id);
      return id;
    },
    "profile.delete": (v) => {
      const id = idSchema.parse(v);
      if (live.has(id) || opening.has(id)) throw Error("โปรไฟล์กำลังทำงาน");
      db.prepare("DELETE FROM profile_tabs WHERE profile_id=?").run(id);
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
        realEnvironment: undefined,
        browserVersion: undefined,
        os: undefined,
      });
    },
    "profile.close": async (v) => {
      const id = idSchema.parse(v);
      await closeProfile(id);
    },
    "profile.open": async (v) => {
      const id = idSchema.parse(v);
      reserveProfile(id, live, opening);
      let ctx: BrowserContext | undefined;
      let stage: LaunchStage = "configuration";
      let engine: Engine = "chromium";
      let trackTabs = false;
      sessionNotices.delete(id);
      try {
        const saved = get("profiles", id);
        const p = { ...saved, ...profileSchema.parse(saved) };
        trackTabs = p.restoreTabs;
        let savedTabs;
        if (p.restoreTabs)
          try {
            savedTabs = loadTabs(db, id, decryptTabs);
          } catch {
            sessionNotices.set(
              id,
              "อ่านแท็บที่บันทึกไว้ไม่ได้ จึงใช้ URL เริ่มต้นแทน",
            );
          }
        engine = p.engine;
        const executablePath = executable(engine);
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
        stage = "preflight";
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
        stage = "launch";
        ctx = await (
          p.engine === "firefox" ? firefox : chromium
        ).launchPersistentContext(path.join(root, "sessions", id), {
          headless: false,
          executablePath,
          proxy: proxy ? proxyConfig(proxy) : undefined,
          ...environmentOptions(p),
          args:
            p.webrtcPolicy === "restrict_udp"
              ? ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]
              : [],
        });
        live.set(id, ctx);
        ctx.on("close", () => {
          live.delete(id);
          tabTrackers.delete(id);
        });
        const origins = new Set([
          "https://www.facebook.com",
          ...startupUrls(p.startUrls).map((url) => new URL(url).origin),
        ]);
        if (p.locationMode !== "ask")
          for (const origin of origins)
            await ctx.grantPermissions(
              p.locationMode === "custom" ? ["geolocation"] : [],
              { origin },
            );
        stage = "navigation";
        const nativeTabs = tabSnapshot(ctx.pages().map((page) => page.url()));
        const targets =
          p.restoreTabs && savedTabs?.urls.length
            ? savedTabs
            : p.restoreTabs && nativeTabs.urls.length
              ? nativeTabs
              : { urls: startupUrls(p.startUrls), activeIndex: 0 };
        const result = await restoreTabs(
          ctx,
          targets.urls,
          targets.activeIndex,
        );
        if (p.restoreTabs) {
          const tracker = new TabTracker(
            ctx,
            (snapshot) => saveTabs(db, id, snapshot, encryptTabs),
            (message) => sessionNotices.set(id, message),
          );
          tabTrackers.set(id, tracker);
          await tracker.flush();
        }
        if (result.failed)
          sessionNotices.set(
            id,
            "บางแท็บโหลดไม่สำเร็จ แต่เบราว์เซอร์ยังเปิดอยู่ คุณสามารถตรวจเครือข่ายและดำเนินการในหน้าต่างนั้นต่อได้",
          );
        const first = ctx.pages()[0];
        const realEnvironment = await first
          ?.evaluate(() => ({
            userAgent: navigator.userAgent,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenWidth: screen.width,
            screenHeight: screen.height,
          }))
          .catch(() => undefined);
        put("profiles", id, {
          ...p,
          lastOpened: new Date().toISOString(),
          browserVersion: ctx.browser()?.version() || "unknown",
          os: process.platform,
          realEnvironment,
        });
        return {
          version: ctx.browser()?.version(),
          warning: sessionNotices.get(id),
        };
      } catch (error) {
        if (stage === "navigation" && ctx && live.has(id)) {
          const warning = launchFailure(stage, engine, error);
          sessionNotices.set(id, warning);
          if (trackTabs && !tabTrackers.has(id)) {
            const tracker = new TabTracker(
              ctx,
              (snapshot) => saveTabs(db, id, snapshot, encryptTabs),
              (message) => sessionNotices.set(id, message),
            );
            tabTrackers.set(id, tracker);
            await tracker.flush();
          }
          return { warning };
        }
        await ctx?.close();
        throw Error(launchFailure(stage, engine, error));
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
      Object.keys(browserNames).map((key) => {
        const engine = key as Engine;
        try {
          const file = executable(engine);
          return {
            engine,
            name: browserNames[engine],
            available: true,
            path: file,
          };
        } catch (error) {
          return {
            engine,
            name: browserNames[engine],
            available: false,
            reason: error instanceof Error ? error.message : "ไม่พร้อมใช้งาน",
          };
        }
      }),
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
    try {
      const probeId = randomUUID();
      const probe = {
        version: 1 as const,
        urls: ["https://www.facebook.com/"],
        activeIndex: 0,
      };
      saveTabs(db, probeId, probe, encryptTabs);
      if (
        JSON.stringify(loadTabs(db, probeId, decryptTabs)) !==
        JSON.stringify(probe)
      )
        throw Error("Encrypted tab storage roundtrip failed");
      db.prepare("DELETE FROM profile_tabs WHERE profile_id=?").run(probeId);
      const engines: Engine[] = [
        "chromium",
        "firefox",
        ...(["chrome", "msedge"] as const).filter(
          (engine) => !!findWindowsBrowser(engine),
        ),
      ];
      for (const engine of engines) {
        const context = await (
          engine === "firefox" ? firefox : chromium
        ).launchPersistentContext(path.join(root, "smoke-" + engine), {
          headless: true,
          executablePath: executable(engine),
          timeout: 20000,
        });
        try {
          const page = await context.newPage();
          await page.setContent(
            "<title>MasterBrowser packaged browser check</title>",
          );
          if ((await page.title()) !== "MasterBrowser packaged browser check")
            throw Error("Browser page failed");
        } finally {
          await context.close();
        }
        console.log("Packaged browser smoke passed:", engine);
      }
    } catch (error) {
      console.error("Packaged browser smoke test failed:", error);
      app.exit(1);
      return;
    }
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
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void Promise.all([...live.keys()].map(closeProfile)).finally(() =>
    app.quit(),
  );
});
app.on("window-all-closed", () => app.quit());
