/* =====================================================================
 * Q-Care — หน้าแรก (Login): เข้าสู่ระบบ + OTP สำหรับบัญชีที่ยังไม่ยืนยันตัวตน
 * ===================================================================== */
(function () {
  'use strict';
  const $ = (sel) => document.querySelector(sel);
  const { api, session } = window.QCare;

  // ถ้า login อยู่แล้ว → ส่งเข้าหน้าตาม role ทันที
  const existing = session.get();
  if (existing) {
    location.replace(existing.user.role === 'admin' ? 'admin.html' : 'patient.html');
    return;
  }

  function showToast(title, body) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<b>' + title + '</b><div class="meta" style="color:#cbd5e1;">' + body + '</div>';
    $('#toast-wrap').appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ---------- Login ----------
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const phone = $('#login-phone').value.trim();
    if (!/^0[0-9]{9}$/.test(phone)) { err.textContent = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 10 หลัก'; return; }
    if (!$('#login-pass').value)    { err.textContent = 'กรุณากรอกรหัสผ่าน'; return; }
    try {
      const res = await api.login(phone, $('#login-pass').value); // POST /api/auth/login
      if (res.needsOtp) {
        const otp = await api.requestOtp(phone);
        enterOtpView(phone, otp.devCode);
        return;
      }
      enterSuccess(res.token, res.user);
    } catch (ex) { err.textContent = ex.message; }
  });

  // ---------- OTP (Mock-up Verification) ----------
  let otpTimer = null;
  const state = { phone: null };

  function enterOtpView(phone, devCode) {
    state.phone = phone;
    $('#otp-phone').textContent = phone;
    $('#otp-dev-code').textContent = devCode; // จำลอง SMS
    $('#form-login').classList.add('hidden');
    $('#otp-block').classList.remove('hidden');
    $('#otp-input').value = '';
    $('#otp-error').textContent = '';
    startCountdown(60);
    $('#otp-input').focus();
  }

  function startCountdown(sec) {
    clearInterval(otpTimer);
    const btn = $('#btn-resend');
    btn.disabled = true;
    $('#otp-countdown').textContent = sec;
    otpTimer = setInterval(() => {
      sec--;
      $('#otp-countdown').textContent = Math.max(sec, 0);
      if (sec <= 0) { clearInterval(otpTimer); btn.disabled = false; }
    }, 1000);
  }

  $('#btn-resend').addEventListener('click', async () => {
    const res = await api.requestOtp(state.phone);
    $('#otp-dev-code').textContent = res.devCode;
    startCountdown(60);
  });

  $('#form-otp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#otp-error');
    err.textContent = '';
    const code = $('#otp-input').value.trim();
    if (!/^[0-9]{6}$/.test(code)) { err.textContent = 'กรุณากรอกรหัส OTP 6 หลัก'; return; }
    try {
      const res = await api.verifyOtp(state.phone, code); // POST /api/auth/otp/verify
      clearInterval(otpTimer);
      enterSuccess(res.token, res.user);
    } catch (ex) { err.textContent = ex.message; }
  });

  // ---------- Login สำเร็จ → เก็บ session แล้วไปหน้าตาม role ----------
  function enterSuccess(token, user) {
    session.set({ token, user });
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    showToast('เข้าสู่ระบบสำเร็จ', 'ยินดีต้อนรับ ' + user.fullName);
    setTimeout(() => {
      location.href = user.role === 'admin' ? 'admin.html' : 'patient.html';
    }, 600);
  }
})();
