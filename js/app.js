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
  // 시간 일정 팝업용 데이터: 앱 시작과 동시에 서버에 직접 요청 (전체 동기화와 병렬)
  const timedServerPromise = fetchTimedTodosFromServer();

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
  // ── 동기화 먼저: 스플래시가 떠 있는 동안 최신 데이터를 받은 뒤 화면/팝업 구성 ──
  // (기기 데이터가 있을 때의 bgSync 1단계(최근 변경분)를 최대 3초까지 기다림.
  //  초과/실패 시 기기 데이터로 진행, 나머지 동기화가 끝나면 기존처럼 화면이 자동 갱신됨)
  if (_bootSyncPromise) {
    await Promise.race([
      _bootSyncPromise,
      new Promise(r => setTimeout(r, 3000)),
    ]);
  }
  loadTodos();
  initBackButton();
  // 일반↔업무 전환 직후: 이동 목적지(탭/날짜)가 있으면 적용 (workmode.js)
  if (typeof applyModeTarget === 'function') applyModeTarget();

  // ── 첫 접속 시 오늘의 시간 일정 팝업 ──
  // 스플래시가 걷히기 전에 팝업을 미리 깔아둠 → 스플래시가 사라지면 바로 팝업이 보임
  // (bootApp이 끝나야 스플래시가 사라지므로, 서버 응답을 최대 3초까지 기다림)
  // (앱 새로 열기/새로고침 때만 실행. 날짜 이동·백그라운드 복귀 시에는 실행 안 됨)
  try {
    const timed = await buildTimedTodosForPopup(timedServerPromise);
    showTimedTodosPopup(timed);
  } catch(e) {
    console.warn('[app] 시간 일정 팝업 실패', e);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById('date-bar-actions').style.visibility = 'visible';
    });
  });
}

// ── 오늘의 시간 일정 조회 (팝업용) ──
// 서버에 "오늘 + 시간 있음 + 미완료"만 직접 요청 → 다른 기기 변경분까지 즉시 반영
// + 아직 서버로 안 올라간 이 기기의 변경분(tmp 행, 더 최신인 로컬 수정)은 기기 데이터로 보완
// 오프라인/실패/3초 초과 시 기기 데이터만으로 진행
// 1) 서버 조회 (bootApp 시작과 동시에 출발, 실패/3초 초과 시 null)
async function fetchTimedTodosFromServer() {
  if (!AppState.isOnline) return null;
  const today = toLocalDateStr(new Date());
  try {
    // 미완료 시간 일정 + 오늘의 반복 예외 행(완료 포함)
    // → 다른 기기에서 완료한 반복 일정도 팝업에서 제외되도록
    const path = `${TABLE_NAME}?date=eq.${today}&or=(and(time_at.not.is.null,is_done.eq.false),repeat_exception.eq.true)`;
    // 서버에 현재 존재하는 반복 마스터 id 목록 (다른 기기에서 반복 일정 자체를 삭제한 경우 대비)
    // → 이 조회만 실패하면 마스터 확인 없이 진행 (기존 방식)
    const masterPath = `${TABLE_NAME}?select=id&repeat_type=neq.none&repeat_master_id=is.null`;
    const rowsP    = sbFetch(path, { signal: _timeoutSignal(3000) });
    const mastersP = sbFetch(masterPath, { signal: _timeoutSignal(3000) }).catch(() => null);
    const [rows, masters] = await Promise.race([
      Promise.all([rowsP, mastersP]),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    return {
      rows,
      masterIds: Array.isArray(masters) ? new Set(masters.map(m => String(m.id))) : null,
    };
  } catch(e) {
    console.warn('[app] 시간 일정 서버 조회 실패 → 기기 데이터 사용', e);
    return null;
  }
}

// 2) 서버 결과 + 기기 데이터 합치기 (initSync 이후 호출 → IDB 준비 완료 상태)
async function buildTimedTodosForPopup(serverPromise) {
  const today = toLocalDateStr(new Date());
  const isTimedUndone = t => t && t.time_at && !t.is_done && !t.storage_flag && t.date === today;

  const server = await serverPromise;
  const serverRows      = server ? server.rows : null;
  const serverMasterIds = server ? server.masterIds : null;

  let localRows = [];
  try {
    localRows = await fetchTodosByDate(today);
  } catch(e) {}

  let result;
  if (Array.isArray(serverRows)) {
    const localMap = new Map(localRows.map(t => [String(t.id), t]));
    const toTime = v => (v ? (Date.parse(v) || 0) : 0);
    const merged = new Map();
    // 서버 행 기준. 단, 기기에 더 최신 수정(아직 미전송)이 있으면 기기 것을 사용
    serverRows.forEach(r => {
      const local = localMap.get(String(r.id));
      const use = (local && toTime(local.updated_at) > toTime(r.updated_at)) ? local : r;
      merged.set(String(r.id), use);
    });
    // 서버에 아직 없는 이 기기의 새 할일(tmp 행)
    localRows.forEach(t => {
      if (String(t.id).startsWith('tmp_')) merged.set(String(t.id), t);
    });
    result = [...merged.values()];
  } else {
    result = localRows;
  }

  // 반복 일정: 마스터 행(시작일 날짜로 저장됨)은 직접 행에서 제외하고,
  // 오늘에 해당하는 반복 일정을 가상 행으로 계산해 추가 (todo.js 렌더링과 동일한 방식)
  // → 시작일 이후 반복일에도 팝업에 표시, 오늘 완료/삭제/개별 수정된 날은 예외 행 기준으로 처리
  // 예외 행(완료·이 날만 삭제 포함)은 걸러내기 전에 따로 보관 → 반복 가상 행 제외 판단에 사용
  const resultExceptions = result.filter(t => t && t.repeat_exception === true);
  result = result.filter(t => {
    if (!t) return false;
    if (t.repeat_deleted) return false;
    if (t.repeat_type && t.repeat_type !== 'none' && t.repeat_exception !== true) return false;
    return true;
  });
  try {
    let repeatMasters = await fetchRepeatMasters(today);
    // 서버에서 이미 삭제된 반복 마스터는 제외 (이 기기의 아직 미전송 새 마스터(tmp)는 유지)
    if (serverMasterIds) {
      repeatMasters = (repeatMasters || []).filter(m =>
        String(m.id).startsWith('tmp_') || serverMasterIds.has(String(m.id))
      );
    }
    const localExceptions = await fetchRepeatExceptions(today);
    const exceptionIds = new Set(
      [...(localExceptions || []), ...resultExceptions]
        .map(e => String(e.repeat_master_id))
    );
    const virtualRows = (repeatMasters || [])
      .filter(m => isRepeatMatch(m, today) && !exceptionIds.has(String(m.id)))
      .map(m => ({ ...m, _virtual: true, _masterId: m.id, date: today }));
    result = [...result, ...virtualRows];
  } catch(e) {
    console.warn('[app] 시간 일정 팝업: 반복 일정 계산 실패', e);
  }

  return result
    .filter(isTimedUndone)
    .sort((a, b) => (a.time_at < b.time_at ? -1 : a.time_at > b.time_at ? 1 : 0));
}

// ── 오늘의 시간 일정 팝업 (상기용, 확인 버튼만) ──
// 뒤 배경은 불투명 → 확인을 눌러야 할일 화면이 보임
function showTimedTodosPopup(timed) {
  try {
    if (document.getElementById('timed-todos-overlay')) return;
    if (!timed || timed.length === 0) return;   // 시간 일정 없으면 띄우지 않음

    const overlay = document.createElement('div');
    overlay.id = 'timed-todos-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-base);z-index:1300;' +
      'display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-elevated);border-radius:16px;padding:24px 22px 20px;' +
      'width:320px;max-width:calc(100vw - 40px);max-height:80vh;display:flex;flex-direction:column;gap:16px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid var(--border-light);font-family:var(--font-main);';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:600;color:var(--text-primary);text-align:center;';
    title.textContent = '🕒 오늘의 시간 일정';

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;overflow-y:auto;';
    timed.forEach(t => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:baseline;padding:10px 12px;border-radius:10px;' +
        'background:var(--bg-surface);font-size:14px;color:var(--text-primary);line-height:1.4;';
      const tm = document.createElement('span');
      tm.style.cssText = 'color:var(--accent);font-weight:600;white-space:nowrap;font-family:var(--font-ui);';
      tm.textContent = `[${formatTimeLabel(t.time_at)}]`;
      const tt = document.createElement('span');
      tt.style.cssText = 'word-break:break-all;';
      tt.textContent = t.title || '';
      row.appendChild(tm);
      row.appendChild(tt);
      list.appendChild(row);
    });

    const okBtn = document.createElement('button');
    okBtn.style.cssText = 'width:100%;padding:12px;border-radius:10px;border:none;background:var(--accent);' +
      'color:#1a1a2e;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0;';
    okBtn.textContent = '확인';
    okBtn.addEventListener('click', closeTimedTodosPopup);

    box.appendChild(title);
    box.appendChild(list);
    box.appendChild(okBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  } catch(e) {
    console.warn('[app] 시간 일정 팝업 실패', e);
  }
}

function closeTimedTodosPopup() {
  document.getElementById('timed-todos-overlay')?.remove();
}

// ── 라이트 모드 토글 ──
function initLightMode() {
  applyLogoMode();
  document.getElementById('lightmode-toggle').addEventListener('click', () => {
    // 어떤 테마에서든 토글 → 다크 모드 / 다크 모드에서 토글 → 직전 테마로 복귀
    const current = localStorage.getItem('app-theme') || (localStorage.getItem('lightmode') === '1' ? 'light' : 'dark');
    if (current === 'dark') {
      let prev = localStorage.getItem('app-theme-prev') || 'light';
      // 삭제된 테마가 직전 테마로 남아있는 경우 대체 테마로 변환, 다크로 이어지면 라이트로
      if (typeof LEGACY_THEMES !== 'undefined' && LEGACY_THEMES[prev]) prev = LEGACY_THEMES[prev];
      if (prev === 'dark') prev = 'light';
      applyTheme(prev);
    } else {
      applyTheme('dark');
    }
  });
}

function applyLogoMode() {
  // 투명 배경 로고 하나로 통일 (배경색은 테마별 CSS가 처리)
  const src = 'logo2.png';
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
        // ── 핵심 ──
        // 이 환경에선 '뒤로가기의 결과로 호출된 pushState'가 새 항목을 쌓지 않고
        // 현재 base 항목을 덮어써 버려, 다음 뒤로가기에서 앱을 탈출하는 버그가 있음.
        // 새 항목을 만드는 대신, 방금 뒤로가기로 떠나온 'app' 항목이 forward 쪽에
        // 그대로 남아있으므로 그 항목으로 도로 forward → base 바닥을 그대로 보존.
        history.forward();
      } else if (currentTab !== 'todo') {
        switchTab('todo');
        history.forward();
      }
    }
  });
}

function hasOpenPopup() {
  // 로그아웃 확인 모달 (z-index 최상위) — 떠 있을 때만 감지
  if (document.getElementById('logout-modal')?.style.display === 'flex') return true;
  if (document.getElementById('timed-todos-overlay')) return true;
  if (document.getElementById('habits-modal-overlay')) return true;
  if (document.getElementById('dday-modal-overlay')) return true;
  if (document.getElementById('bucket-modal-overlay')) return true;
  if (document.getElementById('theme-sheet')) return true;
  if (document.getElementById('stats-overlay')) return true;
  // ── 창고 탭 전용 팝업들 (storage.js가 동적 생성) ──
  if (document.getElementById('storage-action-popup')) return true;
  if (document.getElementById('storage-date-picker-popup')) return true;
  // ── PC 날짜 선택 달력 (index-pc.html의 pcPickDate가 동적 생성) ──
  if (document.getElementById('pc-date-picker-popup')) return true;
  if (document.getElementById('storage-pc-dropdown')) return true;
  if (!document.getElementById('repeat-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('action-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('year-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('month-popup').classList.contains('hidden')) return true;
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('checklist-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('time-overlay').classList.contains('hidden')) return true;
  if (!document.getElementById('repeat-edit-overlay').classList.contains('hidden')) return true;
  if (document.getElementById('repeats-panel').classList.contains('open')) return true;
  if (document.getElementById('settings-panel').classList.contains('open')) return true;
  return false;
}

function closeTopPopup() {
  // 로그아웃 확인 모달이 최상위(z-index 10000)이므로 가장 먼저 닫는다.
  // 떠 있지 않으면(display:none) 이 분기는 통과되어 기존 동작 그대로 유지됨.
  const logoutModal = document.getElementById('logout-modal');
  if (logoutModal && logoutModal.style.display === 'flex') {
    if (typeof closeLogoutConfirm === 'function') closeLogoutConfirm();
    else logoutModal.style.display = 'none';
    return;
  }
  // 시간 일정 팝업: 뒤로가기 = 확인과 동일
  if (document.getElementById('timed-todos-overlay')) { closeTimedTodosPopup(); return; }
  const habitsOverlay = document.getElementById('habits-modal-overlay');
  if (habitsOverlay) {
    if (typeof closeHabitsModal === 'function') closeHabitsModal();
    else habitsOverlay.remove();
    return;
  }
  const ddayOverlay = document.getElementById('dday-modal-overlay');
  if (ddayOverlay) {
    if (typeof closeDdayModal === 'function') closeDdayModal();
    else ddayOverlay.remove();
    return;
  }
  const bucketOverlay = document.getElementById('bucket-modal-overlay');
  if (bucketOverlay) {
    if (typeof closeBucketModal === 'function') closeBucketModal();
    else bucketOverlay.remove();
    return;
  }
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
  // ── PC 날짜 선택 달력 (할일 입력창/반복 설정창보다 위층이므로 먼저 닫기) ──
  const pcDatePicker = document.getElementById('pc-date-picker-popup');
  if (pcDatePicker) {
    pcDatePicker.remove();
    document.getElementById('pc-date-picker-backdrop')?.remove();
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
  if (!document.getElementById('time-overlay').classList.contains('hidden')) { closeTimeModal(false); return; }
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
  // 화면 그리기 완료 시점을 반환 (모드 전환 시 workmode.js가 그린 뒤에 동기화를 시작하는 데 사용)
  let rendered = null;
  if (tabName === 'todo')        { rendered = Promise.all([loadTodos(), updateMonthDots()]); }
  else if (tabName === 'weekly') { weekOffset = 0; rendered = loadWeekly(); }
  else if (tabName === 'storage'){ rendered = loadStorage(); }
  else if (tabName === 'search') { setTimeout(() => document.getElementById('search-input').focus(), 200); }
  return rendered;
}

function refreshCurrentTab() {
  if (currentTab === 'todo')        { loadTodos(); updateMonthDots(); }
  else if (currentTab === 'weekly') { loadWeekly(); }
  else if (currentTab === 'storage'){ loadStorage(); }
}
