import { test } from "node:test";
import assert from "node:assert/strict";
import { profileSchema } from "../electron/schema.js";
import { environmentOptions, startupUrls } from "../electron/environment.js";
const base = {
  name: "Profile",
  engine: "chromium",
  locale: "th-TH",
  timezone: "Asia/Bangkok",
  width: 1280,
  height: 800,
  notes: "",
  tags: "",
  group: "",
  proxyId: null,
  randomProxy: false,
};
test("old profile settings gain safe defaults without losing session identity", () => {
  const p = profileSchema.parse(base);
  assert.equal(p.locationMode, "ask");
  assert.equal(p.webrtcPolicy, "default");
  assert.deepEqual(p.startUrls, ["https://www.facebook.com/"]);
  assert.deepEqual(environmentOptions(p).screen, { width: 1280, height: 800 });
});
test("screen cannot be smaller than viewport and location requires complete valid coordinates", () => {
  assert.equal(
    profileSchema.safeParse({ ...base, screenWidth: 800 }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...base, locationMode: "custom", latitude: 13 })
      .success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...base,
      locationMode: "custom",
      latitude: 91,
      longitude: 100,
    }).success,
    false,
  );
});
test("custom environment reaches actual launch options", () => {
  const p = profileSchema.parse({
    ...base,
    screenWidth: 1920,
    screenHeight: 1080,
    colorScheme: "dark",
    locationMode: "custom",
    latitude: 13.75,
    longitude: 100.5,
    accuracy: 50,
  });
  const options = environmentOptions(p);
  assert.deepEqual(options.geolocation, {
    latitude: 13.75,
    longitude: 100.5,
    accuracy: 50,
  });
  assert.equal(options.colorScheme, "dark");
  assert.deepEqual(options.screen, { width: 1920, height: 1080 });
});
test("startup URLs allow only HTTPS Facebook pages and reject credentials and lookalikes", () => {
  for (const url of [
    "http://facebook.com",
    "https://facebook.com.evil.example",
    "https://evilfacebook.com",
    "https://name:secret@facebook.com",
    "file:///C:/Windows",
    "https://facebook.com:444/",
  ])
    assert.equal(
      profileSchema.safeParse({ ...base, startUrls: [url] }).success,
      false,
    );
  assert.equal(
    profileSchema.safeParse({
      ...base,
      startUrls: ["https://m.facebook.com/friends/"],
    }).success,
    true,
  );
  assert.deepEqual(startupUrls([]), ["https://www.facebook.com/"]);
});
test("unsupported Firefox WebRTC policy is rejected rather than pretending to apply", () => {
  assert.equal(
    profileSchema.safeParse({
      ...base,
      engine: "firefox",
      webrtcPolicy: "restrict_udp",
    }).success,
    false,
  );
});
test("mobile presets enable actual viewport, touch and pixel ratio without a Safari UA override", () => {
  for (const deviceMode of ["android", "iphone"] as const) {
    const p = profileSchema.parse({
      ...base,
      deviceMode,
      width: 390,
      height: 844,
    });
    const options = environmentOptions(p);
    assert.equal(options.isMobile, true);
    assert.equal(options.hasTouch, true);
    assert.ok(options.deviceScaleFactor! > 1);
    assert.equal(options.userAgent, undefined);
  }
  assert.equal(
    profileSchema.safeParse({
      ...base,
      deviceMode: "iphone",
      engine: "firefox",
    }).success,
    false,
  );
  assert.equal(profileSchema.parse(base).deviceMode, "desktop");
});

import { mobileUserAgent } from "../electron/mobile-agent.js";
test("mobile UA is derived from the actual engine version and never affects desktop", () => {
  const agent = mobileUserAgent("chromium", "156.0.8078.4");
  assert.ok(agent.includes("Chrome/156.0.8078.4"));
  assert.ok(agent.includes("Android"));
  assert.ok(agent.includes(" Mobile "));
  assert.equal(
    environmentOptions({ ...base, deviceMode: "android" }, agent).userAgent,
    agent,
  );
  assert.equal(
    environmentOptions({ ...base, deviceMode: "desktop" }, agent).userAgent,
    undefined,
  );
  assert.throws(() => mobileUserAgent("chrome", "invalid\nversion"));
});
