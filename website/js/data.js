/* =====================================================================
 * Q-Care — Shared Mock Backend (js/data.js)
 * ---------------------------------------------------------------------
 * - ฐานข้อมูลจำลองเก็บใน localStorage (key: qcare_db_v1)
 *   → ทุกหน้า/ทุกแท็บของเว็บไซต์เห็นข้อมูลชุดเดียวกันแบบ Real-time
 *     (จริง: แทนด้วย fetch() ไปยัง REST API ตามคอมเมนต์ endpoint ของแต่ละ method)
 * - Session เก็บใน sessionStorage (จริง: JWT ผ่าน Authorization header / HttpOnly cookie)
 * - Log การใช้งานเก็บใน db.logs (จำลอง MongoDB collection: activity_logs)
 * - รีเซ็ตข้อมูลตั้งต้น: รัน QCare.reset() ใน Console
 * ===================================================================== */
(function () {
  'use strict';

  const DB_KEY = 'qcare_db_v2';
  const SESSION_KEY = 'qcare_session_v1';

  // ---------- Helpers ----------
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  const numOf = (q) => parseInt(q.number.split('-')[1], 10);
  const fmt = (n) => String(n).padStart(3, '0');
  const maskNid = (nid) => nid.replace(/^(\d{5})\d{6}(\d{2})$/, '$1xxxxxx$2');

  const STATUS_TH = {
    waiting: 'รออยู่', called: 'เรียกแล้ว', in_service: 'กำลังตรวจ',
    skipped: 'ถูกข้าม', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก',
  };

  // ---------- Seed (อ้างอิงโครงสร้างตาม db/schema.sql) ----------
  function seedDb() {
    const db = {
      users: [
        // บัญชี Admin ทดสอบ (ระบบจริง: password ต้องเป็น hash)
        { id: 'admin-1', fullName: 'เจ้าหน้าที่ รพ.', nationalId: '1000000000001',
          phone: '0812345678', password: 'admin1234', role: 'admin',
          isVerified: true, isBanned: false, createdAt: Date.now() },
      ],
      otps: [],
      departments: [
        { id: 'd1', name: 'แผนกอายุรกรรม',    description: 'ตรวจโรคทั่วไป',      prefix: 'A', isActive: true, nextNumber: 12, nowServing: 9 },
        { id: 'd2', name: 'แผนกทันตกรรม',     description: 'ทันตกรรมและช่องปาก', prefix: 'B', isActive: true, nextNumber: 8,  nowServing: 5 },
        { id: 'd3', name: 'แผนกกุมารเวชกรรม', description: 'ตรวจโรคเด็ก',        prefix: 'C', isActive: true, nextNumber: 6,  nowServing: 6 },
      ],
      desks: [
        { id: 'k1', departmentId: 'd1', name: 'โต๊ะตรวจ 1', isActive: true },
        { id: 'k2', departmentId: 'd1', name: 'โต๊ะตรวจ 2', isActive: true },
        { id: 'k3', departmentId: 'd2', name: 'โต๊ะตรวจ 1', isActive: true },
        { id: 'k4', departmentId: 'd3', name: 'โต๊ะตรวจ 1', isActive: true },
      ],
      queues: [],
      logs: [],
    };
    // คิวผู้ป่วยจำลอง (ไม่ระบุตัวตน) ให้ระบบมีข้อมูลตั้งแต่เปิดเว็บ
    db.departments.forEach((d) => {
      for (let n = d.nowServing + 1; n < d.nextNumber; n++) {
        db.queues.push({
          id: 'q-' + d.prefix + n,
          number: d.prefix + '-' + fmt(n),
          patientId: 'guest-' + d.prefix + n,
          departmentId: d.id, deskId: null,
          status: 'waiting',
          createdAt: Date.now(), calledAt: null, completedAt: null,
        });
      }
    });
    return db;
  }

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted → seed ใหม่ */ }
    const db = seedDb();
    persist(db);
    return db;
  }

  function persist(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
  }

  // จำลองการเขียน log ลง MongoDB
  function addLog(db, action, detail, actorId) {
    db.logs.push({ at: new Date().toISOString(), actorId: actorId || 'anonymous', action, detail });
    if (db.logs.length > 500) db.logs = db.logs.slice(-500);
    console.log('[activity_logs]', action, detail);
  }

  // ---------- Session (จริง: JWT) ----------
  const session = {
    get() {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
    },
    set(data) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); },
    clear() { sessionStorage.removeItem(SESSION_KEY); },
    // Guard: บังคับ login + role ก่อนเข้าหน้า (patient.html / admin.html)
    require(role) {
      const s = this.get();
      if (!s || (role && s.user.role !== role)) { location.replace('index.html'); return null; }
      return s;
    },
  };

  // =====================================================================
  // API Layer — จำลอง RESTful Backend (สลับเป็น fetch() จริงตาม endpoint)
  // =====================================================================
  const api = {
    // จำลองการออก JWT (จริง: Backend sign ด้วย HS256/RS256)
    issueToken(user) {
      return btoa(JSON.stringify({ sub: user.id, role: user.role, iat: Date.now() }));
    },

    // POST /api/auth/register  { fullName, nationalId, phone, password }
    async register(input) {
      await delay(400);
      const db = load();
      if (db.users.some((u) => u.phone === input.phone))           throw new Error('เบอร์โทรนี้ถูกใช้งานแล้ว');
      if (db.users.some((u) => u.nationalId === input.nationalId)) throw new Error('เลขบัตรประชาชนนี้ถูกใช้งานแล้ว');
      const user = {
        id: uid(), fullName: input.fullName, nationalId: input.nationalId,
        phone: input.phone,
        password: input.password, // จริง: Backend ต้อง hash ด้วย bcrypt ก่อนบันทึก
        role: 'patient', isVerified: false, isBanned: false, createdAt: Date.now(),
      };
      db.users.push(user);
      addLog(db, 'register', 'ลงทะเบียนใหม่: ' + input.fullName, user.id);
      persist(db);
      return this.requestOtp(input.phone);
    },

    // POST /api/auth/otp/request  { phone } — จริง: ส่ง SMS/Email ผ่านผู้ให้บริการ
    async requestOtp(phone) {
      await delay(300);
      const db = load();
      const code = String(Math.floor(100000 + Math.random() * 900000));
      db.otps.push({ phone, code, expiresAt: Date.now() + 5 * 60 * 1000, used: false });
      persist(db);
      return { ok: true, devCode: code }; // devCode: ไม่มีในระบบจริง (จำลอง SMS)
    },

    // POST /api/auth/otp/verify  { phone, code } → { token, user }
    async verifyOtp(phone, code) {
      await delay(400);
      const db = load();
      const otp = db.otps.find((o) => o.phone === phone && o.code === code && !o.used);
      if (!otp) throw new Error('รหัส OTP ไม่ถูกต้อง');
      if (Date.now() > otp.expiresAt) throw new Error('รหัส OTP หมดอายุ กรุณาขอรหัสใหม่');
      otp.used = true;
      const user = db.users.find((u) => u.phone === phone);
      user.isVerified = true; // UPDATE users SET is_verified = TRUE
      addLog(db, 'otp_verify', 'ยืนยันตัวตนสำเร็จ: ' + user.fullName, user.id);
      persist(db);
      return { token: this.issueToken(user), user };
    },

    // POST /api/auth/login  { phone, password } → { token } หรือ { needsOtp: true }
    async login(phone, password) {
      await delay(350);
      const db = load();
      const u = db.users.find((u) => u.phone === phone && u.password === password);
      if (!u) {
        addLog(db, 'login_failed', 'พยายามเข้าสู่ระบบ: ' + phone);
        persist(db);
        throw new Error('เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง');
      }
      if (u.isBanned) throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
      if (!u.isVerified) return { needsOtp: true };
      addLog(db, 'login', 'เข้าสู่ระบบ: ' + u.fullName + ' (' + u.role + ')', u.id);
      persist(db);
      return { token: this.issueToken(u), user: u };
    },

    // GET /api/queues  → { departments, desks, queues } (จริง: กรองตาม JWT role)
    async getQueues() {
      await delay(120);
      const db = load();
      const nameOf = (pid) => {
        const u = db.users.find((u) => u.id === pid);
        return u ? u.fullName : 'ผู้ป่วย (ไม่ระบุตัวตน)';
      };
      return {
        departments: db.departments,
        desks: db.desks,
        queues: db.queues.map((q) => Object.assign({}, q, { patientName: nameOf(q.patientId) })),
      };
    },

    // POST /api/queues  { departmentId, symptoms } — ผู้ป่วยจองคิว (Create)
    async createQueue(patientId, departmentId, symptoms) {
      await delay(350);
      const db = load();
      const user = db.users.find((u) => u.id === patientId);
      if (!user) throw new Error('ไม่พบผู้ใช้');
      if (user.isBanned) throw new Error('บัญชีของคุณถูกระงับการใช้งาน');
      const dept = db.departments.find((d) => d.id === departmentId);
      if (!dept || !dept.isActive) throw new Error('แผนกนี้ไม่ได้เปิดให้บริการ');
      const dup = db.queues.find(
        (q) => q.patientId === patientId && q.departmentId === departmentId &&
               ['waiting', 'called'].includes(q.status)
      );
      if (dup) throw new Error('คุณมีคิวรออยู่ในแผนกนี้แล้ว'); // partial unique index ฝั่ง DB
      const queue = {
        id: uid(),
        number: dept.prefix + '-' + fmt(dept.nextNumber++),
        patientId, departmentId, deskId: null,
        symptoms: (symptoms || '').trim(), // อาการเบื้องต้นที่ผู้ป่วยกรอกตอนจองคิว
        status: 'waiting',
        createdAt: Date.now(), calledAt: null, completedAt: null,
      };
      db.queues.push(queue);
      addLog(db, 'queue_create', 'จองคิว ' + queue.number + ' (' + dept.name + ') — อาการ: ' + queue.symptoms, patientId);
      persist(db);
      return queue;
    },

    // PUT /api/queues/:id  { status, deskId } — Admin เรียกคิว/เปลี่ยนสถานะ (Update)
    async updateQueueStatus(id, status, deskId) {
      await delay(150);
      const db = load();
      const q = db.queues.find((q) => q.id === id);
      if (!q) throw new Error('ไม่พบคิวนี้');
      const dept = db.departments.find((d) => d.id === q.departmentId);
      q.status = status;
      if (status === 'called') {
        const desk = db.desks.find((k) => k.id === deskId) ||
                     db.desks.find((k) => k.departmentId === q.departmentId && k.isActive);
        q.deskId = desk ? desk.id : null;
        q.calledAt = Date.now();
        if (dept) dept.nowServing = numOf(q);
      }
      if (status === 'completed') q.completedAt = Date.now();
      addLog(db, 'queue_update', 'คิว ' + q.number + ' → ' + status);
      persist(db);
      return q;
    },

    // DELETE /api/queues/:id — ผู้ป่วยยกเลิกคิวตัวเอง หรือ Admin ยกเลิกแทน
    async cancelQueue(id) {
      await delay(250);
      const db = load();
      const q = db.queues.find((q) => q.id === id);
      if (q && ['waiting', 'called'].includes(q.status)) {
        q.status = 'cancelled';
        addLog(db, 'queue_cancel', 'ยกเลิกคิว ' + q.number);
      }
      persist(db);
      return { ok: true };
    },

    // PATCH /api/users/:id/ban  { banned } — Admin แบน/ปลดแบน
    async setUserBanned(id, banned) {
      await delay(200);
      const db = load();
      const u = db.users.find((u) => u.id === id);
      if (!u) return { ok: false };
      u.isBanned = banned;
      if (banned) { // แบนแล้วเชิดคิวที่ค้างอยู่ทิ้งด้วย
        db.queues.forEach((q) => {
          if (q.patientId === id && ['waiting', 'called'].includes(q.status)) q.status = 'cancelled';
        });
      }
      addLog(db, banned ? 'user_ban' : 'user_unban', u.fullName);
      persist(db);
      return { ok: true };
    },

    // GET /api/users?role=patient — Admin ดูรายชื่อผู้ป่วย
    async getUsers() {
      await delay(100);
      const db = load();
      return db.users.filter((u) => u.role === 'patient').map((u) =>
        Object.assign({}, u, {
          password: undefined,
          queueCount: db.queues.filter((q) => q.patientId === u.id).length,
        })
      );
    },

    // POST /api/departments — Admin เพิ่มแผนก
    async addDepartment(input) {
      await delay(200);
      const db = load();
      if (db.departments.some((d) => d.name === input.name)) throw new Error('มีแผนกชื่อนี้อยู่แล้ว');
      if (!/^[A-Z]$/.test(input.prefix)) throw new Error('ตัวอักษรนำหน้าคิวต้องเป็น A-Z 1 ตัว');
      const d = {
        id: uid(), name: input.name, description: input.description || '',
        prefix: input.prefix, isActive: true, nextNumber: 1, nowServing: 0,
      };
      db.departments.push(d);
      addLog(db, 'department_create', input.name);
      persist(db);
      return d;
    },

    // PUT /api/departments/:id — Admin แก้ไขแผนก
    async updateDepartment(id, patch) {
      await delay(150);
      const db = load();
      const d = db.departments.find((d) => d.id === id);
      if (!d) throw new Error('ไม่พบแผนก');
      if (patch.name) d.name = patch.name;
      if (patch.description !== undefined) d.description = patch.description;
      addLog(db, 'department_update', d.name);
      persist(db);
      return d;
    },

    // DELETE /api/departments/:id — Admin ลบแผนก (ห้ามถ้ามีคิวค้าง = RESTRICT)
    async deleteDepartment(id) {
      await delay(150);
      const db = load();
      const active = db.queues.filter(
        (q) => q.departmentId === id && ['waiting', 'called'].includes(q.status)
      ).length;
      if (active) throw new Error('ลบไม่ได้: แผนกนี้มีคิวค้างอยู่ ' + active + ' รายการ');
      db.departments = db.departments.filter((d) => d.id !== id);
      db.desks = db.desks.filter((k) => k.departmentId !== id); // ON DELETE CASCADE
      addLog(db, 'department_delete', id);
      persist(db);
      return { ok: true };
    },

    // PATCH /api/departments/:id/active — เปิด/ปิดให้บริการ
    async toggleDepartment(id) {
      await delay(120);
      const db = load();
      const d = db.departments.find((d) => d.id === id);
      if (d) {
        d.isActive = !d.isActive;
        addLog(db, 'department_toggle', d.name + ' = ' + d.isActive);
        persist(db);
      }
      return d;
    },

    // POST /api/desks  { departmentId, name } — Admin เพิ่มโต๊ะตรวจ
    async addDesk(departmentId, name) {
      await delay(150);
      const db = load();
      if (!name || !name.trim()) throw new Error('กรุณาระบุชื่อโต๊ะตรวจ');
      const k = { id: uid(), departmentId, name: name.trim(), isActive: true };
      db.desks.push(k);
      addLog(db, 'desk_create', k.name);
      persist(db);
      return k;
    },

    // DELETE /api/desks/:id — Admin ลบโต๊ะตรวจ
    async deleteDesk(id) {
      await delay(120);
      const db = load();
      db.desks = db.desks.filter((k) => k.id !== id);
      db.queues.forEach((q) => { if (q.deskId === id) q.deskId = null; }); // ON DELETE SET NULL
      addLog(db, 'desk_delete', id);
      persist(db);
      return { ok: true };
    },
  };

  // Export สู่ global
  window.QCare = {
    api, session, load, persist, addLog, delay, uid, numOf, fmt, maskNid, STATUS_TH,
    reset() { localStorage.removeItem(DB_KEY); location.reload(); },
  };
})();
