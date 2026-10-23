# MasterBrowser

โปรแกรม Desktop ส่วนตัวสำหรับจัดการ Browser Profile ของบัญชี Facebook ที่คุณเป็นเจ้าของ UI ภาษาไทย Dark Mode ใช้ Electron + React + TypeScript + Vite + SQLite + Playwright

## เริ่มบน Windows 10 / 11

ติดตั้ง Node.js 24 LTS แล้วเปิด PowerShell ในโฟลเดอร์โปรเจกต์:

```powershell
npm ci
npx playwright install chromium firefox
npm run desktop
```

Chrome / Edge ใช้ Binary ที่ติดตั้งบนเครื่อง ส่วน Chromium / Firefox ใช้ Binary ของ Playwright ไม่มีการดาวน์โหลดเบราว์เซอร์ให้อัตโนมัติเมื่อเปิดโปรไฟล์

```powershell
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run package:win
npm run package:portable
```

ตัวติดตั้งสร้างใน `release/` การสร้าง EXE ที่เชื่อถือได้ควรทำบน Windows และทดสอบติดตั้ง/เปิดจริง ตัวติดตั้งยังไม่ได้ลงลายเซ็นโค้ด

`npm run dev` เปิด Vite สำหรับพัฒนา UI อย่างเดียว ระบบ SQLite/Browser/VPN ต้องเปิดผ่าน `npm run desktop` ซึ่ง Build และเปิด Electron ไม่ใช้ข้อมูล Mock หากเปิด UI ในเว็บปกติจะแจ้งว่าไม่มี Desktop API

## ฟังก์ชันที่มีโค้ดรองรับ

- สร้าง แก้ไข ลบ ทำสำเนาการตั้งค่าโปรไฟล์ พร้อมกลุ่ม แท็ก หมายเหตุ
- แยก userDataDir ด้วย UUID ป้องกันเปิดซ้ำระหว่างกำลังเปิดและขณะทำงาน ปิด Browser ได้จาก UI
- เลือก Chromium / Chrome / Edge / Firefox เปิดหน้าต่างจริงและไป Facebook
- Locale, Timezone, Viewport และ Screen ตามค่าที่กำหนด ใช้ User-Agent จริง ไม่ปลอม Fingerprint หรือ OS
- Proxy HTTP / HTTPS / SOCKS5, Import URL หนึ่งบรรทัดต่อรายการ ข้ามรายการซ้ำ ตรวจรูปแบบและพอร์ต
- ไม่รองรับ SOCKS5 authentication; ข้อมูลรับรองใช้ Electron safeStorage (Windows DPAPI) ไม่ส่งกลับ Renderer
- ทดสอบ Public IP และ Latency ผ่าน Proxy; สุ่มเฉพาะรายการสถานะ available ก่อนเปิดและทดสอบซ้ำก่อนเริ่ม Browser ไม่เปลี่ยน Proxy ระหว่าง Session
- ยกเลิกการสุ่มอัตโนมัติหากต้องการล็อก Proxy ที่เลือก ไม่มีรายการที่ผ่านหรือ Preflight ล้มเหลวจะหยุด ไม่มี Direct fallback
- ตรวจ Public IP สำหรับ Direct Connection ก่อนเปิด Facebook เช่นกัน
- แสดง Windows VPN ที่ตั้งไว้และสถานะจริง เชื่อมต่อ/ตัดด้วย rasdial เฉพาะชื่อที่ตรวจพบ ใช้ข้อมูลรับรองที่ Windows บันทึกไว้ ไม่ส่งรหัสผ่านผ่าน Command Line และมี Windows Settings เป็นทางเลือกเมื่อเชื่อมต่ออัตโนมัติไม่ได้
- สุ่มเลือก VPN จาก Connection ที่ตั้งค่าไว้ได้ใน VPN Manager และหน้าโปรไฟล์ การสุ่มไม่เปลี่ยนการเชื่อมต่อเอง
- เลือก VPN ที่ต้องเชื่อมต่อในโปรไฟล์ ถ้าไม่ Connected จะไม่เปิด Browser; VPN มีผลทั้งเครื่อง
- ตรวจ Public IP ก่อน/หลังเปลี่ยน VPN อัตโนมัติ พร้อมปุ่มตรวจซ้ำแยกต่างหาก
- Backup/Restore JSON ของการตั้งค่าโปรไฟล์ ตรวจ Schema และขนาดไฟล์ สร้าง ID ใหม่ ไม่รับ Path จากไฟล์นำเข้า
- SQLite AppData, sandbox, contextIsolation, contextBridge, IPC allowlist และตรวจ sender/input; ไม่มี Cloud หรือระบบล็อกอินของแอป

การลบโปรไฟล์ลบเฉพาะข้อมูลตั้งค่าและเก็บ Session บนดิสก์ไว้เพื่อป้องกันข้อมูลสูญหาย การทำสำเนาไม่คัดลอก Cookies/Session

## ที่เก็บข้อมูล

Windows: `%APPDATA%/masterbrowser/` (ตำแหน่งจริงตาม Electron userData)

- `masterbrowser.sqlite` และไฟล์ WAL
- `sessions/<uuid>/` แยก Cookies / Cache / Local Storage

ไฟล์ Session เป็นข้อมูลอ่อนไหวของเบราว์เซอร์ ควรปกป้องบัญชี Windows และดิสก์ ไม่มีการบันทึกรหัสผ่าน Facebook ลงฐานข้อมูลแอป

Backup ใน UI **ไม่รวม Session หรือ Proxy Credentials** Restore จะตั้ง Proxy เป็น Direct และปิดการสุ่ม ต้องตรวจและกำหนด Proxy ใหม่ก่อนเปิด

## สถานะการตรวจในคลาวด์

ผ่าน Typecheck, ESLint, Build, Unit Tests 13 รายการ (รวม VPN output/selection, Proxy Import ที่ปฏิเสธ path/query, hostname validation และ SQLite migration ที่ไม่ downgrade ฐานข้อมูลรุ่นใหม่กว่า) และ HTTP smoke ของ Vite

ทดสอบ Firefox 157 จริงแบบ headless ผ่าน: Cookies/Local Storage แยกสองโปรไฟล์, เปิด userDataDir เดิมซ้ำถูกปฏิเสธ และข้อมูลคงอยู่หลังปิด/เปิดใหม่ รวมทั้งยืนยัน Locale th-TH, Timezone Asia/Bangkok, Viewport และ Screen 1280px จริง คำสั่งในคลาวด์:

```bash
XDG_CONFIG_HOME=/workspace/.config XDG_CACHE_HOME=/workspace/.cache PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright BROWSER_TEST_ENGINE=firefox npm run test:browser
```

การทดสอบ Firefox ต้องรันนอก sandbox ชั้นคำสั่งของคลาวด์ เพื่อให้ sandbox ของ Firefox เขียน `/proc/self/uid_map` ได้ ไม่ได้ปิด sandbox ของ Firefox

ยังไม่ยืนยัน Electron Desktop E2E: การทดสอบโหมด headless ของ Electron ใน Linux ออกจากโปรแกรมด้วยข้อผิดพลาดด้าน display จึงยังต้องทดสอบบนเครื่องที่มี GUI ส่วน Chromium ดาวน์โหลดไม่ได้เพราะ redirect ไป `storage.googleapis.com` ที่ยังรอการใช้การตั้งค่าเครือข่ายใหม่

ต้องทดสอบบน Windows: เปิด/ปิดทุก Engine, Proxy จริงพร้อม credentials, VPN status/connection, DPAPI, Backup/Restore UI, ติดตั้งและเปิด EXE

ยังไม่มี DNS/WebRTC leak diagnostics, Network kill switch, ข้อมูลประเทศ IP, User-Agent override และ Full Session Backup ไม่รับรองป้องกัน IP leak 100% ไม่ใช้เลี่ยง CAPTCHA, แบน หรือข้อจำกัด Meta

## เครือข่ายที่จำเป็น

ติดตั้ง: registry.npmjs.org, github.com และโดเมน GitHub release, cdn.playwright.dev, storage.googleapis.com และโดเมน Microsoft download ที่ redirect ไป

ทำงาน: api.ipify.org สำหรับ IP check; www.facebook.com และโดเมนทรัพยากรของ Facebook ตามการใช้งานจริง รวมถึงปลายทาง Proxy ของผู้ใช้ บนเครื่อง Windows ใช้นโยบายเครือข่ายของเครื่องนั้น

## การพัฒนาในคลาวด์

ใช้ checkout ที่ `/workspace/adspower` ซึ่งแยกสภาพแวดล้อมไว้แล้ว ไม่ต้องสร้าง Git worktree เพิ่ม ตั้ง `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` ให้ตรงกับตำแหน่งติดตั้งในคลาวด์

## ไฟล์ที่สร้างในการส่งมอบนี้

`release/MasterBrowser-0.2.0-win.zip` เป็นแพ็กเกจ Windows แบบแยกไฟล์ ให้แตก ZIP ทั้งหมดและเปิด `MasterBrowser.exe` อย่าคัดลอกเฉพาะ EXE ออกไป Chromium/Firefox ต้องติดตั้ง Binary ตามคำสั่งด้านบน หรือเลือก Chrome/Edge ที่มีอยู่แล้ว

ตรวจโครงสร้าง PE, app.asar, Main, Preload และ dependency ที่แพ็กแล้วผ่าน แต่ยังไม่ได้เปิดแอปนี้บน Windows จริง การสร้าง NSIS Installer บน Linux ล้มเหลวเพราะ Wine toolset โหลด ntdll ไม่สำเร็จ จึงไม่ส่งมอบไฟล์ Installer ที่สร้างค้างไว้

มี `.github/workflows/windows.yml` สำหรับตรวจบน Windows รวม Browser Session integration, Packaging และเปิดแพ็กเกจด้วย `--smoke-test` (ตรวจ UI โหลดและ IPC/SQLite ตอบกลับ) Workflow นี้ยังไม่ได้รันบน GitHub

## รุ่น 0.2.0

เพิ่มการเชื่อมต่อ/ตัด VPN และสุ่มเลือก Configuration พร้อมแสดง IP ก่อน/หลัง ใช้ `rasdial.exe` ผ่าน argument array เฉพาะชื่อที่ตรวจพบ ไม่มีคำสั่ง shell หรือรหัสผ่าน และต้องยืนยันใน UI ก่อนเปลี่ยนเครือข่ายทั้งเครื่อง หากยืนยันสถานะไม่ได้จะแสดงข้อผิดพลาดและให้เชื่อมต่อผ่าน Windows Settings

ปรับ Proxy ที่ล้มเหลวระหว่างเปิดโปรไฟล์ให้เป็นสถานะ failed เพื่อไม่ให้ถูกสุ่มในครั้งต่อไป ตรวจ hostname และ URL import เข้มงวดขึ้น พร้อมป้องกัน SQLite รุ่นใหม่ถูก downgrade

Unit Tests ของ VPN ตรวจ parser และการเลือก Connection เท่านั้น ยังไม่ใช่หลักฐานว่า Windows VPN เชื่อมต่อจริงได้บนเครื่องคลาวด์นี้

แพ็กเกจ Windows ZIP 0.2.0 สร้างผ่านด้วย electron-builder target zip ตรวจ CRC ทุกไฟล์ และตรวจ Main/Preload/โมดูลที่แพ็กให้ตรงกับ Build ล่าสุดแล้ว มี SHA-256 ในไฟล์ .sha256 ข้าง ZIP ผลนี้ยังไม่ใช่การทดสอบเปิดแอปบน Windows

## ดาวน์โหลดจาก GitHub Actions

เปิด https://github.com/masterworldbet/adspower/actions แล้วเลือกรายการล่าสุดของ **Build MasterBrowser for Windows** รอขั้นตอน Upload portable application สำเร็จ จากนั้นเลื่อนลงไปที่ **Artifacts** และกด **MasterBrowser-Windows-Portable** (ต้องล็อกอิน GitHub และมีสิทธิ์เข้าถึง repository)

แตก ZIP ทั้งหมดและเปิด MasterBrowser.exe จากโฟลเดอร์ที่แตกไฟล์ ส่วน MasterBrowser-Windows-Installer จะปรากฏหลัง Desktop smoke test และการสร้างตัวติดตั้งผ่านแล้ว ไฟล์ Artifacts เก็บ 14 วัน สามารถกด Run workflow เพื่อสร้างใหม่ได้ หาก workflow ล้มเหลวให้ดูขั้นตอนที่เป็นสีแดงก่อนถือว่าโปรแกรมผ่านการตรวจสอบ
