/* =====================================================================
 * Q-Care — หน้าจองคิว: เลือกแผนก + กรอกอาการเบื้องต้น (Create)
 * ===================================================================== */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const Q = window.QCare;
  const { api } = Q;

  // Guard: ต้อง login ด้วย role patient เท่านั้น
  const s = Q.session.require('patient');
  if (!s) return;
  const user = s.user;

  const state = { departments: [], queues: [] };

  $('#nav-user').textContent = user.fullName;
  $('#btn-logout').addEventListener('click', () => {
    Q.session.clear();
    location.href = 'index.html';
  });

  function showToast(title, body) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<b>' + title + '</b><div class="meta" style="color:#cbd5e1;">' + body + '</div>';
    $('#toast-wrap').appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Real-time: poll ทุก 2.5 วิ + storage event จากแท็บอื่น ----------
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(refresh, 2500);
  }

  async function refresh() {
    const data = await api.getQueues(); // GET /api/queues
    state.departments = data.departments;
    state.queues = data.queues;
    renderBooking();
    $('#last-updated').textContent = new Date().toLocaleTimeString('th-TH');
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'qcare_db_v2') refresh();
  });

  const waitingOf = (deptId) =>
    state.queues.filter((q) => q.departmentId === deptId && q.status === 'waiting').length;

  const findActive = () => state.queues.find(
    (q) => q.patientId === user.id && ['waiting', 'called'].includes(q.status)
  ) || null;

  const deptOptions = () => state.departments.filter((d) => d.isActive).map((d) =>
    '<option value="' + d.id + '">' + d.name + ' (กำลังรอ ' + waitingOf(d.id) + ' คิว)</option>'
  ).join('') || '<option value="">ไม่มีแผนกเปิดให้บริการ</option>';

  let currentView = null; // 'form' | 'active' | 'banned'

  // ---------- ฟอร์มจองคิว ----------
  // สร้าง DOM ใหม่เฉพาะเมื่อ "สถานะมุมมอง" เปลี่ยนเท่านั้น — ห้าม re-render ทุก poll
  // (ไม่งั้นข้อความที่กำลังพิมพ์ใน textarea จะถูกลบทิ้งทุก 2.5 วินาที)
  function renderBooking() {
    const el = $('#booking-card');
    const active = findActive();
    const view = user.isBanned ? 'banned' : (active ? 'active' : 'form');

    // ฟอร์มเดิมยังอยู่ → อัปเดตแค่จำนวนคิวรอใน dropdown (คงค่าที่เลือก + ข้อความที่พิมพ์)
    if (view === 'form' && currentView === 'form') {
      const sel = $('#book-dept');
      if (sel) {
        const prev = sel.value;
        sel.innerHTML = deptOptions();
        if (Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
      }
      return;
    }
    if (view === currentView) return;
    currentView = view;

    if (view === 'banned') {
      el.innerHTML =
        '<h1>บัญชีถูกระงับ</h1>' +
        '<p class="subtitle">บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่</p>';
      return;
    }

    // มีคิวที่ยังใช้งานอยู่ → ไม่ให้จองซ้ำ พาไปหน้าดูคิวแทน
    if (view === 'active') {
      const dept = state.departments.find((d) => d.id === active.departmentId);
      el.innerHTML =
        '<h1>จองคิวตรวจ</h1>' +
        '<p class="subtitle">คุณมีคิวที่ใช้งานอยู่แล้ว</p>' +
        '<div class="queue-number">' + active.number + '</div>' +
        '<p class="meta center" style="margin:8px 0 14px;">' + (dept ? dept.name : 'ไม่ระบุแผนก') +
          ' · สถานะ: ' + (active.status === 'called' ? 'เรียกคิวแล้ว' : 'รออยู่') + '</p>' +
        '<a class="btn" href="queue.html" style="display:block; text-align:center; text-decoration:none;">ไปดูคิวของฉัน</a>';
      return;
    }

    // ยังไม่มีคิว → ฟอร์มจองคิว (Create)
    el.innerHTML =
      '<h1>จองคิวตรวจ</h1>' +
      '<p class="subtitle">เลือกแผนกและกรอกอาการเบื้องต้นเพื่อช่วยให้เจ้าหน้าที่เตรียมตัวรับคุณ</p>' +

      '<label for="book-name">ชื่อ-นามสกุลของคุณ</label>' +
      '<input type="text" value="' + esc(user.fullName) + '" disabled />' +

      '<label for="book-dept">เลือกแผนก</label>' +
      '<select id="book-dept">' + deptOptions() + '</select>' +

      '<label for="book-symptoms">อาการเบื้องต้น <span class="meta">(จำเป็น)</span></label>' +
      '<textarea id="book-symptoms" rows="4" maxlength="500" ' +
        'placeholder="เช่น มีไข้ 2 วัน ปวดหัว และเจ็บคอ ยังไม่ได้ทานยาลดไข้"></textarea>' +

      '<p id="book-error" class="error-msg"></p>' +
      '<button id="btn-book" class="btn" type="button">จองคิว</button>';

    $('#btn-book').addEventListener('click', async () => {
      const err = $('#book-error');
      err.textContent = '';
      const deptId = $('#book-dept').value;
      const symptoms = $('#book-symptoms').value.trim();
      if (!deptId)                  { err.textContent = 'ไม่มีแผนกเปิดให้บริการ'; return; }
      if (symptoms.length < 5)      { err.textContent = 'กรุณากรอกอาการเบื้องต้นอย่างน้อย 5 ตัวอักษร'; return; }
      try {
        await api.createQueue(user.id, deptId, symptoms); // POST /api/queues
        showToast('จองคิวสำเร็จ', 'กำลังพาไปดูคิวของคุณ…');
        setTimeout(() => { location.href = 'queue.html'; }, 800);
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  refresh();
  startPolling();
})();
