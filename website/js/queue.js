/* =====================================================================
 * Q-Care — หน้าดูคิว: สถานะคิว Real-time / แจ้งเตือน / กระดานคิว / ประวัติ
 * ===================================================================== */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const Q = window.QCare;
  const { api, numOf, STATUS_TH } = Q;

  // Guard: ต้อง login ด้วย role patient เท่านั้น
  const s = Q.session.require('patient');
  if (!s) return;
  const user = s.user;

  const state = {
    departments: [], desks: [], queues: [],
    myQueue: null, prevStatus: null, notifiedNear: false, showHistory: false,
  };

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

  // Notification: toast บนหน้าเว็บ + Web Notification API (ถ้าอนุญาต)
  function notify(title, body) {
    showToast(title, body);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  // ---------- Real-time: poll ทุก 2.5 วิ + storage event จากแท็บอื่น ----------
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(refresh, 2500);
  }

  async function refresh() {
    const data = await api.getQueues(); // GET /api/queues
    state.departments = data.departments;
    state.desks = data.desks;
    state.queues = data.queues;

    state.myQueue =
      state.queues.find((q) => q.patientId === user.id && ['waiting', 'called'].includes(q.status)) ||
      state.queues
        .filter((q) => q.patientId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null;

    renderMyQueue();
    renderBoard();
    if (state.showHistory) renderHistory();
    $('#last-updated').textContent = new Date().toLocaleTimeString('th-TH');
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'qcare_db_v2') refresh(); // Admin/แท็บอื่นทำรายการ → อัปเดตทันที
  });

  // ---------- คิวของฉัน ----------
  function renderMyQueue() {
    const el = $('#my-queue-card');
    const q = state.myQueue;

    if (user.isBanned) {
      el.innerHTML =
        '<h1>บัญชีถูกระงับ</h1>' +
        '<p class="subtitle">บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่</p>';
      return;
    }

    // ยังไม่มีคิว → ชวนไปจองคิว
    if (!q) {
      state.prevStatus = null; state.notifiedNear = false;
      el.innerHTML =
        '<h1>คิวของฉัน</h1>' +
        '<p class="subtitle">คุณยังไม่มีคิวที่ใช้งานอยู่</p>' +
        '<a class="btn" href="patient.html" style="display:block; text-align:center; text-decoration:none;">ไปจองคิว</a>';
      return;
    }

    const dept = state.departments.find((d) => d.id === q.departmentId);
    const ahead = state.queues.filter(
      (x) => x.departmentId === q.departmentId && ['waiting', 'called'].includes(x.status) && numOf(x) < numOf(q)
    ).length;

    // แจ้งเตือน: ถึงคิว / ใกล้ถึงคิว (เหลือ ≤ 2 คิว)
    if (state.prevStatus && state.prevStatus !== 'called' && q.status === 'called') {
      notify('ถึงคิวของคุณแล้ว!', 'คิว ' + q.number + ' — ' + (dept ? dept.name : '') + ' กรุณาไปที่โต๊ะตรวจ');
    } else if (q.status === 'waiting' && ahead <= 2 && !state.notifiedNear) {
      notify('ใกล้ถึงคิวของคุณแล้ว', 'คิว ' + q.number + ' เหลืออีก ' + ahead + ' คิว — กรุณาเตรียมตัว');
      state.notifiedNear = true;
    }
    if (q.status === 'waiting' && ahead > 2) state.notifiedNear = false;

    let badgeText = 'รออยู่', badgeCls = 'st-waiting';
    let extra = 'มีคิวรอก่อนคุณ ' + ahead + ' คิว · ระบบจะแจ้งเตือนเมื่อใกล้ถึงคิว';
    let pulse = '';
    if (q.status === 'called') {
      const desk = state.desks.find((k) => k.id === q.deskId);
      badgeText = 'เรียกคิวแล้ว — กรุณาเข้าที่โต๊ะตรวจ';
      badgeCls = 'st-called';
      extra = 'โต๊ะตรวจ: ' + (desk ? desk.name : 'รอเจ้าหน้าที่มอบหมาย');
      pulse = 'pulse';
    } else if (q.status === 'skipped') {
      badgeText = 'ถูกข้ามคิว'; badgeCls = 'st-skipped'; extra = 'กรุณาติดต่อเจ้าหน้าที่';
    } else if (q.status === 'completed') {
      badgeText = 'เสร็จสิ้น'; badgeCls = 'st-completed'; extra = 'ขอบคุณที่ใช้บริการ';
    } else if (q.status === 'cancelled') {
      badgeText = 'ยกเลิกแล้ว'; badgeCls = 'st-cancelled'; extra = '';
    }

    el.innerHTML =
      '<h1>คิวของฉัน · ' + (dept ? dept.name : 'ไม่ระบุแผนก') + '</h1>' +
      '<p class="subtitle">หมายเลขคิวของคุณ</p>' +
      '<div class="queue-number ' + pulse + '">' + q.number + '</div>' +
      '<p class="center" style="margin:10px 0 6px;">' +
        '<span class="status-badge ' + badgeCls + '">' + badgeText + '</span>' +
      '</p>' +
      '<p class="meta center">' + extra + '</p>' +
      (q.symptoms
        ? '<div class="symptom-box"><b>อาการเบื้องต้นที่แจ้งไว้:</b><br>' + esc(q.symptoms) + '</div>'
        : '') +
      (['waiting', 'called'].includes(q.status)
        ? '<button id="btn-cancel" class="btn btn-danger" type="button">ยกเลิกคิว</button>'
        : '<button id="btn-rebook" class="btn btn-outline" type="button">จองคิวใหม่</button>');

    // กระพริบการ์ดเมื่อสถานะเปลี่ยน (เห็นชัดว่า DOM อัปเดตแบบ Real-time)
    if (state.prevStatus && state.prevStatus !== q.status) {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    state.prevStatus = q.status;

    const cancel = $('#btn-cancel');
    if (cancel) cancel.addEventListener('click', async () => {
      if (!confirm('ยืนยันการยกเลิกคิว ' + q.number + '?')) return;
      await api.cancelQueue(q.id); // DELETE /api/queues/:id
      await refresh();
    });
    const rebook = $('#btn-rebook');
    if (rebook) rebook.addEventListener('click', () => { location.href = 'patient.html'; });
  }

  function renderBoard() {
    $('#dept-board').innerHTML = state.departments.filter((d) => d.isActive).map((d) => {
      const waiting = state.queues.filter((q) => q.departmentId === d.id && q.status === 'waiting').length;
      const called = state.queues.find((q) => q.departmentId === d.id && q.status === 'called');
      const serving = called ? called.number : d.prefix + '-' + String(d.nowServing).padStart(3, '0');
      return '<div class="dept-row">' +
               '<div><b>' + d.name + '</b><br><span class="meta">กำลังรอ ' + waiting + ' คิว</span></div>' +
               '<div class="serving">' + serving + '</div>' +
             '</div>';
    }).join('') || '<p class="meta center">ไม่มีแผนกเปิดให้บริการ</p>';
  }

  // ---------- ประวัติการจองคิว (Read) ----------
  $('#btn-history').addEventListener('click', () => {
    state.showHistory = !state.showHistory;
    $('#btn-history').textContent = state.showHistory ? 'ซ่อนประวัติการจองคิว' : 'ดูประวัติการจองคิว';
    $('#history-box').classList.toggle('hidden', !state.showHistory);
    if (state.showHistory) renderHistory();
  });

  function renderHistory() {
    const mine = state.queues
      .filter((q) => q.patientId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    $('#history-box').innerHTML = mine.length
      ? mine.map((q) => {
          const d = state.departments.find((x) => x.id === q.departmentId);
          return '<div class="history-item">' +
                   '<span><b class="qn">' + q.number + '</b> · ' + (d ? d.name : '-') + '<br>' +
                   '<span class="meta">' + new Date(q.createdAt).toLocaleString('th-TH') + '</span></span>' +
                   '<span class="status-badge st-' + q.status + '">' + STATUS_TH[q.status] + '</span>' +
                 '</div>';
        }).join('')
      : '<p class="meta center">ยังไม่มีประวัติการจองคิว</p>';
  }

  refresh();
  startPolling();
})();
