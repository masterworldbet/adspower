import { z } from "zod";
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    deviceMode: z.enum(["desktop", "android", "iphone"]).default("desktop"),
    engine: z.enum(["chromium", "chrome", "msedge", "firefox"]),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    width: z.number().int().min(320).max(7680),
    height: z.number().int().min(480).max(4320),
    notes: z.string().max(4000),
    tags: z.string().max(500),
    group: z.string().max(100),
    proxyId: z.string().uuid().nullable(),
    randomProxy: z.boolean(),
    vpnName: z.string().max(200).default(""),
    accountLabel: z.string().max(200).default(""),
    screenWidth: z.number().int().min(320).max(7680).optional(),
    screenHeight: z.number().int().min(480).max(4320).optional(),
    colorScheme: z.enum(["system", "light", "dark"]).default("system"),
    locationMode: z.enum(["ask", "block", "custom"]).default("ask"),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).max(10000).default(100),
    webrtcPolicy: z.enum(["default", "restrict_udp"]).default("default"),
    startUrls: z
      .array(
        z
          .string()
          .url()
          .max(2000)
          .refine((value) => {
            try {
              const url = new URL(value);
              return (
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                (!url.port || url.port === "443") &&
                (url.hostname === "facebook.com" ||
                  url.hostname.endsWith(".facebook.com"))
              );
            } catch {
              return false;
            }
          }, "รองรับเฉพาะ HTTPS ของ Facebook"),
      )
      .max(10)
      .default(["https://www.facebook.com/"]),
  })
  .superRefine((p, ctx) => {
    if (p.deviceMode === "desktop" && p.width < 640)
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: "Desktop ต้องกว้างอย่างน้อย 640px",
      });
    if (p.deviceMode !== "desktop" && p.engine === "firefox")
      ctx.addIssue({
        code: "custom",
        path: ["deviceMode"],
        message: "Mobile Emulation รองรับ Chromium / Chrome / Edge เท่านั้น",
      });
    if ((p.screenWidth ?? p.width) < p.width)
      ctx.addIssue({
        code: "custom",
        path: ["screenWidth"],
        message: "Screen ต้องไม่น้อยกว่า Viewport",
      });
    if ((p.screenHeight ?? p.height) < p.height)
      ctx.addIssue({
        code: "custom",
        path: ["screenHeight"],
        message: "Screen ต้องไม่น้อยกว่า Viewport",
      });
    if (
      p.locationMode === "custom" &&
      (p.latitude === undefined || p.longitude === undefined)
    )
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "กรุณาระบุละติจูดและลองจิจูด",
      });
    if (p.webrtcPolicy === "restrict_udp" && p.engine === "firefox")
      ctx.addIssue({
        code: "custom",
        path: ["webrtcPolicy"],
        message: "จำกัด WebRTC UDP รองรับ Chromium/Chrome/Edge เท่านั้น",
      });
  });
