import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findWindowsBrowser,
  requireExecutable,
  launchFailure,
} from "../electron/browsers.js";
test("finds Edge in 32-bit Program Files and Chrome in local install", () => {
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  assert.equal(
    findWindowsBrowser(
      "msedge",
      { "ProgramFiles(x86)": "C:\\Program Files (x86)" },
      (p) => p === edge,
    ),
    edge,
  );
  const chrome =
    "C:\\Users\\person\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
  assert.equal(
    findWindowsBrowser(
      "chrome",
      { LOCALAPPDATA: "C:\\Users\\person\\AppData\\Local" },
      (p) => p === chrome,
    ),
    chrome,
  );
});
test("missing binary produces actionable error and never substitutes another engine", () => {
  assert.equal(
    findWindowsBrowser("msedge", {}, () => false),
    undefined,
  );
  assert.throws(
    () => requireExecutable("firefox", "missing", () => false),
    /resources\/browsers/,
  );
  assert.throws(() => requireExecutable("msedge", undefined), /Microsoft Edge/);
});
test("launch failure identifies stage without exposing proxy credentials", () => {
  const secret = new Error("http://user:password@proxy.example");
  for (const stage of [
    "configuration",
    "preflight",
    "launch",
    "navigation",
  ] as const)
    assert.ok(!launchFailure(stage, "msedge", secret).includes("password"));
  assert.match(launchFailure("preflight", "msedge", secret), /api.ipify.org/);
  assert.match(launchFailure("navigation", "msedge", secret), /Facebook/);
});
