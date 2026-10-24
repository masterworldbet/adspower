import React, { useState, useRef, useEffect } from "react";
import { profileSchema } from "../electron/profile-schema.js";
type Item = Record<string, any>;
type Props = {
  value: Item;
  platform?: string;
  proxies: Item[];
  browsers: Item[];
  vpn: Item | null;
  busy: boolean;
  error: string;
  onSave: (value: Item) => void;
  onClose: () => void;
};
const engineNames: Record<string, string> = {
  chromium: "Chromium",
  chrome: "Google Chrome",
  msedge: "Microsoft Edge",
  firefox: "Firefox",
};
const tabs = ["ทั่วไป", "พร็อกซี / VPN", "Facebook", "สภาพแวดล้อม", "ขั้นสูง"];
export function ProfileEditor({
  value,
  platform,
  proxies,
  browsers,
  vpn,
  busy,
  error,
  onSave,
  onClose,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const actualOS =
    platform === "win32"
      ? "Windows"
      : platform === "darwin"
        ? "macOS"
        : platform === "linux"
          ? "Linux"
          : "OS จริงของเครื่อง";
  const [form, setForm] = useState<Item>({
    colorScheme: "system",
    locationMode: "ask",
    accuracy: 100,
    webrtcPolicy: "default",
    startUrls: ["https://www.facebook.com/"],
    accountLabel: "",
    ...value,
  });
  const [tab, setTab] = useState(0),
    [localError, setLocalError] = useState("");
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  const set = (key: string, v: unknown) =>
    setForm((previous) => ({ ...previous, [key]: v }));
  const selectedProxy = proxies.find((p) => p.id === form.proxyId);
  const browser = browsers.find((b) => b.engine === form.engine);
  function randomProxy() {
    const valid = proxies.filter((p) => p.status === "available");
    if (!valid.length) {
      setLocalError(
        "ยังไม่มี Proxy ที่ผ่านการทดสอบ กรุณาทดสอบใน Proxy Manager ก่อน",
      );
      return;
    }
    setLocalError("");
    set("proxyId", valid[Math.floor(Math.random() * valid.length)]!.id);
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    if (!form.name.trim()) {
      setTab(0);
      setLocalError("กรุณาระบุชื่อโปรไฟล์");
      return;
    }
    if (
      form.locationMode === "custom" &&
      (form.latitude === undefined || form.longitude === undefined)
    ) {
      setTab(3);
      setLocalError("กรุณาระบุพิกัดให้ครบ");
      return;
    }
    const parsed = profileSchema.safeParse({
      ...form,
      startUrls: form.startUrls
        .map((url: string) => url.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0]);
      if (["name", "engine", "group", "tags", "notes"].includes(field))
        setTab(0);
      else if (["proxyId", "randomProxy", "vpnName"].includes(field)) setTab(1);
      else if (["startUrls", "accountLabel"].includes(field)) setTab(2);
      else if (field === "webrtcPolicy") setTab(4);
      else setTab(3);
      setLocalError(`ตรวจค่า ${field}: ${issue.message}`);
      return;
    }
    onSave({ ...form, ...parsed.data });
  }
  function field(key: string, label: string, type = "text", extra: Item = {}) {
    return (
      <label className="setting-row" key={key}>
        <span>{label}</span>
        <input
          type={type}
          value={form[key] ?? ""}
          {...extra}
          onChange={(e) =>
            set(
              key,
              type === "number"
                ? e.target.value === ""
                  ? undefined
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      </label>
    );
  }
  function segments(key: string, options: [string, string][]) {
    return (
      <div className="segments">
        {options.map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={form[key] === v}
            className={form[key] === v ? "active" : ""}
            onClick={() => set(key, v)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="profile-editor-overlay">
      <form
        className="profile-editor"
        onSubmit={save}
        aria-label="ตั้งค่าโปรไฟล์"
      >
        <div className="editor-heading">
          <div>
            <small>MASTERBROWSER / PROFILE SETTINGS</small>
            <h2>
              {form.id ? "แก้ไขโปรไฟล์" : "สร้างโปรไฟล์ใหม่"}{" "}
              <span>{form.name || "โปรไฟล์ใหม่"}</span>
            </h2>
          </div>
          <button
            type="button"
            className="editor-close"
            onClick={onClose}
            aria-label="ปิดหน้าตั้งค่า"
          >
            ×
          </button>
        </div>
        <div role="tablist" className="editor-tabs">
          {tabs.map((name, i) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === i}
              aria-controls={`profile-panel-${i}`}
              id={`profile-tab-${i}`}
              key={name}
              onClick={() => setTab(i)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="editor-body">
          <div
            className="editor-content"
            ref={contentRef}
            role="tabpanel"
            id={`profile-panel-${tab}`}
            aria-labelledby={`profile-tab-${tab}`}
          >
            {(error || localError) && (
              <div role="alert" className="error">
                {localError || error}
              </div>
            )}
            {tab === 0 && (
              <>
                <h3>ข้อมูลโปรไฟล์</h3>
                {field("name", "ชื่อโปรไฟล์", "text", {
                  maxLength: 100,
                  placeholder: "ตั้งชื่อเพื่อแยกบัญชีของคุณ",
                })}
                <label className="setting-row">
                  <span>เบราว์เซอร์</span>
                  <select
                    value={form.engine}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        engine: e.target.value,
                        webrtcPolicy:
                          e.target.value === "firefox"
                            ? "default"
                            : form.webrtcPolicy,
                      })
                    }
                  >
                    {Object.entries(engineNames).map(([engine, name]) => (
                      <option key={engine} value={engine}>
                        {name}
                        {browsers.find((b) => b.engine === engine)
                          ?.available === false
                          ? " · ยังไม่พบ Binary"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {browser && (
                  <p
                    className={
                      browser.available ? "field-help" : "field-help invalid"
                    }
                  >
                    {browser.available
                      ? "พร้อมใช้งานบนเครื่องนี้"
                      : browser.reason}
                  </p>
                )}
                <div className="setting-row">
                  <span>ระบบปฏิบัติการ</span>
                  <div className="readonly-value">
                    {actualOS}{" "}
                    <small>ใช้ OS จริงของเครื่องที่เปิดโปรแกรม</small>
                  </div>
                </div>
                <div className="setting-row">
                  <span>User-Agent</span>
                  <div className="readonly-value">
                    อัตโนมัติจากเบราว์เซอร์จริง
                    <small>
                      แสดงค่าที่วัดได้หลังเปิดโปรไฟล์ ไม่มีการใช้ UA ของ OS หรือ
                      Engine อื่น
                    </small>
                  </div>
                </div>
                <hr />
                <h3>จัดระเบียบ</h3>
                {field("group", "กลุ่ม")}
                {field("tags", "แท็ก")}
                <label className="setting-row">
                  <span>หมายเหตุ</span>
                  <textarea
                    rows={4}
                    value={form.notes}
                    maxLength={4000}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </label>
              </>
            )}
            {tab === 1 && (
              <>
                <h3>การเชื่อมต่อ Proxy</h3>
                <label className="setting-row">
                  <span>Proxy ที่บันทึกไว้</span>
                  <select
                    value={form.proxyId || ""}
                    onChange={(e) => set("proxyId", e.target.value || null)}
                  >
                    <option value="">Direct Connection · ไม่ใช้ Proxy</option>
                    {proxies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.protocol} · {p.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="setting-row">
                  <span>การผูก Proxy</span>
                  <div>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={form.randomProxy}
                        onChange={(e) => set("randomProxy", e.target.checked)}
                      />{" "}
                      สุ่ม Proxy ที่ผ่านการทดสอบก่อนเปิดแต่ละครั้ง
                    </label>
                    <small>
                      ปิดตัวเลือกนี้เพื่อล็อก Proxy ที่เลือกไว้กับโปรไฟล์
                    </small>
                    <button type="button" onClick={randomProxy}>
                      ⤨ สุ่ม Proxy ตอนนี้
                    </button>
                  </div>
                </div>
                <div className="connection-card">
                  <strong>
                    {selectedProxy ? selectedProxy.name : "Direct Connection"}
                  </strong>
                  <p>
                    {selectedProxy
                      ? `${selectedProxy.protocol}://${selectedProxy.host}:${selectedProxy.port}`
                      : "เชื่อมต่อผ่านเครือข่ายของเครื่องโดยตรง"}
                  </p>
                  <small>
                    ตรวจ IP ก่อนเปิด Facebook · Proxy ไม่พร้อมจะหยุดเปิด ไม่มี
                    Direct fallback
                  </small>
                </div>
                <hr />
                <h3>Windows VPN</h3>
                <label className="setting-row">
                  <span>VPN ที่ต้องเชื่อมต่อ</span>
                  <select
                    value={form.vpnName || ""}
                    onChange={(e) => set("vpnName", e.target.value)}
                  >
                    <option value="">ไม่กำหนด VPN</option>
                    {vpn?.connections?.map((v: Item) => (
                      <option key={v.Name} value={v.Name}>
                        {v.Name} · {v.ConnectionStatus}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="setting-row">
                  <span>สุ่มการตั้งค่า</span>
                  <button
                    type="button"
                    disabled={!vpn?.connections?.length}
                    onClick={() => {
                      const list = vpn!.connections;
                      set(
                        "vpnName",
                        list[Math.floor(Math.random() * list.length)].Name,
                      );
                    }}
                  >
                    สุ่มจาก VPN ที่ตั้งค่าไว้
                  </button>
                </div>
                <p className="field-help">
                  VPN มีผลต่อทั้งเครื่อง ใช้หน้า VPN Manager
                  เพื่อเชื่อมต่อก่อนเปิดโปรไฟล์
                  การสุ่มตรงนี้เปลี่ยนเฉพาะรายการที่เลือก
                </p>
              </>
            )}
            {tab === 2 && (
              <>
                <h3>บัญชี Facebook ของคุณ</h3>
                <div className="setting-row">
                  <span>แพลตฟอร์ม</span>
                  <div className="readonly-value">ⓕ facebook.com</div>
                </div>
                {field("accountLabel", "ชื่อบัญชีสำหรับอ้างอิง", "text", {
                  maxLength: 200,
                  placeholder: "ชื่อหรืออีเมล (ไม่ใช้ล็อกอินอัตโนมัติ)",
                })}
                <p className="field-help">
                  ล็อกอินด้วยตนเองในหน้าต่างเบราว์เซอร์ Cookies และ Session
                  จะอยู่ในโฟลเดอร์แยกของโปรไฟล์นี้
                  โปรแกรมไม่เก็บรหัสผ่านหรือคีย์ 2FA ในฟอร์ม
                </p>
                <hr />
                <h3>แท็บที่เปิดเมื่อเริ่มโปรไฟล์</h3>
                <label className="setting-row">
                  <span>URL เริ่มต้น</span>
                  <textarea
                    rows={5}
                    aria-label="URL เริ่มต้น"
                    value={form.startUrls.join("\n")}
                    onChange={(e) =>
                      set("startUrls", e.target.value.split(/\r?\n/))
                    }
                    placeholder="https://www.facebook.com/"
                  />
                </label>
                <p className="field-help">
                  หนึ่ง URL ต่อบรรทัด สูงสุด 10 แท็บ รองรับเฉพาะ HTTPS ของ
                  Facebook ถ้าเว้นว่างจะเปิดหน้าแรก Facebook
                </p>
              </>
            )}
            {tab === 3 && (
              <>
                <h3>ภาษาและเขตเวลา</h3>
                {field("locale", "ภาษา / Locale", "text", {
                  list: "profile-locales",
                })}
                <datalist id="profile-locales">
                  {["th-TH", "en-US", "en-GB", "ja-JP", "de-DE", "fr-FR"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </datalist>
                {field("timezone", "Timezone", "text", {
                  list: "profile-timezones",
                })}
                <datalist id="profile-timezones">
                  {[
                    "Asia/Bangkok",
                    "Asia/Singapore",
                    "Asia/Tokyo",
                    "Europe/London",
                    "America/New_York",
                    "UTC",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </datalist>
                <p className="field-help">
                  เลือกค่าที่ต้องการเอง ไม่มีการเดาประเทศหรือเขตเวลาจาก IP
                </p>
                <div className="setting-row">
                  <span>ธีมของเว็บไซต์</span>
                  {segments("colorScheme", [
                    ["system", "ตามระบบ"],
                    ["light", "สว่าง"],
                    ["dark", "มืด"],
                  ])}
                </div>
                <hr />
                <h3>ขนาดหน้าต่างและหน้าจอ</h3>
                <div className="setting-row">
                  <span>Windows Desktop Preset</span>
                  <div className="segments">
                    {[
                      [1280, 800],
                      [1366, 768],
                      [1920, 1080],
                    ].map(([width, height]) => (
                      <button
                        type="button"
                        key={width}
                        onClick={() =>
                          setForm({
                            ...form,
                            width,
                            height,
                            screenWidth: width,
                            screenHeight: height,
                          })
                        }
                      >
                        {width} × {height}
                      </button>
                    ))}
                  </div>
                </div>
                {field("width", "Viewport กว้าง", "number", {
                  min: 640,
                  max: 7680,
                })}
                {field("height", "Viewport สูง", "number", {
                  min: 480,
                  max: 4320,
                })}
                {field(
                  "screenWidth",
                  "Screen กว้าง (ว่าง = Viewport)",
                  "number",
                  { min: form.width, max: 7680 },
                )}
                {field(
                  "screenHeight",
                  "Screen สูง (ว่าง = Viewport)",
                  "number",
                  { min: form.height, max: 4320 },
                )}
                <hr />
                <h3>สิทธิ์ตำแหน่งที่ตั้ง</h3>
                <div className="setting-row">
                  <span>Geolocation</span>
                  {segments("locationMode", [
                    ["ask", "ค่าเบราว์เซอร์"],
                    ["block", "ปิดกั้น"],
                    ["custom", "กำหนดพิกัด"],
                  ])}
                </div>
                {form.locationMode === "custom" && (
                  <>
                    {field("latitude", "ละติจูด", "number", {
                      min: -90,
                      max: 90,
                      step: "any",
                    })}
                    {field("longitude", "ลองจิจูด", "number", {
                      min: -180,
                      max: 180,
                      step: "any",
                    })}
                    {field("accuracy", "ความแม่นยำ (เมตร)", "number", {
                      min: 0,
                      max: 10000,
                    })}
                    <p className="field-help">
                      พิกัดเป็นการตั้งค่า browser geolocation สำหรับ Facebook
                      ไม่เปลี่ยน Public IP หรือสถานที่จริงของอุปกรณ์
                    </p>
                  </>
                )}
              </>
            )}
            {tab === 4 && (
              <>
                <h3>WebRTC</h3>
                <label className="setting-row">
                  <span>นโยบาย WebRTC</span>
                  <select
                    value={form.webrtcPolicy}
                    onChange={(e) => set("webrtcPolicy", e.target.value)}
                  >
                    <option value="default">ค่าเริ่มต้นเบราว์เซอร์</option>
                    <option
                      value="restrict_udp"
                      disabled={form.engine === "firefox"}
                    >
                      จำกัด UDP ที่ไม่ผ่าน Proxy (Chromium / Chrome / Edge)
                    </option>
                  </select>
                </label>
                <p className="field-help">
                  ตัวเลือกจำกัด UDP ใช้ browser policy จริง อาจกระทบการโทรด้วย
                  WebRTC ไม่ใช่ Network Kill Switch และยังไม่ได้ยืนยันว่าป้องกัน
                  IP leak ได้ทั้งหมด
                </p>
                <hr />
                <h3>ข้อมูลฮาร์ดแวร์และการเรนเดอร์</h3>
                {[
                  ["WebGL / GPU", "ค่าจริงจากเบราว์เซอร์และเครื่อง"],
                  ["WebGPU", "ตามความสามารถจริงของ Engine"],
                  ["Canvas / AudioContext", "ค่าเริ่มต้น ไม่มีการเติม Noise"],
                  ["Fonts / Media devices", "ตามเครื่องและสิทธิ์ที่คุณอนุญาต"],
                  ["OS / Hardware", "ระบบปฏิบัติการและฮาร์ดแวร์จริง"],
                ].map(([name, text]) => (
                  <div className="setting-row" key={name}>
                    <span>{name}</span>
                    <div className="readonly-value">{text}</div>
                  </div>
                ))}
                <hr />
                <h3>Session และความปลอดภัย</h3>
                <p>
                  Cookies, Cache และ Local Storage แยกตามโปรไฟล์
                  ป้องกันการเปิดโฟลเดอร์เดิมซ้ำ ไม่มี Cloud Sync หรือการส่ง
                  Session ไปยังเซิร์ฟเวอร์ของแอป
                </p>
              </>
            )}
          </div>
          <div className="profile-summary">
            <h3>
              สรุปโปรไฟล์ <span className="badge">LOCAL</span>
            </h3>
            <dl>
              {[
                ["ชื่อ", form.name || "ยังไม่ได้ตั้งชื่อ"],
                ["เบราว์เซอร์", engineNames[form.engine]],
                ["ระบบปฏิบัติการ", "ค่าจริงของเครื่อง"],
                ["บัญชี", form.accountLabel || "ไม่ได้ระบุ"],
                [
                  "Proxy",
                  form.randomProxy
                    ? "สุ่มก่อนเปิด"
                    : selectedProxy?.name || "Direct Connection",
                ],
                ["VPN", form.vpnName || "ไม่กำหนด"],
                ["ภาษา", form.locale],
                ["เขตเวลา", form.timezone],
                ["Viewport", `${form.width} × ${form.height}`],
                [
                  "Screen",
                  `${form.screenWidth ?? form.width} × ${form.screenHeight ?? form.height}`,
                ],
                [
                  "ธีม",
                  ({ system: "ตามระบบ", light: "สว่าง", dark: "มืด" } as Item)[
                    form.colorScheme
                  ],
                ],
                [
                  "ตำแหน่ง",
                  (
                    {
                      ask: "ค่าเริ่มต้นเบราว์เซอร์",
                      block: "ปิดกั้น",
                      custom: `${form.latitude ?? "—"}, ${form.longitude ?? "—"}`,
                    } as Item
                  )[form.locationMode],
                ],
                [
                  "WebRTC",
                  form.webrtcPolicy === "restrict_udp"
                    ? "จำกัด UDP นอก Proxy"
                    : "ค่าเบราว์เซอร์",
                ],
                ["User-Agent", "อัตโนมัติจากเบราว์เซอร์"],
                ["Canvas / GPU", "ค่าจริง"],
                [
                  "แท็บเริ่มต้น",
                  `${form.startUrls.filter((v: string) => v.trim()).length || 1} แท็บ`,
                ],
              ].map(([key, text]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{text}</dd>
                </React.Fragment>
              ))}
            </dl>
            {value.realEnvironment?.userAgent && (
              <details>
                <summary>ค่าที่ตรวจวัดจากการเปิดครั้งล่าสุด</summary>
                <p className="ua-preview">{value.realEnvironment.userAgent}</p>
                <small>
                  {value.realEnvironment.language} ·{" "}
                  {value.realEnvironment.timezone}
                </small>
              </details>
            )}
            <div className="summary-note">
              การตั้งค่าจะใช้เมื่อเปิดโปรไฟล์ครั้งถัดไป ไม่มีการเปลี่ยน Proxy
              ระหว่าง Session
            </div>
          </div>
        </div>
        <div className="editor-actions">
          <small>ข้อมูลอยู่บนเครื่องของคุณ</small>
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
          </button>
        </div>
      </form>
    </div>
  );
}
