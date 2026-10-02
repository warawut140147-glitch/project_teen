# Q-Care — Smart Hospital Queue Management (Prototype)

ระบบบริหารจัดการคิวโรงพยาบาล เป้าหมายลดเวลารอคอยเฉลี่ย ≥ 30%
โปรโตไทป์นี้เป็น **Single-file Web App (Vanilla JS)** — เปิดใช้งานได้ทันทีโดยไม่ต้อง build

## โครงสร้างโปรเจกต์

```
project_teen/
├── db/
│   ├── schema.sql        # PostgreSQL Schema + ER constraint
│   └── nosql-logs.md     # โครงสร้าง MongoDB สำหรับ Log (Polyglot Persistence)
├── docs/
│   └── er-diagram.md     # ER Diagram + ความสัมพันธ์ + lifecycle สถานะคิว
├── website/              # ✅ เว็บไซต์หลัก (แยกเป็นหน้า ๆ — เปิด index.html)
│   ├── index.html        # หน้าแรก: เข้าสู่ระบบ (+ OTP บัญชีที่ยังไม่ยืนยันตัวตน)
│   ├── register.html     # หน้าสมัครสมาชิก + ยืนยัน OTP
│   ├── patient.html      # หน้าจองคิว (เลือกแผนก + กรอกอาการเบื้องต้น)
│   ├── queue.html        # หน้าดูคิว (Real-time, แจ้งเตือน, กระดานคิว, ประวัติ)
│   ├── admin.html        # หน้า Admin Dashboard (เห็นอาการเบื้องต้นของแต่ละคิว)
│   ├── css/style.css     # Stylesheet กลาง
│   └── js/
│       ├── data.js       # Mock Backend + localStorage (ข้อมูลชุดเดียวกันทุกหน้า/ทุกแท็บ)
│       ├── main.js       # Logic หน้าเข้าสู่ระบบ (login + OTP)
│       ├── register.js   # Logic หน้าสมัครสมาชิก (register + OTP)
│       ├── patient.js    # Logic หน้าจองคิว (แผนก + อาการเบื้องต้น)
│       ├── queue.js      # Logic หน้าดูคิว (Real-time + ประวัติ)
│       └── admin.js      # Logic หน้า Admin
├── frontend/
│   └── index.html        # (เวอร์ชันเดิม) เว็บแอปไฟล์เดียว ผู้ป่วย + Admin รวมในไฟล์เดียว
└── README.md
```

## วิธีใช้งาน

1. รันเว็บด้วย `npm start` (หรือ `npx serve website`) แล้วเปิด URL ที่ขึ้นบอก — เริ่มที่ **หน้าเข้าสู่ระบบ**
   - ข้อมูลทั้งเว็บไซต์ใช้ localStorage ชุดเดียวกัน → เปิดหลายแท็บแล้วข้อมูล sync Real-time
     (ทริกเกอร์ผ่าน `storage` event + polling ทุก 2.5 วินาที)
   - รีเซ็ตข้อมูลตั้งต้น: รัน `QCare.reset()` ใน Console
2. **สมัครสมาชิก** (หน้า `register.html`) ผู้ป่วยใหม่ → รับ OTP จำลอง (โค้ดแสดงบนจอแทน SMS)
   → ยืนยันแล้วเข้าหน้า **จองคิว** ทันที
3. **จองคิว** (หน้า `patient.html`): เลือกแผนก + กรอก **อาการเบื้องต้น** (จำเป็น)
   → ระบบสร้างคิวแล้วพาไปหน้า **ดูคิว** (`queue.html`) แสดงสถานะ Real-time + แจ้งเตือนใกล้ถึงคิว
4. **Login แอดมิน**: เบอร์ `0812345678` / รหัส `admin1234`
   (ในหน้าเข้าสู่ระบบมีข้อความบอกไว้เช่นกัน) — Admin เห็นอาการเบื้องต้นของแต่ละคิวในตารางจัดการคิว
5. *(ทางเลือก)* เวอร์ชันไฟล์เดียวเปิดที่ `frontend/index.html`

## Feature Mapping

| Role | Feature | ที่อยู่ในโค้ด | Endpoint จริง |
|---|---|---|---|
| ผู้ป่วย | ยืนยันตัวตน OTP + ตรวจเลขบัตร 13 หลัก | `api.register`, `api.verifyOtp` | `POST /api/auth/register`, `/api/auth/otp/verify` |
| ผู้ป่วย | จองคิว + กรอกอาการเบื้องต้น (Create) | `api.createQueue` | `POST /api/queues` |
| ผู้ป่วย | ดูสถานะคิว Real-time (poll 2.5 วิ + แจ้งเตือนใกล้ถึงคิว) | `refresh()`, `notify()` | `GET /api/queues` |
| ผู้ป่วย | ประวัติการจองคิว | `renderHistory()` | `GET /api/queues?patient=me` |
| ผู้ป่วย | ยกเลิกคิว (Delete) | `api.cancelQueue` | `DELETE /api/queues/:id` |
| Admin | Dashboard ภาพรวมคิวรอ | `renderStats()` | `GET /api/queues?summary=1` |
| Admin | เรียกคิว/เสร็จสิ้น/ข้ามคิว (Update) | `api.updateQueueStatus` | `PUT /api/queues/:id` |
| Admin | ยกเลิกคิว / แบนผู้ใช้ (Delete) | `api.cancelQueue`, `api.setUserBanned` | `DELETE /api/queues/:id`, `PATCH /api/users/:id/ban` |
| Admin | CRUD แผนก + โต๊ะตรวจ | `api.addDepartment`, `api.addDesk`, ... | `GET/POST/PUT/DELETE /api/departments`, `/api/desks` |

## สถาปัตยกรรม

- **Frontend**: Vanilla JS — Partial Render (อัปเดตเฉพาะ DOM ที่เปลี่ยน), Real-time ด้วย polling
  (ต่อยอดเป็น WebSocket/SSE ได้ที่ `startPolling()`)
- **Backend**: RESTful API (mock อยู่ใน object `api` — สลับเป็น `fetch()` จริงตามคอมเมนต์ endpoint)
- **Database**: PostgreSQL (ข้อมูลโครงสร้าง) + MongoDB (log/การแจ้งเตือน)
- **Security**: JWT + HTTPS + OTP + ตรวจรูปแบบเลขบัตรประชาชน (anti-spam) + ระบบแบนผู้ใช้

## โหมดสาธิต

ในหน้า Admin Dashboard มีช่อง **"โหมดสาธิตเรียกคิวอัตโนมัติ"** — เปิดแล้วระบบจะ
เรียก/จบคิวอัตโนมัติทุก 6 วินาที เพื่อให้เห็นการอัปเดต Real-time ทั้งฝั่งผู้ป่วยและกระดานคิว
(เปิด 2 แท็บพร้อมกัน: แท็บผู้ป่วย + แท็บ Admin)
