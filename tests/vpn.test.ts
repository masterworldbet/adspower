import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVpnOutput,
  validateVpnSelection,
  vpnStatus,
} from "../electron/vpn.js";
test("Windows VPN output handles zero, single and multiple connections", () => {
  assert.deepEqual(normalizeVpnOutput(""), []);
  assert.deepEqual(
    normalizeVpnOutput('{"Name":"Personal","ConnectionStatus":"Connected"}'),
    [{ Name: "Personal", ConnectionStatus: "Connected" }],
  );
  assert.equal(
    normalizeVpnOutput(
      '[{"Name":"A","ConnectionStatus":"Connecting"},{"Name":"A","ConnectionStatus":"Connecting"}]',
    )[0]!.ConnectionStatus,
    "Unknown",
  );
});
test("VPN commands accept only enumerated connections and reject flags", () => {
  const connections = [
    { Name: "Office VPN", ConnectionStatus: "Disconnected" as const },
  ];
  assert.equal(validateVpnSelection("Office VPN", connections), "Office VPN");
  assert.throws(() => validateVpnSelection("/disconnect", connections));
  assert.throws(() => validateVpnSelection("Unknown", connections));
  assert.throws(() => normalizeVpnOutput("not json"));
});
test("non-Windows VPN status reports unsupported without invoking Windows commands", async () => {
  if (process.platform === "win32") return;
  const state = await vpnStatus();
  assert.equal(state.supported, false);
  assert.deepEqual(state.connections, []);
});
