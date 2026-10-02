/* =====================================================================
 * Q-Care — หน้า Admin: Dashboard / เรียกคิว / CRUD แผนก-โต๊ะตรวจ / แบนผู้ใช้
 * ===================================================================== */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const Q = window.QCare;
  const { api, numOf, fmt, maskNid, STATUS_TH } = Q;

  // escape ข้อความที่ผู้ใช้กรอกเอง (เช่น อาการเบื้องต้น) ก่อนแสดงผลใน HTML
  const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Guard: ต้อง login ด้วย role admin เท่านั้น
  const s = Q.session.require('admin');
  if (!s) return;
  const user = s.user;

  const state = {
    departments: [], desks: [], queues: [], patients: [],
    deptFilter: 'all', selectedDesk: {}, // { queueId: deskId } คงค่า dropdown ตอน re-render
  };

  $('#nav-admin').textContent = user.fullName + ' (เจ้าหน้าที่)';
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

  // ---------- Real-time: poll ทุก 2.5 วิ + storage event ----------
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
    state.patients = await api.getUsers(); // GET /api/users?role=patient

    renderStats();
    renderAdminQueues();
    renderDeptManager();
    renderUsers();
  }

  window.addEventListener('storage', (e) => {
    if (e.key === 'qcare_db_v1') refresh(); // แท็บอื่นทำรายการ → อัปเดตทันที
  });

  // ---------- (Read) สถิติภาพรวม ----------
  function renderStats() {
    const stats = [
      { num: state.queues.filter((q) => q.status === 'waiting').length, lbl: 'ผู้ป่วยรอเรียกคิว' },
      { num: state.queues.filter((q) => q.status === 'called').length,  lbl: 'กำลังเรียก/ตรวจ' },
      { num: state.queues.filter((q) => ['completed', 'skipped'].includes(q.status)).length, lbl: 'เสร็จสิ้นวันนี้' },
      { num: state.patients.length, lbl: 'ผู้ป่วยลงทะเบียน' },
    ];
    $('#stats').innerHTML = stats.map(
      (x) => '<div class="stat"><div class="stat-num">' + x.num + '</div><div class="stat-lbl">' + x.lbl + '</div></div>'
    ).join('');
  }

  // ---------- (Update/Delete) ตารางจัดการคิว ----------
  $('#admin-dept-filter').addEventListener('change', (e) => {
    state.deptFilter = e.target.value;
    renderAdminQueues();
  });

  function renderAdminQueues() {
    // filter dropdown (คงค่า selection)
    const filter = $('#admin-dept-filter');
    const opts = ['<option value="all"' + (state.deptFilter === 'all' ? ' selected' : '') + '>ทุกแผนก</option>']
      .concat(state.departments.map((d) =>
        '<option value="' + d.id + '"' + (d.id === state.deptFilter ? ' selected' : '') + '>' + d.name + '</option>'));
    if (filter.innerHTML !== opts.join('')) filter.innerHTML = opts.join('');

    const rows = state.queues
      .filter((q) => ['waiting', 'called'].includes(q.status))
      .filter((q) => state.deptFilter === 'all' || q.departmentId === state.deptFilter)
      .sort((a, b) => (a.departmentId > b.departmentId ? 1 : -1) || (numOf(a) - numOf(b)));

    $('#admin-queues').innerHTML =
      '<table class="tbl"><thead><tr>' +
        '<th>คิว</th><th>ผู้ป่วย</th><th>แผนก</th><th>อาการเบื้องต้น</th><th>สถานะ</th><th>การดำเนินการ</th>' +
      '</tr></thead><tbody>' +
      (rows.map((q) => {
        const dept = state.departments.find((d) => d.id === q.departmentId);
        const desks = state.desks.filter((k) => k.departmentId === q.departmentId && k.isActive);
        const actions = q.status === 'called'
          ? '<button class="btn btn-sm btn-success" data-action="complete" data-id="' + q.id + '">เสร็จสิ้น</button>' +
            '<button class="btn btn-sm btn-gray"    data-action="cancel"   data-id="' + q.id + '">ยกเลิก</button>'
          : '<select class="small desk-select" data-id="' + q.id + '" title="เลือกโต๊ะตรวจ">' +
              desks.map((k) =>
                '<option value="' + k.id + '"' + (state.selectedDesk[q.id] === k.id ? ' selected' : '') + '>' + k.name + '</option>'
              ).join('') +
            '</select>' +
            '<button class="btn btn-sm"            data-action="call"   data-id="' + q.id + '">เรียกคิว</button>' +
            '<button class="btn btn-sm btn-danger" data-action="skip"   data-id="' + q.id + '">ข้ามคิว</button>' +
            '<button class="btn btn-sm btn-gray"   data-action="cancel" data-id="' + q.id + '">ยกเลิก</button>';
        return '<tr>' +
          '<td class="qn">' + q.number + '</td>' +
          '<td>' + q.patientName + '</td>' +
          '<td>' + (dept ? dept.name : '-') + '</td>' +
          '<td class="meta" style="max-width:200px;">' + (q.symptoms ? esc(q.symptoms) : '-') + '</td>' +
          '<td><span class="status-badge st-' + q.status + '">' + STATUS_TH[q.status] + '</span></td>' +
          '<td>' + actions + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="6" class="meta center">ไม่มีคิวรออยู่</td></tr>') +
      '</tbody></table>';
  }

  // Event delegation สำหรับปุ่มจัดการคิว
  $('#admin-queues').addEventListener('change', (e) => {
    if (e.target.matches('.desk-select')) state.selectedDesk[e.target.dataset.id] = e.target.value;
  });
  $('#admin-queues').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    try {
      if (action === 'call')     await api.updateQueueStatus(id, 'called', state.selectedDesk[id]); // PUT /api/queues/:id
      if (action === 'complete') await api.updateQueueStatus(id, 'completed');
      if (action === 'skip')     await api.updateQueueStatus(id, 'skipped');
      if (action === 'cancel') {
        if (!confirm('ยืนยันการยกเลิกคิวนี้?')) return;
        await api.cancelQueue(id); // DELETE /api/queues/:id
      }
      await refresh();
    } catch (ex) { showToast('เกิดข้อผิดพลาด', ex.message); }
  });

  // ---------- (CRUD) แผนก + โต๊ะตรวจ ----------
  $('#btn-add-dept').addEventListener('click', async () => {
    const err = $('#dept-error');
    err.textContent = '';
    try {
      await api.addDepartment({ // POST /api/departments
        name: $('#dept-new-name').value.trim(),
        description: '',
        prefix: $('#dept-new-prefix').value.trim().toUpperCase(),
      });
      $('#dept-new-name').value = ''; $('#dept-new-prefix').value = '';
      await refresh();
      showToast('สำเร็จ', 'เพิ่มแผนกใหม่แล้ว');
    } catch (ex) { err.textContent = ex.message; }
  });

  function renderDeptManager() {
    $('#dept-manager').innerHTML = state.departments.map((d) => {
      const desks = state.desks.filter((k) => k.departmentId === d.id);
      const waiting = state.queues.filter((q) => q.departmentId === d.id && q.status === 'waiting').length;
      return '<div class="dept-item">' +
        '<div class="dept-head">' +
          '<div>' +
            '<b>' + d.name + '</b> <span class="meta">[คิว ' + d.prefix + '-xxx]</span> ' +
            (d.isActive ? '' : '<span class="status-badge st-cancelled">ปิดให้บริการ</span>') +
            '<br><span class="meta">' + (d.description || '-') + ' · คิวรอ ' + waiting + ' · โต๊ะตรวจ ' + desks.length + ' โต๊ะ</span>' +
          '</div>' +
          '<div>' +
            '<button class="btn btn-sm btn-outline" data-daction="edit"   data-id="' + d.id + '">แก้ไข</button>' +
            '<button class="btn btn-sm btn-gray"    data-daction="toggle" data-id="' + d.id + '">' + (d.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button>' +
            '<button class="btn btn-sm btn-danger"  data-daction="delete" data-id="' + d.id + '">ลบ</button>' +
          '</div>' +
        '</div>' +
        '<div>' +
          desks.map((k) =>
            '<span class="desk-chip">' + k.name +
              '<button data-kaction="del" data-id="' + k.id + '" title="ลบโต๊ะ">×</button>' +
            '</span>'
          ).join('') +
        '</div>' +
        '<div class="inline-form">' +
          '<input type="text" placeholder="เพิ่มโต๊ะตรวจ เช่น โต๊ะตรวจ ' + (desks.length + 1) + '" data-newdesk="' + d.id + '" />' +
          '<button class="btn btn-sm" data-daction="adddesk" data-id="' + d.id + '">เพิ่มโต๊ะ</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  $('#dept-manager').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-daction], button[data-kaction]');
    if (!btn) return;
    try {
      if (btn.dataset.kaction === 'del') {
        await api.deleteDesk(btn.dataset.id); // DELETE /api/desks/:id
      } else {
        const id = btn.dataset.id;
        switch (btn.dataset.daction) {
          case 'edit': {
            const d = state.departments.find((x) => x.id === id);
            const name = prompt('ชื่อแผนกใหม่:', d.name);
            if (name === null) return;
            const desc = prompt('คำอธิบายแผนก:', d.description || '');
            await api.updateDepartment(id, { name: name.trim(), description: desc }); // PUT /api/departments/:id
            break;
          }
          case 'toggle':
            await api.toggleDepartment(id);
            break;
          case 'delete':
            if (!confirm('ยืนยันการลบแผนกนี้?')) return;
            await api.deleteDepartment(id); // DELETE /api/departments/:id
            break;
          case 'adddesk': {
            const input = document.querySelector('input[data-newdesk="' + id + '"]');
            await api.addDesk(id, input.value); // POST /api/desks
            break;
          }
        }
      }
      await refresh();
    } catch (ex) { showToast('เกิดข้อผิดพลาด', ex.message); }
  });

  // ---------- (Delete) แบนผู้ใช้ ----------
  function renderUsers() {
    $('#user-manager').innerHTML =
      '<table class="tbl"><thead><tr>' +
        '<th>ชื่อ-นามสกุล</th><th>เบอร์โทร</th><th>เลขบัตร</th><th>ยืนยันตัวตน</th><th>จำนวนคิว</th><th>สถานะ</th><th>การดำเนินการ</th>' +
      '</tr></thead><tbody>' +
      (state.patients.map((u) =>
        '<tr>' +
          '<td>' + u.fullName + '</td>' +
          '<td>' + u.phone + '</td>' +
          '<td class="meta">' + maskNid(u.nationalId) + '</td>' +
          '<td>' + (u.isVerified ? '✔' : '✘') + '</td>' +
          '<td>' + u.queueCount + '</td>' +
          '<td>' + (u.isBanned
            ? '<span class="status-badge st-skipped">ถูกแบน</span>'
            : '<span class="status-badge st-called">ปกติ</span>') + '</td>' +
          '<td>' + (u.isBanned
            ? '<button class="btn btn-sm btn-outline" data-uaction="unban" data-id="' + u.id + '">ปลดแบน</button>'
            : '<button class="btn btn-sm btn-danger" data-uaction="ban" data-id="' + u.id + '">แบน</button>') + '</td>' +
        '</tr>'
      ).join('') || '<tr><td colspan="7" class="meta center">ยังไม่มีผู้ป่วยลงทะเบียน</td></tr>') +
      '</tbody></table>';
  }

  $('#user-manager').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-uaction]');
    if (!btn) return;
    const ban = btn.dataset.uaction === 'ban';
    if (ban && !confirm('ยืนยันการแบนผู้ใช้นี้? (คิวที่ค้างอยู่จะถูกยกเลิก)')) return;
    await api.setUserBanned(btn.dataset.id, ban); // PATCH /api/users/:id/ban
    await refresh();
  });

  // ---------- โหมดสาธิต: เรียก/จบคิวอัตโนมัติทุก 6 วิ ----------
  let demoTimer = null;
  $('#demo-mode').addEventListener('change', (e) => {
    clearInterval(demoTimer); demoTimer = null;
    if (e.target.checked) {
      demoTimer = setInterval(async () => {
        for (const d of state.departments) {
          const called = state.queues.find((q) => q.departmentId === d.id && q.status === 'called');
          if (called) {
            await api.updateQueueStatus(called.id, 'completed');
          } else {
            const next = state.queues
              .filter((q) => q.departmentId === d.id && q.status === 'waiting')
              .sort((a, b) => numOf(a) - numOf(b))[0];
            if (next) await api.updateQueueStatus(next.id, 'called');
          }
        }
        await refresh();
      }, 6000);
    }
  });

  refresh();
  startPolling();
})();
