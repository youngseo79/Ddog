// =============================================
// config.js — Supabase 설정 & 전역 상태
// =============================================

const SUPABASE_URL  = 'https://trufhkgiorgnabfppztw.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRydWZoa2dpb3JnbmFiZnBwenR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzcxNzUsImV4cCI6MjA5MzExMzE3NX0.zsrG9HOrE3av7lgB7tUls9igCdAkelh_nsF7buP6DXk';
const TABLE_NAME    = 'ddog';

// Supabase REST 클라이언트
const DB = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
};

// 로그인 후 JWT 토큰으로 Authorization 헤더 교체
function setAuthToken(jwt) {
  DB.headers['Authorization'] = `Bearer ${jwt}`;
}

// JWT 페이로드에서 현재 유저 UUID 추출
function getCurrentUserId() {
  const session = loadSession();
  if (!session || !session.access_token) return null;
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]));
    return payload.sub;
  } catch(e) { return null; }
}

// Supabase JS SDK 클라이언트 (Realtime용)
let supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

// ── 브루트포스 방어: 5회 실패 → 10분 잠금 ──
const LOGIN_FAIL_KEY  = 'ddog_login_fails';
const LOGIN_LOCK_KEY  = 'ddog_login_lock_until';
const MAX_FAILS       = 5;
const LOCK_MINUTES    = 10;

function getLoginFails()   { return parseInt(localStorage.getItem(LOGIN_FAIL_KEY) || '0'); }
function getLockUntil()    { return parseInt(localStorage.getItem(LOGIN_LOCK_KEY) || '0'); }

function recordLoginFail() {
  const fails = getLoginFails() + 1;
  localStorage.setItem(LOGIN_FAIL_KEY, fails);
  if (fails >= MAX_FAILS) {
    localStorage.setItem(LOGIN_LOCK_KEY, Date.now() + LOCK_MINUTES * 60 * 1000);
    localStorage.setItem(LOGIN_FAIL_KEY, '0');
  }
}

function clearLoginFails() {
  localStorage.removeItem(LOGIN_FAIL_KEY);
  localStorage.removeItem(LOGIN_LOCK_KEY);
}

function getLoginLockRemaining() {
  const until = getLockUntil();
  if (!until) return 0;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

// ── 세션 저장 / 로드 / 삭제 ──
function saveSession(session) {
  if (!session.expires_at && session.expires_in) {
    session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
  }
  localStorage.setItem('ddog_sb_session', JSON.stringify(session));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem('ddog_sb_session')); }
  catch(e) { return null; }
}
function clearSession() { localStorage.removeItem('ddog_sb_session'); }

function isTokenExpired(session) {
  if (!session || !session.expires_at) return true;
  return Date.now() / 1000 > session.expires_at - 300; // 만료 5분 전 갱신
}

async function refreshSession(session) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('세션 갱신 실패');
  return data;
}

// ── 백그라운드 JWT 자동 갱신 ──
let _tokenRefreshTimer = null;

function startTokenRefresh() {
  if (_tokenRefreshTimer) clearInterval(_tokenRefreshTimer);
  // 10분마다 체크 (JWT 7일, 만료 5분 전에 갱신)
  _tokenRefreshTimer = setInterval(async () => {
    const session = loadSession();
    if (!session || !session.access_token) return;
    if (isTokenExpired(session)) {
      try {
        const newSession = await refreshSession(session);
        saveSession(newSession);
        setAuthToken(newSession.access_token);
        await getSupabaseClient().auth.setSession({
          access_token: newSession.access_token,
          refresh_token: newSession.refresh_token
        });
        // 토큰 갱신 후 Realtime 채널도 새 토큰으로 재연결
        if (typeof startRealtime === 'function') startRealtime();
      } catch(e) {
        console.warn('[auth] 토큰 갱신 실패:', e);
      }
    }
  }, 10 * 60 * 1000); // 10분마다
}

// ── 앱 시작 시 인증 확인 ──
// 로컬 세션이 유효하면 즉시 true 반환 (스플래시만 잠깐 보임)
// 만료된 경우만 Supabase에 refresh 요청
async function initAuth() {
  let session = loadSession();
  if (!session || !session.access_token) return false;

  if (isTokenExpired(session)) {
    try {
      session = await refreshSession(session);
      saveSession(session);
    } catch(e) {
      clearSession();
      return false;
    }
  }

  setAuthToken(session.access_token);
  try {
    await getSupabaseClient().auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  } catch(e) {}
  startTokenRefresh();
  return true;
}

// ── 로그인 폼 이벤트 연결 ──
function initLoginForm() {
  const emailInput    = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const errorEl       = document.getElementById('login-error');
  const btnText       = document.getElementById('login-btn-text');
  const spinner       = document.getElementById('login-spinner');
  const submitBtn     = document.getElementById('login-btn');

  function updateLockUI() {
    const remaining = getLoginLockRemaining();
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60);
      errorEl.textContent = `로그인 시도가 너무 많아요. ${mins}분 후 다시 시도해주세요.`;
      submitBtn.disabled = true;
      setTimeout(updateLockUI, 15000);
    } else {
      submitBtn.disabled = false;
      if (errorEl.textContent.includes('분 후')) errorEl.textContent = '';
    }
  }
  updateLockUI();

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const lockRemaining = getLoginLockRemaining();
    if (lockRemaining > 0) {
      errorEl.textContent = `${Math.ceil(lockRemaining / 60)}분 후 다시 시도해주세요.`;
      return;
    }

    errorEl.textContent = '';
    btnText.textContent = '';
    spinner.style.display = 'inline-block';
    submitBtn.disabled = true;

    try {
      const session = await signIn(emailInput.value.trim(), passwordInput.value);
      clearLoginFails();
      saveSession(session);
      setAuthToken(session.access_token);
      await getSupabaseClient().auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });
      startTokenRefresh();
      await showApp();
    } catch(err) {
      recordLoginFail();
      const lockRemain = getLoginLockRemaining();
      if (lockRemain > 0) {
        errorEl.textContent = `로그인 시도가 너무 많아요. ${LOCK_MINUTES}분 후 다시 시도해주세요.`;
        submitBtn.disabled = true;
        setTimeout(updateLockUI, 15000);
      } else {
        const left = MAX_FAILS - getLoginFails();
        errorEl.textContent = `이메일 또는 비밀번호가 올바르지 않아요. (${left}회 남음)`;
        submitBtn.disabled = false;
      }
    } finally {
      btnText.textContent = '로그인';
      spinner.style.display = 'none';
    }
  });
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || '로그인 실패');
  return data;
}

// 스플래시 숨기고 앱 표시 (페이드 전환)
async function showApp() {
  const splash = document.getElementById('splash-screen');
  const login  = document.getElementById('login-screen');
  const app    = document.getElementById('app');

  // 앱 먼저 준비 (숨긴 상태로)
  app.style.display = '';
  app.style.opacity = '0';

  // bootApp 실행
  await bootApp();

  // 스플래시/로그인 페이드아웃, 앱 페이드인
  if (splash) { splash.style.transition = 'opacity 0.3s'; splash.style.opacity = '0'; }
  if (login)  { login.style.transition  = 'opacity 0.3s'; login.style.opacity  = '0'; }
  app.style.transition = 'opacity 0.3s';
  app.style.opacity = '1';

  setTimeout(() => {
    if (splash) splash.style.display = 'none';
    if (login)  login.style.display  = 'none';
    app.style.transition = '';
    app.style.opacity = '';
  }, 320);
}

// 전역 앱 상태
const AppState = {
  selectedDate: toLocalDateStr(new Date()),
  calYear:  new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  todos: [],
  dotDates: new Set(),
  pastUndoneDates: new Set(),
  editingId: null,
  isOnline: navigator.onLine,
};

window.addEventListener('online',  () => { AppState.isOnline = true;  onOnline(); });
window.addEventListener('offline', () => { AppState.isOnline = false; });

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr()    { return toLocalDateStr(new Date()); }

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateStr(d);
}

function daysBeforeStr(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() - n); return toLocalDateStr(d);
}

function showToast(msg, duration = 2000) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}
