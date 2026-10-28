// =============================================
// workmode.js — 일반 / 업무 모드 전환
// - 데이터 분리: config.js(TABLE_NAME) + sync.js(IDB_NAME)가 APP_MODE에 따라 결정
// - 이 파일: 업무 탭 동작, 모드 전환(새로고침 없이 즉시), 전환 후 목적지 이동,
//            검색용 다른 모드 데이터 조회, 업무 모드 표시용 스타일
// =============================================

// ── 업무 모드 표시 ──
if (APP_MODE === 'work') document.body.classList.add('mode-work');   // (접속 시엔 항상 일반이라 실제로는 해당 없음)

(function injectWorkModeStyle() {
  const css = `
    /* 업무 모드: '할일' 대신 '업무' 탭을 활성 표시 */
    body.mode-work #nav-todo.active { color: var(--text-muted); border-bottom-color: transparent; background: none; box-shadow: none; }
    body.mode-work #nav-todo.active + #nav-work { color: var(--accent); }
    body.mode-work #nav-todo.active + #nav-work.pc-nav-btn { border-bottom-color: var(--accent); background: var(--accent-glow); }
    body.mode-work #bottom-nav #nav-todo.active + #nav-work { background: var(--accent-glow); box-shadow: inset 0 2.5px 0 var(--accent); }
    /* 업무 모드에는 주간·창고가 없으므로 입력창의 주간/창고 체크 비활성화
       (style.css의 '#detail-section #flags-column > label#...' !important 규칙보다 우선하도록 선택자 강화) */
    body.mode-work #detail-section #flags-column > label#weekly-flag-label,
    body.mode-work #detail-section #flags-column > label#storage-flag-label {
      opacity: 0.4 !important;
      pointer-events: none !important;
      user-select: none !important;
      cursor: not-allowed !important;
    }
    /* 검색 결과 '업무' 표시 */
    .s-mode-badge {
      display: inline-block; font-size: 10px; font-weight: 700; line-height: 1.5;
      padding: 0 6px; margin-right: 6px; border-radius: 5px;
      background: var(--accent-glow); color: var(--accent);
    }
  `;
  const style = document.createElement('style');
  style.id = 'workmode-style';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ── 탭 클릭 가로채기 (기존 탭 핸들러보다 먼저 실행되도록 capture 단계) ──
//  - '업무' 탭: 일반 모드면 업무로 전환 / 업무 모드면 업무 할일 화면으로
//  - 업무 모드에서 '할일': 일반 모드로 전환
//  - 업무 모드에서 '주간'·'창고': 일반 모드로 전환 후 해당 탭 열기
//  - 검색은 그대로 (업무 모드에서도 사용)
//  - 설정: 할일/업무 화면에서만 열림 (주간·창고·검색에서는 안내 토스트)
document.addEventListener('click', e => {
  const btn = e.target && e.target.closest ? e.target.closest('.nav-btn') : null;
  if (!btn) return;

  if (btn.id === 'nav-work') {
    e.preventDefault(); e.stopPropagation();
    if (APP_MODE !== 'work') switchAppMode('work', { tab: 'todo' });
    else if (currentTab !== 'todo') switchTab('todo');
    return;
  }

  // 설정: '할일'(일반) 또는 '업무' 화면에서만 열림 → 어느 쪽 설정(반복함·통계)인지 항상 명확
  if (btn.dataset.tab === 'settings' && currentTab !== 'todo') {
    e.preventDefault(); e.stopPropagation();
    if (typeof showToast === 'function') showToast('할일 또는 업무 탭에서 설정을 열어주세요');
    return;
  }

  if (APP_MODE !== 'work') return;
  const tab = btn.dataset.tab;
  if (tab === 'todo' || tab === 'weekly' || tab === 'storage') {
    e.preventDefault(); e.stopPropagation();
    switchAppMode('personal', { tab });
  }
}, true);

// ── 업무 모드: 주간/창고 체크 차단 (키보드 등 클릭 외 경로까지) ──
document.addEventListener('click', e => {
  if (APP_MODE !== 'work') return;
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#weekly-flag-label') || t.closest('#storage-flag-label')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// ── 진행 중인 저장 작업 추적 ──
// db.js의 쓰기 함수들을 감싸서 "지금 저장 중인 작업 수"를 센다.
// 전환은 이 수가 0일 때만 일어나므로, 저장 도중에 서랍이 바뀌어 다른 쪽에 기록되는 일이 없음.
// (함수 동작 자체는 그대로, 개수만 셈)
let _pendingOps = 0;
[
  'insertTodo', 'insertRemindCopy', 'deleteRemindCopies', 'syncRemindCopy',
  'updateTodo', 'toggleDone', 'moveTodoDate', 'convertStorageToTodo', 'updateSortOrders',
  'deleteTodo', 'checkAndCleanMaster', 'deleteRepeatOnlyDate', 'deleteRepeatFromDate',
  'deleteRepeatAll', 'insertRepeatException', 'updateRepeatOnlyDate', 'updateRepeatFromDate',
  'updateRepeatAll',
].forEach(name => {
  const orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = async function (...args) {
    _pendingOps++;
    try { return await orig.apply(this, args); }
    finally { _pendingOps--; }
  };
});

const _sleep = ms => new Promise(r => setTimeout(r, ms));

// 저장 작업이 모두 끝날 때까지 대기 (최대 limitMs). 끝나면 true
async function _waitIdle(limitMs) {
  const until = Date.now() + limitMs;
  let toasted = false;
  while (_pendingOps > 0) {
    if (Date.now() > until) return false;
    if (!toasted && Date.now() > until - limitMs + 800) {
      toasted = true;
      if (typeof showToast === 'function') showToast('저장 중… 잠시 후 전환돼요');
    }
    await _sleep(30);
  }
  return true;
}

// ── 로컬DB 연결 관리 (일반/업무 각각 한 번만 열어서 재사용) ──
const _idbConns = {};

function _modeIdbName(mode)  { return mode === 'work' ? 'ddog-cache-work' : 'ddog-cache'; }
function _modeTable(mode)    { return mode === 'work' ? 'ddog_work' : 'ddog'; }
function _otherMode()        { return APP_MODE === 'work' ? 'personal' : 'work'; }

function _openIdbByName(name) {
  if (name === IDB_NAME && idb) return Promise.resolve(idb);
  if (_idbConns[name]) return _idbConns[name];
  _idbConns[name] = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, IDB_VERSION);
    // 처음 만들어지는 경우 sync.js와 완전히 같은 구조로 생성
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_TODOS)) {
        db.createObjectStore(STORE_TODOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qs = db.createObjectStore(STORE_QUEUE, { keyPath: 'qid', autoIncrement: true });
        qs.createIndex('by_time', 'ts');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => { delete _idbConns[name]; reject(e.target.error); };
  });
  return _idbConns[name];
}

// ── 모드 전환 (새로고침 없이 즉시) ──
// target: 전환 후 열 곳 { tab: 'todo'|'weekly'|'storage', date?: 'YYYY-MM-DD' }
let _modeSwitchChain = Promise.resolve();
let _workTimedPopupShown = false;   // 업무 모드 시간 일정 팝업 표시 여부 (새로고침 전까지 유지)
let _workTimedPopupBuilding = false;

function switchAppMode(mode, target) {
  _modeSwitchChain = _modeSwitchChain
    .then(() => _doSwitchAppMode(mode, target || { tab: 'todo' }))
    .catch(e => console.warn('[workmode] 모드 전환 실패', e));
  return _modeSwitchChain;
}

function _openTarget(target) {
  const tab = (target && target.tab) || 'todo';
  if (tab === 'todo') {
    switchTab('todo');
    if (target && target.date) selectDate(target.date);
  } else if (document.getElementById(`tab-${tab}`)) {
    switchTab(tab);
  }
}

async function _doSwitchAppMode(mode, target) {
  mode = mode === 'work' ? 'work' : 'personal';
  if (mode === APP_MODE) { _openTarget(target); return; }

  // 1) 열려 있는 입력창/팝업 닫기 (이전 모드 항목을 다른 모드로 저장하는 일 방지)
  for (let i = 0; i < 20 && typeof hasOpenPopup === 'function' && hasOpenPopup(); i++) {
    closeTopPopup();
  }

  // 2) 진행 중인 저장이 끝날 때까지 대기
  if (!(await _waitIdle(15000))) {
    if (typeof showToast === 'function') showToast('저장이 끝나지 않아 전환하지 못했어요. 잠시 후 다시 눌러주세요', 2500);
    return;
  }

  // 3) 진행 중인 전송이 있으면 잠깐 기다림 (최대 1.5초, 못 끝나도 안전장치로 보호됨)
  try {
    if (typeof _flushPromise !== 'undefined' && _flushPromise) {
      await Promise.race([_flushPromise.catch(() => {}), _sleep(1500)]);
    }
  } catch (e) {}

  // 4) 전환할 모드의 로컬DB 연결 준비
  const nextName = _modeIdbName(mode);
  const nextConn = await _openIdbByName(nextName);

  // 위 대기 중에 새 저장이 시작됐으면 다시 대기
  if (_pendingOps > 0 && !(await _waitIdle(15000))) {
    if (typeof showToast === 'function') showToast('저장이 끝나지 않아 전환하지 못했어요. 잠시 후 다시 눌러주세요', 2500);
    return;
  }

  // 5) 한 번에 교체 (중간에 다른 작업이 끼어들 틈 없이 동기적으로)
  if (idb) _idbConns[IDB_NAME] = Promise.resolve(idb);
  APP_MODE   = mode;
  TABLE_NAME = _modeTable(mode);
  IDB_NAME   = nextName;
  idb        = nextConn;
  _syncGen++;
  const gen = _syncGen;

  AppState.todos = [];
  AppState.dotDates = new Set();
  AppState.pastUndoneDates = new Set();
  AppState.editingId = null;
  AppState.editingTodo = null;

  document.body.classList.toggle('mode-work', mode === 'work');

  // 6) 화면 즉시 전환 (기기에 저장된 데이터로 바로 표시)
  _openTarget(target);

  // 7) 실시간 연결을 새 테이블로
  try { startRealtime(); } catch (e) {}

  // 8) 백그라운드 최신화: 이 기기에서 처음 여는 모드면 전체 다운로드, 아니면 변경분만
  (async () => {
    try {
      const rows = await idbGetAll();
      if (gen !== _syncGen || !AppState.isOnline) return;
      if (rows.length === 0) {
        await initialSync();
        if (gen === _syncGen) { refreshCurrentTab(); updateMonthDots(); }
      } else {
        await bgSync();
      }
      if (gen === _syncGen) await flushQueue();
    } catch (e) {
      console.warn('[workmode] 전환 후 동기화 실패', e);
    }
  })();

  // 9) '오늘의 시간 일정' 팝업: 업무 모드를 처음 열 때 한 번만
  //    (일반 모드는 접속 시 app.js가 이미 표시. 이후 탭 이동에서는 표시 안 함, 새로고침하면 초기화)
  //    기다리지 않고 따로 진행 → 팝업 준비 중에도 다른 탭으로 바로 이동 가능.
  //    준비 중에 업무를 벗어나면 이번엔 띄우지 않고, 다음에 업무를 열 때 띄움
  if (mode !== 'work' || _workTimedPopupShown || _workTimedPopupBuilding) return;
  _workTimedPopupBuilding = true;
  (async () => {
    try {
      const timed = await buildTimedTodosForPopup(fetchTimedTodosFromServer());
      if (gen === _syncGen) {
        _workTimedPopupShown = true;
        showTimedTodosPopup(timed);
      }
    } catch (e) {
      console.warn('[workmode] 시간 일정 팝업 실패', e);
    } finally {
      _workTimedPopupBuilding = false;
    }
  })();
}

// ── (호환용) 예전 방식의 전환 목적지 정리 — app.js bootApp에서 호출 ──
function applyModeTarget() {
  try { sessionStorage.removeItem('ddog_mode_target'); } catch (e) {}
}

// ── 검색: 다른 모드 데이터 조회 ──
// 다른 모드의 로컬DB(읽기 전용) + 온라인이면 서버 검색으로 최신화
async function _otherIdbGetAll() {
  const db = await _openIdbByName(_modeIdbName(_otherMode()));
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readonly');
    const req = tx.objectStore(STORE_TODOS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function _otherServerSearch(keyword, table) {
  if (!AppState.isOnline) return null;
  const v = encodeURIComponent('*' + keyword + '*');
  try {
    const all = Promise.all([
      sbFetch(`${table}?title=ilike.${v}`, { signal: _timeoutSignal(3000) }),
      sbFetch(`${table}?memo=ilike.${v}`,  { signal: _timeoutSignal(3000) }),
    ]);
    const [a, b] = await Promise.race([
      all,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    return [...(a || []), ...(b || [])];
  } catch (e) {
    console.warn('[workmode] 다른 모드 서버 검색 실패 → 기기 데이터 사용', e);
    return null;
  }
}

async function searchOtherModeTodos(keyword) {
  const kw = (keyword || '').toLowerCase();
  if (!kw) return [];
  const other = _otherMode();

  let local = [];
  try { local = await _otherIdbGetAll(); } catch (e) {}

  const server = await _otherServerSearch(keyword, _modeTable(other));

  let pool;
  if (Array.isArray(server)) {
    // 서버 결과 기준. 단, 기기에 더 최신 수정이 있으면 기기 것 사용 + 아직 서버에 없는 tmp 행 포함
    const toTime = v => (v ? (Date.parse(v) || 0) : 0);
    const localMap = new Map(local.map(t => [String(t.id), t]));
    const merged = new Map();
    server.forEach(r => {
      const l = localMap.get(String(r.id));
      merged.set(String(r.id), (l && toTime(l.updated_at) > toTime(r.updated_at)) ? l : r);
    });
    local.forEach(t => {
      if (String(t.id).startsWith('tmp_')) merged.set(String(t.id), t);
    });
    pool = [...merged.values()];
  } else {
    pool = local;
  }

  // db.js searchTodos와 같은 기준으로 거르기
  const mastersWithException = new Set(
    [...local, ...pool]
      .filter(t => t.repeat_exception === true)
      .map(t => String(t.repeat_master_id))
  );

  return pool
    .filter(t => {
      const matches =
        (t.title || '').toLowerCase().includes(kw) ||
        (t.memo  || '').toLowerCase().includes(kw);
      if (!matches) return false;
      if (t.repeat_deleted) return false;
      const isMaster =
        t.repeat_type && t.repeat_type !== 'none' &&
        !t.repeat_master_id &&
        !t.repeat_exception;
      if (isMaster && mastersWithException.has(String(t.id))) return false;
      return true;
    })
    .map(t => ({ ...t, _mode: other }));
}
