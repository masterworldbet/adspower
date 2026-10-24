import { test } from "node:test";
import assert from "node:assert/strict";
import { firefox, chromium } from "playwright";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
test("tabbed editor validates and saves settings with a synchronized summary", async () => {
  const server = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw Error("Missing UI server");
  const engine =
    process.env.BROWSER_TEST_ENGINE === "firefox" ? firefox : chromium;
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1560, height: 1000 },
    });
    await page.addInitScript({
      content: `(() => {
      const state={profiles:[],proxies:[{id:'f27ac10b-58cc-4372-a567-0e02b2c3d479',name:'Test proxy',protocol:'http',host:'127.0.0.1',port:8080,status:'available'}],appVersion:'test'};
      window.masterbrowser={invoke:async function(action,arg){
        if(action==='list')return {ok:true,value:state};
        if(action==='vpn.status')return {ok:true,value:{supported:true,connections:[]}};
        if(action==='browsers')return {ok:true,value:[{engine:'chromium',available:true,name:'Chromium'}]};
        if(action==='profile.save'){state.profiles.push({...arg.data,id:'test-profile',status:'stopped'});return {ok:true,value:'test-profile'};}
        return {ok:false,error:'Unexpected test IPC: '+action};
      }};
    })();`,
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    assert.equal(
      await page.evaluate(() => typeof (window as any).masterbrowser?.invoke),
      "function",
    );
    await page.getByRole("button", { name: "＋ สร้างโปรไฟล์" }).click();
    await page
      .getByLabel("ชื่อโปรไฟล์", { exact: true })
      .fill("UI settings check");
    assert.ok(
      await page
        .locator(".profile-summary")
        .innerText()
        .then((s) => s.includes("UI settings check")),
    );
    await page.getByRole("tab", { name: "สภาพแวดล้อม", exact: true }).click();
    await page
      .getByRole("button", { name: "1920 × 1080", exact: true })
      .click();
    await page.getByRole("button", { name: "มืด", exact: true }).click();
    await page.getByRole("button", { name: "กำหนดพิกัด", exact: true }).click();
    await page.getByLabel("ละติจูด", { exact: true }).fill("13.75");
    await page.getByLabel("ลองจิจูด", { exact: true }).fill("100.5");
    await page.getByRole("tab", { name: "Facebook", exact: true }).click();
    await page
      .getByLabel("URL เริ่มต้น", { exact: true })
      .fill("https://example.org");
    await page
      .getByRole("button", { name: "บันทึกโปรไฟล์", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "startUrls" }).waitFor();
    await page
      .getByLabel("URL เริ่มต้น", { exact: true })
      .fill("https://www.facebook.com/\nhttps://m.facebook.com/friends/");
    await page.getByRole("tab", { name: "พร็อกซี / VPN", exact: true }).click();
    await page
      .getByRole("button", { name: "⤨ สุ่ม Proxy ตอนนี้", exact: true })
      .click();
    await page.getByRole("tab", { name: "ทั่วไป", exact: true }).click();
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: process.env.UI_SCREENSHOT_DIR + "/profile-editor.png",
      });
    }
    await page
      .getByRole("button", { name: "บันทึกโปรไฟล์", exact: true })
      .click();
    await page.waitForTimeout(250);
    const errors = await page
      .locator('.profile-editor [role="alert"]')
      .allTextContents();
    assert.deepEqual(
      errors,
      [],
      `Editor validation error: ${errors.join("; ")}`,
    );
    await page.locator(".profile-editor").waitFor({ state: "detached" });
    const saved = await page.evaluate(
      async () =>
        (await (window as any).masterbrowser.invoke("list")).value.profiles[0],
    );
    assert.equal(saved.width, 1920);
    assert.equal(saved.screenHeight, 1080);
    assert.equal(saved.colorScheme, "dark");
    assert.equal(saved.latitude, 13.75);
    assert.equal(saved.startUrls.length, 2);
    assert.equal(saved.proxyId, "f27ac10b-58cc-4372-a567-0e02b2c3d479");
  } finally {
    await browser.close();
    server.httpServer?.closeAllConnections();
    await server.close();
  }
});
