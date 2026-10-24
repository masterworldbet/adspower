import type { BrowserContext, Page } from "playwright";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
export type TabSnapshot = { version: 1; urls: string[]; activeIndex: number };
const snapshotSchema = z.object({
  version: z.literal(1),
  urls: z.array(z.string().max(8192)).max(100),
  activeIndex: z.number().int().min(0).max(99),
});
export function restorableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 8192 &&
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function tabSnapshot(urls: string[], activeIndex = 0): TabSnapshot {
  const entries = urls
    .map((url, index) => ({ url, index }))
    .filter(({ url }) => restorableUrl(url))
    .slice(0, 100);
  const active = entries.findIndex((entry) => entry.index === activeIndex);
  return {
    version: 1,
    urls: entries.map((e) => e.url),
    activeIndex: active < 0 ? 0 : active,
  };
}
export function saveTabs(
  db: DatabaseSync,
  id: string,
  snapshot: TabSnapshot,
  encrypt: (value: string) => string,
) {
  const clean = tabSnapshot(snapshot.urls, snapshot.activeIndex);
  if (!clean.urls.length) return;
  db.prepare(
    "INSERT OR REPLACE INTO profile_tabs(profile_id,data,saved_at) VALUES (?,?,?)",
  ).run(id, encrypt(JSON.stringify(clean)), new Date().toISOString());
}
export function loadTabs(
  db: DatabaseSync,
  id: string,
  decrypt: (value: string) => string,
): TabSnapshot | undefined {
  const row = db
    .prepare("SELECT data FROM profile_tabs WHERE profile_id=?")
    .get(id) as { data: string } | undefined;
  if (!row) return;
  const parsed = snapshotSchema.parse(JSON.parse(decrypt(row.data)));
  return tabSnapshot(parsed.urls, parsed.activeIndex);
}
export async function restoreTabs(
  context: BrowserContext,
  urls: string[],
  activeIndex = 0,
): Promise<{ failed: number }> {
  const targets = tabSnapshot(urls, activeIndex);
  if (!targets.urls.length) return { failed: 0 };
  const existing = context.pages();
  let failed = 0;
  const opened: Page[] = [];
  // Reuse existing browser-restored pages by position; do not append startup tabs.
  for (let i = 0; i < targets.urls.length; i++) {
    const page =
      existing[i] && !existing[i]!.isClosed()
        ? existing[i]!
        : await context.newPage();
    opened.push(page);
    if (page.url() === targets.urls[i]) continue;
    try {
      await page.goto(targets.urls[i]!, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
    } catch {
      failed++;
    }
  }
  // Close surplus pages only after replacements have been opened.
  for (const page of existing.slice(targets.urls.length))
    try {
      await page.close();
    } catch {
      /* Already closed by the user. */
    }
  try {
    await opened[
      Math.min(targets.activeIndex, opened.length - 1)
    ]?.bringToFront();
  } catch {
    /* Window may be closing. */
  }
  return { failed };
}
async function isVisible(page: Page): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      page
        .evaluate(() => document.visibilityState === "visible")
        .catch(() => false),
      new Promise<boolean>((r) => {
        timer = setTimeout(() => r(false), 300);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export class TabTracker {
  private stopped = false;
  private pending?: ReturnType<typeof setTimeout>;
  private interval: ReturnType<typeof setInterval>;
  private writing?: Promise<void>;
  private last = "";
  constructor(
    private context: BrowserContext,
    private persist: (snapshot: TabSnapshot) => void,
    private warn: (message: string) => void = () => {},
  ) {
    const watch = (page: Page) => {
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) this.schedule();
      });
      page.on("domcontentloaded", () => this.schedule());
      page.on("close", () => this.schedule());
    };
    context.pages().forEach(watch);
    context.on("page", (page) => {
      watch(page);
      this.schedule();
    });
    context.once("close", () => this.stop());
    this.interval = setInterval(() => this.schedule(), 2500);
    this.interval.unref();
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.flush();
    }, 250);
    this.pending.unref();
  }
  async flush() {
    if (this.writing) await this.writing;
    if (this.stopped) return;
    this.writing = (async () => {
      try {
        const pages = this.context.pages().filter((p) => !p.isClosed());
        const visible = await Promise.all(pages.map(isVisible));
        if (this.stopped) return;
        const snapshot = tabSnapshot(
          pages.map((p) => p.url()),
          Math.max(0, visible.findIndex(Boolean)),
        );
        const serialized = JSON.stringify(snapshot);
        if (snapshot.urls.length && serialized !== this.last) {
          this.persist(snapshot);
          this.last = serialized;
        }
      } catch {
        this.warn(
          "บันทึกแท็บล่าสุดไม่สำเร็จ กรุณาตรวจพื้นที่ดิสก์และการเข้ารหัสของ Windows",
        );
      }
    })();
    await this.writing;
    this.writing = undefined;
  }
  async prepareClose() {
    await this.flush();
    this.stop();
  }
  stop() {
    this.stopped = true;
    if (this.pending) clearTimeout(this.pending);
    clearInterval(this.interval);
  }
}
