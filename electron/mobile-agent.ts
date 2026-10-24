/** Standard mobile web emulation; does not hide automation or bypass site checks. */
export function mobileUserAgent(
  engine: "chromium" | "chrome" | "msedge",
  version: string,
): string {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version))
    throw Error("อ่านเวอร์ชัน Engine สำหรับ Mobile Emulation ไม่สำเร็จ");
  return `Mozilla/5.0 (Linux; Android 13; Mobile Emulation) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Mobile Safari/537.36${engine === "msedge" ? ` EdgA/${version}` : ""}`;
}
