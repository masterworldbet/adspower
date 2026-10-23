import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
const execute = promisify(execFile);
export type VpnConnection = {
  Name: string;
  ConnectionStatus: "Connected" | "Disconnected" | "Unknown";
};
export function normalizeVpnOutput(output: string): VpnConnection[] {
  const raw: unknown = output.trim() ? JSON.parse(output) : [];
  const values = z
    .array(z.object({ Name: z.string().min(1), ConnectionStatus: z.string() }))
    .parse(Array.isArray(raw) ? raw : [raw]);
  return [
    ...new Map(
      values.map((v) => [
        v.Name,
        {
          Name: v.Name,
          ConnectionStatus: (["Connected", "Disconnected"].includes(
            v.ConnectionStatus,
          )
            ? v.ConnectionStatus
            : "Unknown") as VpnConnection["ConnectionStatus"],
        },
      ]),
    ).values(),
  ];
}
export async function vpnStatus() {
  if (process.platform !== "win32")
    return {
      supported: false,
      connections: [] as VpnConnection[],
      message: "Windows VPN ต้องตรวจสอบบน Windows เท่านั้น",
    };
  const { stdout } = await execute(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; $items=@(Get-VpnConnection); try { $items+=@(Get-VpnConnection -AllUserConnection) } catch {}; $items | Select-Object Name,@{Name='ConnectionStatus';Expression={$_.ConnectionStatus.ToString()}} | ConvertTo-Json -Compress",
    ],
    { timeout: 15000, windowsHide: true },
  );
  return {
    supported: true,
    connections: normalizeVpnOutput(stdout),
    message:
      "VPN มีผลต่อทั้งเครื่อง เชื่อมต่ออัตโนมัติได้เฉพาะ Connection ที่มีข้อมูลรับรองและรองรับ rasdial",
  };
}
export function validateVpnSelection(
  name: unknown,
  connections: VpnConnection[],
): string {
  const selected = z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !v.startsWith("/") && !/[\r\n\0]/.test(v))
    .parse(name);
  if (!connections.some((c) => c.Name === selected))
    throw Error("ไม่พบ VPN Connection ที่เลือก");
  return selected;
}
export async function changeVpn(name: unknown, connect: boolean) {
  const before = await vpnStatus();
  if (!before.supported) throw Error("รองรับ Windows เท่านั้น");
  const selected = validateVpnSelection(name, before.connections);
  try {
    await execute(
      "rasdial.exe",
      connect ? [selected] : [selected, "/disconnect"],
      { timeout: 45000, windowsHide: true },
    );
  } catch {
    throw Error(
      "Windows ไม่สามารถเปลี่ยนการเชื่อมต่อได้ กรุณาใช้ Windows VPN Settings และข้อมูลรับรองที่บันทึกไว้",
    );
  }
  const after = await vpnStatus();
  const connection = after.connections.find((c) => c.Name === selected);
  if (connection?.ConnectionStatus !== (connect ? "Connected" : "Disconnected"))
    throw Error("ยังยืนยันสถานะ VPN ไม่ได้ กรุณาตรวจ Windows Settings");
  return after;
}
