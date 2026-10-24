import { z } from "zod";
import { isIP } from "node:net";
export { profileSchema } from "./profile-schema.js";
export const proxySchema = z
  .object({
    name: z.string().min(1).max(100),
    protocol: z.enum(["http", "https", "socks5"]),
    host: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .refine(
        (value) =>
          isIP(value) === 4 ||
          (!/^[0-9.]+$/.test(value) &&
            value
              .split(".")
              .every((label) =>
                /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
              )),
        { message: "Invalid proxy hostname" },
      ),
    port: z.number().int().min(1).max(65535),
    username: z.string().max(500),
    password: z.string().max(500),
  })
  .refine((v) => v.protocol !== "socks5" || (!v.username && !v.password), {
    message: "SOCKS5 authentication is not supported",
  });
export const idSchema = z.string().uuid();
export function chooseProxy<T extends { id: string; status: string }>(
  items: T[],
  random = Math.random,
): T {
  const valid = items.filter((p) => p.status === "available");
  if (!valid.length)
    throw new Error("ไม่มี Proxy ที่ผ่านการทดสอบ — ยกเลิกการเปิด");
  return valid[Math.floor(random() * valid.length)]!;
}
