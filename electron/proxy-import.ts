import { proxySchema } from "./schema.js";
export function parseProxyList(text: string) {
  if (text.length > 1_000_000) throw Error("รายการใหญ่เกินไป");
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 1000) throw Error("สูงสุด 1,000 รายการ");
  return lines.map((line, i) => {
    let url: URL;
    try {
      url = new URL(line.includes("://") ? line : `http://${line}`);
    } catch {
      throw Error(`รูปแบบ Proxy ผิดที่บรรทัด ${i + 1}`);
    }
    if ((url.pathname && url.pathname !== "/") || url.search || url.hash)
      throw Error(`Proxy URL ต้องไม่มี path/query/fragment (บรรทัด ${i + 1})`);
    return proxySchema.parse({
      name: `Proxy ${i + 1}`,
      protocol: url.protocol.slice(0, -1),
      host: url.hostname,
      port: Number(
        url.port ||
          (url.protocol === "https:"
            ? 443
            : url.protocol === "socks5:"
              ? 1080
              : 80),
      ),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    });
  });
}
