import { devicePresets, type DeviceMode } from "./device-presets.js";
import type { BrowserContextOptions } from "playwright";
export type EnvironmentSettings = {
  deviceMode?: DeviceMode;
  locale: string;
  timezone: string;
  width: number;
  height: number;
  screenWidth?: number;
  screenHeight?: number;
  colorScheme?: "system" | "light" | "dark";
  locationMode?: "ask" | "block" | "custom";
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  webrtcPolicy?: "default" | "restrict_udp";
};
export function environmentOptions(
  p: EnvironmentSettings,
): BrowserContextOptions {
  return {
    isMobile: !!p.deviceMode && p.deviceMode !== "desktop",
    hasTouch: !!p.deviceMode && p.deviceMode !== "desktop",
    deviceScaleFactor: devicePresets[p.deviceMode ?? "desktop"].scale,
    locale: p.locale,
    timezoneId: p.timezone,
    viewport: { width: p.width, height: p.height },
    screen: {
      width: p.screenWidth ?? p.width,
      height: p.screenHeight ?? p.height,
    },
    colorScheme:
      p.colorScheme === "system" || !p.colorScheme ? null : p.colorScheme,
    ...(p.locationMode === "custom"
      ? {
          geolocation: {
            latitude: p.latitude!,
            longitude: p.longitude!,
            accuracy: p.accuracy ?? 100,
          },
        }
      : {}),
  };
}
export function startupUrls(urls: string[] | undefined): string[] {
  return urls?.length ? urls : ["https://www.facebook.com/"];
}
