// =============================================
// config.js — Supabase 설정 & 전역 상태
// =============================================

const SUPABASE_URL  = 'https://trufhkgiorgnabfppztw.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRydWZoa2dpb3JnbmFiZnBwenR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzcxNzUsImV4cCI6MjA5MzExMzE3NX0.zsrG9HOrE3av7lgB7tUls9igCdAkelh_nsF7buP6DXk';
// ── 모드(일반/업무) ──
// 접속·새로고침 시 항상 일반 모드로 시작
// (실행 중 전환은 workmode.js가 APP_MODE / TABLE_NAME 값을 바꿔서 처리)
let APP_MODE = 'personal';
let TABLE_NAME      = APP_MODE === 'work' ? 'ddog_work' : 'ddog';

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
// ※ 출입증(토큰) 관리는 이 파일의 코드만 담당한다.
//   SDK는 실시간 연결에 쓸 토큰을 여기서 받아가기만 하고, 스스로 갱신·저장하지 않는다.
//   (예전에는 SDK도 따로 갱신해서, 이미 쓴 리프레시 토큰을 두 번 쓰게 되면
//    Supabase가 세션 전체를 끊어 로그아웃되는 문제가 있었음)
let supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseClient) {
    // 예전 SDK가 따로 저장해 두던 출입증 사본 정리 (이제 쓰지 않음)
    try {
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
      localStorage.removeItem(`sb-${ref}-auth-token`);
    } catch(e) {}
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      accessToken: async () => {
        const s = loadSession();
        return (s && s.access_token) ? s.access_token : null;
      }
    });
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

// 갱신 실패 시 error.invalid 로 원인을 구분
//   invalid = true  → 서버가 "이 출입증은 무효"라고 답함 (진짜 로그아웃 대상)
//   invalid = false → 인터넷 끊김·서버 일시 오류 (출입증은 그대로 두고 나중에 재시도)
async function refreshSession(session) {
  if (!session || !session.refresh_token) {
    const err = new Error('리프레시 토큰 없음'); err.invalid = true; throw err;
  }
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
  } catch(e) {
    const err = new Error('네트워크 오류로 세션 갱신 실패'); err.invalid = false; throw err;
  }
  let data = null;
  try { data = await res.json(); } catch(e) {}
  if (!res.ok) {
    const err = new Error(`세션 갱신 실패 (${res.status})`);
    err.invalid = (res.status === 400 || res.status === 401 || res.status === 403);
    throw err;
  }
  if (!data || !data.access_token) {
    const err = new Error('세션 갱신 응답 이상'); err.invalid = false; throw err;
  }
  return data;
}

// ── 출입증 갱신 단일 창구 ──
// 여러 곳(타이머·화면 복귀·인터넷 연결)에서 동시에 불려도 실제 갱신 요청은 한 번만 나감
// 결과: 'none' | 'valid' | 'refreshed' | 'invalid' | 'offline'
let _refreshPromise = null;
let _authStale = false;   // 만료된 출입증으로 버티는 중 (인터넷 끊김 등) → 갱신되면 동기화 다시
let _appReady  = false;   // bootApp 완료 여부 (완료 전에는 동기화 재시작을 하지 않음)

function refreshNow() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    // 매번 저장소에서 다시 읽음 (다른 창에서 이미 갱신했을 수 있음)
    const session = loadSession();
    if (!session || !session.access_token) return 'none';
    if (!isTokenExpired(session)) {
      setAuthToken(session.access_token);
      return 'valid';
    }
    try {
      const newSession = await refreshSession(session);
      saveSession(newSession);
      setAuthToken(newSession.access_token);
      return 'refreshed';
    } catch(e) {
      console.warn('[auth] 토큰 갱신 실패:', e);
      if (e.invalid) {
        // 요청하는 사이 다른 창이 먼저 갱신했다면 그 새 출입증을 사용
        const cur = loadSession();
        if (cur && cur.access_token && cur.refresh_token !== session.refresh_token) {
          setAuthToken(cur.access_token);
          return 'refreshed';
        }
        return 'invalid';
      }
      return 'offline';
    }
  })().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// 출입증이 새로 바뀐 뒤 처리
function _onTokenRefreshed() {
  if (!_appReady) return;   // 앱 준비 전이면 showApp 완료 시 다시 확인
  // Realtime 채널도 새 토큰으로 재연결 (기존 동작)
  if (typeof startRealtime === 'function') startRealtime();
  // 만료된 출입증으로 버티던 중이었다면, 그동안 못 한 동기화를 다시 진행
  if (_authStale) {
    _authStale = false;
    if (typeof flushQueue === 'function') flushQueue().catch(e => console.warn('[auth] flush 실패', e));
    if (typeof bgSync === 'function') {
      bgSync().catch(e => {
        console.warn('[sync] bg sync 실패', e);
        if (typeof refreshCurrentTab === 'function') refreshCurrentTab();
        if (typeof updateMonthDots === 'function') updateMonthDots();
      });
    }
  }
}

// 갱신 시도 + 결과 처리 (백그라운드용)
let _refreshRetryTimer = null;
async function _checkAndRefresh() {
  const r = await refreshNow();
  if (r === 'refreshed' || (r === 'valid' && _authStale)) {
    _onTokenRefreshed();
  } else if (r === 'offline') {
    _authStale = true;
    // 인터넷이 약한 경우 대비: 30초 후 다시 시도 (연결되면 성공할 때까지 반복)
    if (!_refreshRetryTimer) {
      _refreshRetryTimer = setTimeout(() => {
        _refreshRetryTimer = null;
        _checkAndRefresh();
      }, 30 * 1000);
    }
  }
  // 'invalid'는 기존과 동일하게 실행 중에는 로그아웃시키지 않음 (다음 앱 시작 시 처리)
}

// ── 백그라운드 JWT 자동 갱신 ──
let _tokenRefreshTimer = null;
let _refreshListenersAdded = false;

function startTokenRefresh() {
  if (_tokenRefreshTimer) clearInterval(_tokenRefreshTimer);
  // 10분마다 체크 (JWT 7일, 만료 5분 전에 갱신)
  _tokenRefreshTimer = setInterval(_checkAndRefresh, 10 * 60 * 1000); // 10분마다

  // 화면 복귀·인터넷 연결 시에도 바로 확인
  // (모바일은 백그라운드에서 타이머가 멈추므로, 복귀 직후 만료된 출입증을 바로 교체)
  if (!_refreshListenersAdded) {
    _refreshListenersAdded = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _checkAndRefresh();
    });
    window.addEventListener('online', () => _checkAndRefresh());
  }
}

// ── 앱 시작 시 인증 확인 ──
// 로컬 세션이 유효하면 즉시 true 반환 (스플래시만 잠깐 보임)
// 만료된 경우만 Supabase에 refresh 요청
//  - 서버가 무효라고 답한 경우에만 로그아웃
//  - 인터넷 끊김·서버 일시 오류면 기기에 저장된 일정으로 앱을 열고, 연결되면 자동 재시도
async function initAuth() {
  const session = loadSession();
  if (!session || !session.access_token) return false;

  if (isTokenExpired(session)) {
    const r = await refreshNow();
    if (r === 'invalid' || r === 'none') {
      clearSession();
      return false;
    }
    if (r === 'offline') {
      setAuthToken(session.access_token);
      _authStale = true;
    }
  } else {
    setAuthToken(session.access_token);
  }

  startTokenRefresh();
  if (_authStale) _checkAndRefresh();   // 30초 간격 재시도 시작
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
      _authStale = false;
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

  // 앱 준비 완료 → 그 사이 출입증이 갱신됐거나 갱신이 필요하면 처리
  _appReady = true;
  if (_authStale) _checkAndRefresh();

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
