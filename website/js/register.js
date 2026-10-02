/* =====================================================================
 * Q-Care — หน้าสมัครสมาชิก: ลงทะเบียน + ยืนยัน OTP
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

  // ---------- Register ----------
  $('#form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reg-error');
    err.textContent = '';
    const data = {
      fullName:   $('#reg-name').value.trim(),
      nationalId: $('#reg-nid').value.trim(),
      phone:      $('#reg-phone').value.trim(),
      password:   $('#reg-pass').value,
    };
    if (!data.fullName)                       { err.textContent = 'กรุณากรอกชื่อ-นามสกุล'; return; }
    if (!/^[0-9]{13}$/.test(data.nationalId)) { err.textContent = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'; return; }
    if (!/^0[0-9]{9}$/.test(data.phone))      { err.textContent = 'เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 10 หลัก'; return; }
    if (data.password.length < 8)             { err.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'; return; }
    try {
      const res = await api.register(data); // POST /api/auth/register
      enterOtpView(data.phone, res.devCode);
    } catch (ex) { err.textContent = ex.message; }
  });

  // ---------- OTP (Mock-up Verification) ----------
  let otpTimer = null;
  const state = { phone: null };

  function enterOtpView(phone, devCode) {
    state.phone = phone;
    $('#otp-phone').textContent = phone;
    $('#otp-dev-code').textContent = devCode; // จำลอง SMS
    $('#form-register').classList.add('hidden');
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

  // ---------- สมัครสำเร็จ → เข้าสู่ระบบแล้วไปหน้าจองคิว ----------
  function enterSuccess(token, user) {
    session.set({ token, user });
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setTimeout(() => { location.href = 'patient.html'; }, 600);
  }
})();
