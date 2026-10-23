import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Item = Record<string, any>;
declare global {
  interface Window {
    masterbrowser?: { invoke: (action: string, arg?: unknown) => Promise<any> };
  }
}
const defaults = {
  name: "",
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
  vpnName: "",
};
function App() {
  const [page, setPage] = useState("Facebook Profiles"),
    [data, setData] = useState<{
      profiles: Item[];
      proxies: Item[];
      appVersion?: string;
    }>({
      profiles: [],
      proxies: [],
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [form, setForm] = useState<Item | null>(null),
    [proxy, setProxy] = useState<Item | null>(null),
    [vpn, setVpn] = useState<Item | null>(null),
    [browsers, setBrowsers] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [selectedVpn, setSelectedVpn] = useState(""),
    [importText, setImportText] = useState<string | null>(null);
  async function call(action: string, arg?: unknown) {
    if (!window.masterbrowser)
      throw Error("กรุณาเปิดผ่าน Electron ด้วย npm run desktop");
    const r = await window.masterbrowser.invoke(action, arg);
    if (!r.ok) throw Error(r.error);
    return r.value;
  }
  async function refresh() {
    setData(await call("list"));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run(refresh);
    const timer = setInterval(() => {
      if (window.masterbrowser) void refresh().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  const nav = [
    "Dashboard",
    "Facebook Profiles",
    "Proxy Manager",
    "VPN Manager",
    "Browser Settings",
    "Backup / Restore",
    "Settings",
  ];
  return (
    <div className="layout">
      <aside>
        <div className="brand">◈ MasterBrowser</div>
        <small>PERSONAL WORKSPACE</small>
        {nav.map((n) => (
          <button
            className={page === n ? "selected" : ""}
            key={n}
            onClick={() => {
              setPage(n);
              if (n === "VPN Manager")
                void run(async () => setVpn(await call("vpn.status")));
              if (n === "Browser Settings")
                void run(async () => setBrowsers(await call("browsers")));
            }}
          >
            {n}
          </button>
        ))}
        <footer>
          ข้อมูลอยู่บนเครื่องของคุณ
          <br />
          Windows 10 / 11 <small>MasterBrowser {data.appVersion || ""}</small>
        </footer>
      </aside>
      <main>
        <header>
          <div>
            <small>MASTERBROWSER / WORKSPACE</small>
            <h1>{page}</h1>
          </div>
          <span className="badge">LOCAL ONLY</span>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
        {!window.masterbrowser && (
          <div className="notice">
            หน้าเว็บสำหรับตรวจ UI เท่านั้น ฟังก์ชันระบบต้องเปิดผ่าน Electron
          </div>
        )}
        {page === "Dashboard" && (
          <>
            <div className="cards">
              {[
                ["โปรไฟล์ทั้งหมด", data.profiles.length],
                [
                  "กำลังทำงาน",
                  data.profiles.filter((p) => p.status === "running").length,
                ],
                [
                  "Proxy พร้อมใช้",
                  data.proxies.filter((p) => p.status === "available").length,
                ],
              ].map(([k, v]) => (
                <section key={k}>
                  <small>{k}</small>
                  <h2>{v}</h2>
                </section>
              ))}
            </div>
            <section>
              <h2>พื้นที่ทำงานส่วนตัว</h2>
              <p>
                จัดการ Session แยกแต่ละโปรไฟล์ เปิด Facebook ด้วยเบราว์เซอร์จริง
                ไม่มีระบบปลอม Fingerprint
              </p>
            </section>
          </>
        )}
        {page === "Facebook Profiles" && (
          <>
            <div className="toolbar">
              <p>{data.profiles.length} โปรไฟล์ · Session แยกจากกัน</p>
              <button
                disabled={busy}
                onClick={() => {
                  setForm({ ...defaults });
                  void run(async () => setVpn(await call("vpn.status")));
                }}
              >
                ＋ สร้างโปรไฟล์
              </button>
            </div>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    {[
                      "ชื่อ / กลุ่ม",
                      "Browser",
                      "Proxy",
                      "Public IP",
                      "ประเทศ",
                      "สถานะ",
                      "เปิดล่าสุด",
                      "จัดการ",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.profiles.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <small>
                          {p.group} {p.tags}
                        </small>
                      </td>
                      <td>
                        {p.engine}
                        <small>
                          {p.browserVersion || "ยังไม่เปิด"} {p.os || ""}
                        </small>
                      </td>
                      <td>
                        {p.proxyId
                          ? data.proxies.find((x) => x.id === p.proxyId)?.name
                          : "Direct"}
                      </td>
                      <td>{p.ip || "ยังไม่ได้ตรวจ"}</td>
                      <td>ไม่ทราบ</td>
                      <td>
                        <span className="badge">{p.status}</span>
                      </td>
                      <td>
                        {p.lastOpened
                          ? new Date(p.lastOpened).toLocaleString("th-TH")
                          : "—"}
                      </td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await call(
                                p.status === "running"
                                  ? "profile.close"
                                  : "profile.open",
                                p.id,
                              );
                            })
                          }
                        >
                          {p.status === "running" ? "ปิด" : "เปิด"}
                        </button>
                        <button
                          disabled={busy || p.status !== "stopped"}
                          onClick={() => {
                            setForm({ ...p });
                            void run(async () =>
                              setVpn(await call("vpn.status")),
                            );
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await call("profile.duplicate", p.id);
                            })
                          }
                        >
                          สำเนา
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "ลบการตั้งค่าโปรไฟล์? ข้อมูล Session จะยังเก็บไว้บนเครื่อง",
                              )
                            )
                              void run(async () => {
                                await call("profile.delete", p.id);
                              });
                          }}
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.profiles.length && (
                <div className="empty">
                  ◈<h2>เริ่มต้นด้วยโปรไฟล์แรก</h2>
                  <p>สร้างพื้นที่เบราว์เซอร์แยกสำหรับบัญชีของคุณ</p>
                </div>
              )}
            </div>
          </>
        )}
        {page === "Proxy Manager" && (
          <>
            <div className="toolbar">
              <p>ใช้เฉพาะ Proxy ที่คุณมีสิทธิ์ใช้งาน</p>
              <button
                onClick={() =>
                  setProxy({
                    name: "",
                    protocol: "http",
                    host: "",
                    port: 8080,
                    username: "",
                    password: "",
                  })
                }
              >
                ＋ เพิ่ม Proxy
              </button>
              <button onClick={() => setImportText("")}>
                นำเข้า Proxy List
              </button>
            </div>
            <section>
              {data.proxies.length === 0 && <p>ยังไม่มี Proxy</p>}
              {data.proxies.map((p) => (
                <article key={p.id}>
                  <strong>{p.name}</strong> {p.protocol}://{p.host}:{p.port}{" "}
                  <span className="badge">{p.status}</span> {p.ip}{" "}
                  {p.latency ? `${p.latency} ms` : ""}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call("proxy.test", p.id);
                      })
                    }
                  >
                    ทดสอบ IP
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await call("proxy.delete", p.id);
                      })
                    }
                  >
                    ลบ
                  </button>
                </article>
              ))}
            </section>
            <p>
              รหัสผ่านเข้ารหัสด้วย Electron safeStorage · SOCKS5
              ไม่รองรับรหัสผ่าน
            </p>
          </>
        )}
        {page === "VPN Manager" && (
          <section>
            <h2>Windows VPN</h2>
            <p>VPN มีผลต่อทั้งเครื่องและทุกโปรไฟล์ ไม่ใช่ VPN รายโปรไฟล์</p>
            <p>{vpn?.message}</p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setMessage("Public IP ขณะนี้: " + (await call("network.ip"))),
                )
              }
            >
              ตรวจ Public IP ก่อน / หลังเชื่อมต่อ
            </button>
            <label>
              เลือก VPN Connection
              <select
                value={selectedVpn}
                onChange={(e) => setSelectedVpn(e.target.value)}
              >
                <option value="">เลือกการเชื่อมต่อ</option>
                {vpn?.connections?.map((c: Item) => (
                  <option key={c.Name} value={c.Name}>
                    {c.Name}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !vpn?.connections?.length}
              onClick={() => {
                const list = vpn!.connections;
                setSelectedVpn(
                  list[Math.floor(Math.random() * list.length)].Name,
                );
              }}
            >
              สุ่มจาก VPN ที่ตั้งค่าไว้
            </button>
            {["connect", "disconnect"].map((action) => (
              <button
                key={action}
                disabled={busy || !vpn?.supported || !selectedVpn}
                onClick={() => {
                  if (
                    !confirm(
                      "การเปลี่ยน VPN มีผลต่อทั้งเครื่องและทุกโปรไฟล์ ต้องการดำเนินการหรือไม่?",
                    )
                  )
                    return;
                  void run(async () => {
                    const before = await call("network.ip").catch(
                      () => "ตรวจไม่ได้",
                    );
                    setVpn(await call("vpn." + action, selectedVpn));
                    const after = await call("network.ip").catch(
                      () => "ตรวจไม่ได้",
                    );
                    setMessage(
                      `VPN ${selectedVpn}: IP ก่อน ${before} → หลัง ${after} (IP เท่าเดิมไม่ได้ยืนยันว่า VPN ล้มเหลว)`,
                    );
                  });
                }}
              >
                {action === "connect" ? "เชื่อมต่อ VPN" : "ตัดการเชื่อมต่อ VPN"}
              </button>
            ))}
            {vpn?.connections?.map((c: Item) => (
              <article key={c.Name}>
                {c.Name} · {c.ConnectionStatus}
              </article>
            ))}
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setVpn(await call("vpn.status")))
              }
            >
              ตรวจสถานะ
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await call("vpn.settings");
                })
              }
            >
              เปิด Windows VPN Settings
            </button>
            <p>
              หากเชื่อมต่ออัตโนมัติไม่ได้ ให้ใช้ Windows Settings
              แอปไม่รับหรือส่งรหัสผ่าน VPN ผ่าน Command Line
            </p>
          </section>
        )}
        {page === "Browser Settings" && (
          <section>
            <h2>เบราว์เซอร์บนเครื่อง</h2>
            {browsers.map((b) => (
              <article key={b.engine}>
                {b.name || b.engine} ·{" "}
                {b.available ? "พร้อมใช้งาน" : "ไม่พร้อมใช้งาน"}
                <small>{b.available ? b.path : b.reason}</small>
              </article>
            ))}
            <p>
              รุ่น 0.3.0 รวม Chromium / Firefox มาในโปรแกรมแล้ว กรุณาแตก ZIP
              ทั้งหมดให้ครบ
              <br />
              Chrome / Edge ใช้ที่ติดตั้งบน Windows
            </p>
            <p>
              ใช้ User-Agent และ OS จริงจากเบราว์เซอร์ ไม่มีการจำลองฮาร์ดแวร์
            </p>
          </section>
        )}
        {page === "Backup / Restore" && (
          <section>
            <h2>สำรองการตั้งค่า</h2>
            <p>
              ไฟล์ JSON รวมการตั้งค่าโปรไฟล์เท่านั้น ไม่รวม Cookies, Session
              และข้อมูลรับรอง Proxy การนำเข้าสร้าง ID ใหม่และใช้ Direct
              Connection
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setMessage(await call("backup")))
              }
            >
              ส่งออกการตั้งค่า
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setMessage(await call("restore")))
              }
            >
              นำเข้าการตั้งค่า
            </button>
          </section>
        )}
        {page === "Settings" && (
          <section>
            <h2>ความปลอดภัยและขอบเขต</h2>
            <p>
              SQLite และ Session เก็บใน AppData ของผู้ใช้ ไม่มี Cloud, Login
              หรือ Subscription
            </p>
            <p>
              Proxy ที่ตั้งไว้ต้องผ่าน IP preflight ก่อนเปิด Facebook
              หากล้มเหลวจะไม่สลับไป Direct
            </p>
            <p>
              ยังไม่มี Network Kill Switch และการทดสอบ DNS / WebRTC leak
              จึงไม่รับรองการป้องกัน IP รั่วไหลทั้งหมด
            </p>
          </section>
        )}
        {form && (
          <div className="overlay">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const {
                    id,
                    status,
                    lastOpened,
                    ip,
                    browserVersion,
                    os,
                    ...fields
                  } = form;
                  void status;
                  void lastOpened;
                  void ip;
                  void browserVersion;
                  void os;
                  await call("profile.save", { id, data: fields });
                  setForm(null);
                });
              }}
            >
              <h2>{form.id ? "แก้ไข" : "สร้าง"}โปรไฟล์</h2>
              <div className="fields">
                {[
                  ["name", "ชื่อโปรไฟล์"],
                  ["group", "กลุ่ม"],
                  ["tags", "แท็ก"],
                  ["locale", "Locale"],
                  ["timezone", "Timezone"],
                  ["width", "ความกว้าง"],
                  ["height", "ความสูง"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      value={form[key]}
                      type={
                        ["width", "height"].includes(key) ? "number" : "text"
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [key]: ["width", "height"].includes(key)
                            ? Number(e.target.value)
                            : e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  Browser
                  <select
                    value={form.engine}
                    onChange={(e) =>
                      setForm({ ...form, engine: e.target.value })
                    }
                  >
                    {["chromium", "chrome", "msedge", "firefox"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Proxy
                  <select
                    value={form.proxyId || ""}
                    onChange={(e) =>
                      setForm({ ...form, proxyId: e.target.value || null })
                    }
                  >
                    <option value="">Direct Connection</option>
                    {data.proxies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  VPN ที่ต้องเชื่อมต่อ
                  <select
                    value={form.vpnName || ""}
                    onChange={(e) =>
                      setForm({ ...form, vpnName: e.target.value })
                    }
                  >
                    <option value="">ไม่กำหนด VPN</option>
                    {vpn?.connections?.map((v: Item) => (
                      <option key={v.Name} value={v.Name}>
                        {v.Name} ({v.ConnectionStatus})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!vpn?.connections?.length}
                  onClick={() => {
                    const list = vpn!.connections;
                    setForm({
                      ...form,
                      vpnName:
                        list[Math.floor(Math.random() * list.length)].Name,
                    });
                  }}
                >
                  สุ่ม VPN ที่ตั้งค่าไว้ (ต้องเชื่อมต่อก่อนเปิด)
                </button>
                <label>
                  หมายเหตุ
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm({ ...form, notes: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={form.randomProxy}
                  onChange={(e) =>
                    setForm({ ...form, randomProxy: e.target.checked })
                  }
                />{" "}
                สุ่ม Proxy ที่ผ่านการตรวจสอบก่อนเปิดแต่ละครั้ง
              </label>
              <button
                type="button"
                onClick={() => {
                  const available = data.proxies.filter(
                    (p) => p.status === "available",
                  );
                  if (!available.length) {
                    setError("ไม่มี Proxy ที่ผ่านการทดสอบ");
                    return;
                  }
                  setForm({
                    ...form,
                    proxyId:
                      available[Math.floor(Math.random() * available.length)]
                        .id,
                  });
                }}
              >
                สุ่ม Proxy ตอนนี้
              </button>
              <p>
                Environment: {form.engine} · {form.locale} · {form.timezone} ·{" "}
                {form.width}×{form.height} · OS จริงของเครื่อง
              </p>
              <button disabled={busy} type="submit">
                บันทึก
              </button>
              <button type="button" onClick={() => setForm(null)}>
                ยกเลิก
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
        )}
        {importText !== null && (
          <div className="overlay">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const count = await call("proxy.import", importText);
                  setMessage(`นำเข้า ${count} Proxy (ข้ามรายการซ้ำ)`);
                  setImportText(null);
                });
              }}
            >
              <h2>นำเข้า Proxy List</h2>
              <p>
                หนึ่งรายการต่อบรรทัด: http://username:password@host:port หรือ
                host:port
              </p>
              <textarea
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button disabled={busy}>นำเข้า</button>
              <button type="button" onClick={() => setImportText(null)}>
                ยกเลิก
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
        )}
        {proxy && (
          <div className="overlay">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await call("proxy.save", proxy);
                  setProxy(null);
                });
              }}
            >
              <h2>เพิ่ม Proxy</h2>
              {["name", "host", "port", "username", "password"].map((key) => (
                <label key={key}>
                  {key}
                  <input
                    value={proxy[key]}
                    type={
                      key === "password"
                        ? "password"
                        : key === "port"
                          ? "number"
                          : "text"
                    }
                    onChange={(e) =>
                      setProxy({
                        ...proxy,
                        [key]:
                          key === "port"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <select
                value={proxy.protocol}
                onChange={(e) =>
                  setProxy({ ...proxy, protocol: e.target.value })
                }
              >
                {["http", "https", "socks5"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <button disabled={busy}>บันทึก</button>
              <button type="button" onClick={() => setProxy(null)}>
                ยกเลิก
              </button>
              {error && <p className="error">{error}</p>}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
