import path from "node:path";
import { existsSync } from "node:fs";
export const browserNames = {
  chromium: "Chromium",
  firefox: "Firefox",
  chrome: "Google Chrome",
  msedge: "Microsoft Edge",
} as const;
export type Engine = keyof typeof browserNames;
export class BrowserUnavailable extends Error {}
export function findWindowsBrowser(
  engine: "chrome" | "msedge",
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = existsSync,
): string | undefined {
  const relative =
    engine === "chrome"
      ? "Google/Chrome/Application/chrome.exe"
      : "Microsoft/Edge/Application/msedge.exe";
  const roots = [
    env.PROGRAMW6432,
    env.ProgramW6432,
    env.PROGRAMFILES,
    env.ProgramFiles,
    env["PROGRAMFILES(X86)"],
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA,
    env.LocalAppData,
  ].filter((v): v is string => !!v);
  return [...new Set(roots)]
    .map((root) => path.win32.join(root, relative))
    .find(exists);
}
export function requireExecutable(
  engine: Engine,
  file: string | undefined,
  exists: (file: string) => boolean = existsSync,
): string {
  if (!file || !exists(file))
    throw new BrowserUnavailable(
      `ไม่พบ ${browserNames[engine]} บนเครื่องนี้${engine === "chrome" || engine === "msedge" ? " กรุณาติดตั้งเบราว์เซอร์นี้ หรือเลือก Chromium/Firefox ที่มากับ MasterBrowser" : " กรุณาแตก ZIP ทั้งหมด รวมโฟลเดอร์ resources/browsers หรือใช้ตัวติดตั้งรุ่นใหม่"}`,
    );
  return file;
}
export type LaunchStage =
  "configuration" | "preflight" | "launch" | "navigation";
export function launchFailure(
  stage: LaunchStage,
  engine: Engine,
  error: unknown,
): string {
  if (error instanceof BrowserUnavailable) return error.message;
  const messages = {
    configuration:
      "ตรวจการตั้งค่า VPN และ Proxy: VPN ที่เลือกต้อง Connected และการสุ่มต้องมี Proxy ที่ผ่านการทดสอบ",
    preflight:
      "ตรวจ Public IP ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตหรือ Proxy และการเข้าถึง api.ipify.org ไม่มีการสลับเป็น Direct อัตโนมัติ",
    launch: `เปิด ${browserNames[engine]} ไม่สำเร็จ กรุณาปิดเบราว์เซอร์ของโปรไฟล์นี้ที่ค้างอยู่ แล้วลองอีกครั้ง หากยังล้มเหลวให้ส่งภาพ Browser Settings`,
    navigation:
      "เปิดเบราว์เซอร์ได้ แต่เชื่อมต่อ Facebook ไม่สำเร็จ กรุณาตรวจเครือข่ายหรือ Proxy",
  };
  return messages[stage];
}
