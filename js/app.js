// =============================================
// app.js — 앱 초기화 & 탭 전환
// =============================================

let currentTab = 'todo';

document.addEventListener('DOMContentLoaded', async () => {
  // 로그인 폼 이벤트 연결 (로그인 화면이 표시될 경우를 위해)
  initLoginForm();

  // 세션 확인 → 유효하면 즉시 앱 진입, 없으면 로그인 화면
  const authed = await initAuth();
  if (authed) {
    await showApp();
  } else {
    // 로그인 화면 표시
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  }
});

// 앱 전체 초기화 (로그인 성공 후 또는 세션 복원 후 호출)
async function bootApp() {
  await initSync();
  initCalendar();
  initModal();
  initRepeat();
  initGesturePopup();
  initSearch();
  initWeekly();
  initStorage();
  initSettings();
  initTabs();
  initTheme();
  initLightMode();
  loadTodos();
  initBackButton();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById('date-bar-actions').style.visibility = 'visible';
    });
  });
}

// ── 라이트 모드 토글 ──
function initLightMode() {
  applyLogoMode();
  document.getElementById('lightmode-toggle').addEventListener('click', () => {
    // 컬러 테마 활성 시 토글 무시
    if (document.body.classList.contains('theme-active')) return;
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('lightmode', isLight ? '1' : '0');
    localStorage.setItem('app-theme', isLight ? 'light' : 'dark');
    applyLogoMode();
  });
}

function applyLogoMode() {
  const isLight = document.body.classList.contains('light-mode');
  const src = isLight ? 'logo1.png' : 'logo.png';
  // 스플래시 + 로그인 화면 로고 모두 교체
  const splashLogo = document.getElementById('splash-logo');
  const loginLogo  = document.getElementById('login-logo');
  if (splashLogo) splashLogo.src = src;
  if (loginLogo)  loginLogo.src  = src;
}

// ── 뒤로가기 처리 ──
function initBackButton() {
  history.replaceState({ page: 'base' }, '');
  history.pushState({ page: 'app' }, '');

  window.addEventListener('popstate', e => {
    if (e.state && e.state.page === 'base') {
      if (hasOpenPopup()) {
        closeTopPopup();
        history.pushState({ page: 'app' }, '');
      } else if (currentTab !== 'todo') {
        switchTab('todo');
        history.pushState({ page: 'app' }, '');
      }
    }
  });
}

function hasOpenPopup() {
  if (document.getElementById('theme-sheet')) return true;
  if (document.getElementById('stats-overlay')) return true;
  // ── 창고 탭 전용 팝업들 (storage.js가 동적 생성) ──
  if (document.getElementById('storage-action-popup')) return true;
  if (document.getElementById('storage-date-picker-popup')) return true;
  if (document.getElementById('storage-pc-dropdown')) return true;
  if (!document.getElementById('repeat-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('action-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('year-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('month-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('checklist-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('repeat-edit-overlay').classList.contains('hidden')) return true;
  if (document.getElementById('repeats-panel').classList.contains('open')) return true;
  if (document.getElementById('settings-panel').classList.contains('open')) return true;
  return false;
}

function closeTopPopup() {
  const statsOverlay = document.getElementById('stats-overlay');
  if (statsOverlay) { statsOverlay.remove(); return; }
  const themeSheet = document.getElementById('theme-sheet');
  if (themeSheet) {
    themeSheet.remove();
    document.getElementById('theme-sheet-overlay')?.remove();
    return;
  }
  // ── 창고 날짜 선택 달력 (액션 시트보다 위층이므로 먼저 닫기) ──
  const storageDatePicker = document.getElementById('storage-date-picker-popup');
  if (storageDatePicker) {
    storageDatePicker.remove();
    document.getElementById('storage-date-picker-backdrop')?.remove();
    return;
  }
  // ── 창고 액션 시트(모바일) / PC 드롭다운 ──
  const storageActionPopup = document.getElementById('storage-action-popup');
  if (storageActionPopup) {
    if (typeof closeStorageAction === 'function') closeStorageAction();
    else storageActionPopup.remove();
    return;
  }
  const storagePcDropdown = document.getElementById('storage-pc-dropdown');
  if (storagePcDropdown) {
    if (typeof closeStorageAction === 'function') closeStorageAction();
    else storagePcDropdown.remove();
    return;
  }
  if (!document.getElementById('checklist-overlay').classList.contains('hidden')) { closeChecklistModal(false); return; }
  if (!document.getElementById('repeat-edit-overlay').classList.contains('hidden')) { closeRepeatEditOverlay(); return; }
  if (!document.getElementById('repeat-overlay').classList.contains('hidden')) { document.getElementById('repeat-overlay').classList.add('hidden'); return; }
  if (!document.getElementById('action-popup').classList.contains('hidden')) { closeActionPopup(); return; }
  if (!document.getElementById('year-popup').classList.contains('hidden')) { closeYearPopup(); return; }
  if (!document.getElementById('month-popup').classList.contains('hidden')) { closeMonthPopup(); return; }
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) { closeModal(); return; }
  if (document.getElementById('repeats-panel').classList.contains('open')) { closeRepeatsPanel(); return; }
  if (document.getElementById('settings-panel').classList.contains('open')) { closeSettingsPanelOnly(); return; }
}

function initTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'settings') return;
      switchTab(btn.dataset.tab);
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  if (tabName === 'todo')        { loadTodos(); updateMonthDots(); }
  else if (tabName === 'weekly') { weekOffset = 0; loadWeekly(); }
  else if (tabName === 'storage'){ loadStorage(); }
  else if (tabName === 'search') { setTimeout(() => document.getElementById('search-input').focus(), 200); }
}

function refreshCurrentTab() {
  if (currentTab === 'todo')        { loadTodos(); updateMonthDots(); }
  else if (currentTab === 'weekly') { loadWeekly(); }
  else if (currentTab === 'storage'){ loadStorage(); }
}
