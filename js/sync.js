// =============================================
// sync.js — 로컬캐시(IndexedDB) + 동기화 엔진
// =============================================

const IDB_NAME    = 'ddog-cache';
const IDB_VERSION = 1;
const STORE_TODOS = 'todos';
const STORE_QUEUE = 'pending_queue';

let idb = null;

// ── IndexedDB 초기화 ──
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
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
    req.onerror   = e => reject(e.target.error);
  });
}

async function getIDB() {
  if (!idb) idb = await openIDB();
  return idb;
}

// ── IDB CRUD helpers ──

async function idbGetAll() {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readonly');
    const req = tx.objectStore(STORE_TODOS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(id) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readonly');
    const req = tx.objectStore(STORE_TODOS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(todo) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readwrite');
    const req = tx.objectStore(STORE_TODOS).put(todo);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbPutMany(todos) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_TODOS, 'readwrite');
    const store = tx.objectStore(STORE_TODOS);
    todos.forEach(t => store.put(t));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readwrite');
    const req = tx.objectStore(STORE_TODOS).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbClear() {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_TODOS, 'readwrite');
    const req = tx.objectStore(STORE_TODOS).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── Pending Queue ──

async function queuePush(op) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_QUEUE, 'readwrite');
    const req = tx.objectStore(STORE_QUEUE).add({ ...op, ts: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function queueGetAll() {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

async function queueDelete(qid) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_QUEUE, 'readwrite');
    const req = tx.objectStore(STORE_QUEUE).delete(qid);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function queueGet(qid) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).get(qid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function queuePut(op) {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_QUEUE, 'readwrite');
    const req = tx.objectStore(STORE_QUEUE).put(op);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── 임시(tmp_) id 관리 ──
// 큐 전송으로 진짜 id가 생기면 tmp → 진짜 id 매핑을 기억해 둔다.
// (화면이 아직 tmp id를 들고 있는 상태에서 수정/삭제해도 진짜 행에 반영되도록)
const _tmpIdMap = new Map();

// 지금 서버로 전송 중인 행 id (db.js의 sbPush가 표시)
const _inflightIds = new Set();

function resolveTmpId(id) {
  return _tmpIdMap.get(id) || id;
}

// tmp 행에 해당하는 큐의 POST 항목 찾기
// - 신규: op.tmpId로 매칭
// - 구버전 큐(tmpId 없음): created_at + title로 매칭
async function _findTmpPostOp(tmpId, tmpRow) {
  const ops = await queueGetAll();
  let op = ops.find(o => o.method === 'POST' && o.tmpId === tmpId);
  if (!op && tmpRow) {
    op = ops.find(o =>
      o.method === 'POST' && !o.tmpId && o.body &&
      o.body.created_at === tmpRow.created_at && o.body.title === tmpRow.title
    );
  }
  return op || null;
}

// tmp 행이 수정되면, 아직 서버로 안 간 POST 내용에 수정사항을 합친다.
async function queueMergeTmpPatch(tmpId, patch, tmpRow) {
  const op = await _findTmpPostOp(tmpId, tmpRow);
  if (!op) return false;
  op.tmpId = tmpId;
  op.body  = { ...op.body, ...patch };
  op.rev   = (op.rev || 0) + 1;
  await queuePut(op);
  return true;
}

// tmp 행이 삭제되면, 아직 서버로 안 간 POST도 취소한다.
async function queueRemoveTmp(tmpId, tmpRow) {
  const op = await _findTmpPostOp(tmpId, tmpRow);
  if (!op) return false;
  await queueDelete(op.qid);
  return true;
}

// 네트워크 지연 대비 타임아웃 (큐 전송 전용)
const FLUSH_TIMEOUT_MS = 20000;
function _timeoutSignal(ms) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// ── Supabase direct fetch (sync 엔진 내부용) ──

async function sbFetch(path, options = {}) {
  const res = await fetch(`${DB.url}/rest/v1/${path}`, {
    headers: DB.headers,
    ...options
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SB Error: ${res.status} ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── 초기 동기화: Supabase → IDB ──
// 페이지네이션으로 전체 데이터를 가져옴 (Supabase 기본 1000개 제한 우회)

async function initialSync() {
  try {
    let allRows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const page = await sbFetch(`${TABLE_NAME}?order=created_at.asc,id.asc&limit=${pageSize}&offset=${offset}`);
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    if (allRows.length > 0) {
      await idbClear();
      await idbPutMany(allRows);
    }
  } catch(e) {
    console.warn('[sync] 초기 동기화 실패 (오프라인?)', e);
  }
}

// ── Pending Queue flush ──
// - 동시에 여러 번 실행되지 않도록 잠금 (같은 POST가 두 번 나가 서버 중복 생성되는 것 방지)
// - POST 전에 서버에 이미 저장됐는지 확인 (응답만 끊겨서 저장은 된 경우 중복 방지)
// - 전송 시점의 시각으로 updated_at 갱신 (다른 기기 bgSync가 "옛날 행"으로 보고 건너뛰는 것 방지)
// - 성공하면 로컬의 tmp 행을 진짜 행으로 교체

let _flushPromise = null;

function flushQueue() {
  if (_flushPromise) return _flushPromise;
  _flushPromise = _flushQueueInner().finally(() => { _flushPromise = null; });
  return _flushPromise;
}

async function _flushQueueInner() {
  const ops = await queueGetAll();
  if (!ops.length) return;

  let changed = false;

  for (const listed of ops) {
    // 최신 상태로 다시 읽기 (그 사이 병합/취소/id 교체가 있었을 수 있음)
    const op = await queueGet(listed.qid);
    if (!op) continue;

    // 경로에 아직 진짜 id로 안 바뀐 tmp id가 있으면 처리
    const tmpInPath = (op.path || '').match(/tmp_[A-Za-z0-9_]+/);
    if (tmpInPath) {
      const realId = _tmpIdMap.get(tmpInPath[0]);
      if (realId) {
        op.path = op.path.replace(tmpInPath[0], realId);
        await queuePut(op);
      } else {
        const all = await queueGetAll();
        const hasPost = all.some(o => o.method === 'POST' && (o.tmpId === tmpInPath[0] || !o.tmpId));
        if (!hasPost) await queueDelete(op.qid);   // 대상 tmp 행이 이미 취소됨 → 보낼 필요 없음
        continue;                                   // 대상 행이 아직 서버에 없음 → 다음 회차에
      }
    }

    try {
      if (op.method === 'POST' && op.body) {
        const ok = await _flushPost(op);
        if (ok) changed = true;
      } else {
        const body = (op.body && op.body.updated_at)
          ? { ...op.body, updated_at: new Date().toISOString() }
          : op.body;
        await sbFetch(op.path, {
          method: op.method,
          body: body ? JSON.stringify(body) : undefined,
          signal: _timeoutSignal(FLUSH_TIMEOUT_MS)
        });
        await queueDelete(op.qid);
      }
    } catch(e) {
      console.warn('[sync] flush 실패, 다음 항목 계속:', e);
      // 하나 실패해도 나머지 계속 시도
    }
  }

  if (changed) {
    refreshCurrentTab();
    updateMonthDots();
  }
}

async function _flushPost(op) {
  const sentRev = op.rev || 0;
  const now = new Date().toISOString();

  // 구버전 큐 항목이면 대응하는 tmp 행을 찾아둔다
  let tmpId = op.tmpId || null;
  if (!tmpId) {
    const local = await idbGetAll();
    const t = local.find(r =>
      String(r.id).startsWith('tmp_') &&
      r.created_at === op.body.created_at && r.title === op.body.title
    );
    if (t) tmpId = t.id;
  }

  // 1) 서버에 이미 저장돼 있는지 확인 (같은 created_at + 제목 + 날짜)
  let real = null;
  if (op.body.created_at) {
    const found = await sbFetch(
      `${TABLE_NAME}?created_at=eq.${encodeURIComponent(op.body.created_at)}`,
      { signal: _timeoutSignal(FLUSH_TIMEOUT_MS) }
    );
    real = (found || []).find(r =>
      r.title === op.body.title && String(r.date) === String(op.body.date)
    ) || null;

    // 이미 있는데 로컬에서 추가 수정이 있었다면 반영
    if (real && sentRev > 0) {
      const { created_at, user_id, ...rest } = op.body;
      const rows = await sbFetch(`${TABLE_NAME}?id=eq.${real.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...rest, updated_at: now }),
        signal: _timeoutSignal(FLUSH_TIMEOUT_MS)
      });
      if (rows && rows[0]) real = rows[0];
    }
  }

  // 2) 없으면 새로 등록 (updated_at은 전송 시각으로)
  if (!real) {
    const rows = await sbFetch(op.path, {
      method: 'POST',
      body: JSON.stringify({ ...op.body, updated_at: now }),
      signal: _timeoutSignal(FLUSH_TIMEOUT_MS)
    });
    real = rows && rows[0];
    if (!real) throw new Error('POST 응답에 행 없음');
  }

  // 3) 진짜 행 저장 + 매핑 등록 (이후 수정/삭제는 진짜 id로 감)
  await idbPut(real);
  if (tmpId) _tmpIdMap.set(tmpId, real.id);

  // 4) 전송하는 동안 로컬에서 수정/삭제가 있었는지 확인
  const latest = await queueGet(op.qid);
  if (!latest) {
    // 전송 중에 사용자가 삭제함 → 서버에서도 삭제
    await sbFetch(`${TABLE_NAME}?id=eq.${real.id}`, {
      method: 'DELETE', signal: _timeoutSignal(FLUSH_TIMEOUT_MS)
    }).catch(e => console.warn('[sync] 취소된 행 삭제 실패:', e));
    await idbDelete(real.id);
  } else {
    if ((latest.rev || 0) !== sentRev) {
      const { created_at, user_id, ...rest } = latest.body;
      const rows = await sbFetch(`${TABLE_NAME}?id=eq.${real.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...rest, updated_at: new Date().toISOString() }),
        signal: _timeoutSignal(FLUSH_TIMEOUT_MS)
      });
      if (rows && rows[0]) { real = rows[0]; await idbPut(real); }
    }
    await queueDelete(op.qid);
  }

  // 5) 로컬 tmp 행 제거 + tmp id를 참조하던 곳을 진짜 id로 교체
  if (tmpId) {
    await idbDelete(tmpId);

    const rest = await queueGetAll();
    for (const o of rest) {
      let touched = false;
      if (o.body && o.body.repeat_master_id === tmpId) {
        o.body = { ...o.body, repeat_master_id: real.id }; touched = true;
      }
      if (o.body && o.body.remind_source_id === tmpId) {
        o.body = { ...o.body, remind_source_id: String(real.id) }; touched = true;
      }
      if (o.path && o.path.includes(tmpId)) {
        o.path = o.path.replace(tmpId, real.id); touched = true;
      }
      if (touched) await queuePut(o);
    }

    const local = await idbGetAll();
    const refs = local
      .filter(r => r.repeat_master_id === tmpId)
      .map(r => ({ ...r, repeat_master_id: real.id }));
    if (refs.length) await idbPutMany(refs);

    // 상기 사본의 원본 id(tmp)도 진짜 id로 교체
    const remindRefs = local
      .filter(r => r.remind_source_id === tmpId)
      .map(r => ({ ...r, remind_source_id: String(real.id) }));
    if (remindRefs.length) await idbPutMany(remindRefs);
  }

  return true;
}

// 온라인 복귀 시
async function onOnline() {
  await flushQueue();
}

// 브라우저 닫힐 때
window.addEventListener('beforeunload', async () => {
  const ops = await queueGetAll().catch(() => []);
  ops.forEach(op => {
    try {
      const url  = `${DB.url}/rest/v1/${op.path}`;
      const blob = new Blob(
        [op.body ? JSON.stringify(op.body) : ''],
        { type: 'application/json' }
      );
      navigator.sendBeacon(url, blob);
    } catch(e) {}
  });
});

// ── Realtime 구독 ──

let realtimeChannel = null;
let realtimeRestartTimer = null;

async function startRealtime() {
  // 이미 진행 중인 재시작 타이머가 있으면 취소하고 새로 시작
  // (플래그 방식은 hang 시 영구 고착되므로 사용하지 않음)
  if (realtimeRestartTimer) {
    clearTimeout(realtimeRestartTimer);
    realtimeRestartTimer = null;
  }

  const client = getSupabaseClient();

  // 기존 채널은 await 없이 fire-and-forget으로 제거
  // (removeChannel이 hang해도 새 채널 생성을 막지 않음)
  if (realtimeChannel) {
    const oldChannel = realtimeChannel;
    realtimeChannel = null;
    client.removeChannel(oldChannel).catch(e =>
      console.warn('[realtime] removeChannel 실패 (무시)', e)
    );
  }

  // 채널 이름에 타임스탬프를 붙여 매번 고유하게 생성
  const channelName = `ddog-changes-${Date.now()}`;

  realtimeChannel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE_NAME },
      async payload => {
        await handleRealtimeEvent(payload);
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        // 정상 연결 — 혹시 남아있던 재시작 예약 취소
        if (realtimeRestartTimer) {
          clearTimeout(realtimeRestartTimer);
          realtimeRestartTimer = null;
        }
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // bgSync로 즉시 화면 갱신 (공백 방지)
        if (AppState.isOnline) {
          bgSync().catch(() => {});
        }
        // 15초 후 채널 재연결 시도 (토큰 갱신 여유 확보)
        if (!realtimeRestartTimer) {
          realtimeRestartTimer = setTimeout(() => {
            realtimeRestartTimer = null;
            startRealtime();
          }, 15000);
        }
      }
    });
}

async function handleRealtimeEvent(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT') {
    if (newRow && newRow.id) {
      await idbPut(newRow);
    }
  } else if (eventType === 'UPDATE') {
    // REPLICA IDENTITY DEFAULT 환경에서는 newRow의 일부 컬럼(is_done 등)이
    // 누락될 수 있으므로, id로 Supabase에서 완전한 row를 재조회해서 저장
    const updateId = newRow?.id;
    if (updateId) {
      try {
        const rows = await sbFetch(`${TABLE_NAME}?id=eq.${updateId}`);
        if (rows && rows.length > 0) {
          await idbPut(rows[0]);
        } else if (newRow) {
          // 조회 실패 시 newRow 그대로 fallback
          await idbPut(newRow);
        }
      } catch(e) {
        // 네트워크 실패 시 newRow로 fallback
        if (newRow) await idbPut(newRow);
        console.warn('[realtime] UPDATE 재조회 실패, newRow fallback:', e);
      }
    }
  } else if (eventType === 'DELETE') {
    // oldRow.id가 없는 경우(RLS/REPLICA IDENTITY 문제) 방어 처리
    const deleteId = oldRow?.id;
    if (deleteId) {
      await idbDelete(deleteId);
    } else {
      // id를 못 받은 경우 → Supabase에서 전체 재동기화
      console.warn('[realtime] DELETE 이벤트에 id 없음 → 전체 재동기화');
      await fullResync();
      return;
    }
  }

  refreshCurrentTab();
  updateMonthDots();
}

// ── 전체 재동기화 (DELETE id 누락 등 비상용) ──
// 1000개 제한 우회: 페이지 단위로 전부 가져옴
// 아직 서버에 안 올라간 tmp 행은 지우지 않고 유지
async function fullResync() {
  try {
    let rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const page = await sbFetch(`${TABLE_NAME}?order=created_at.asc,id.asc&limit=${pageSize}&offset=${offset}`);
      if (!page || page.length === 0) break;
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    const tmps = (await idbGetAll()).filter(t => String(t.id).startsWith('tmp_'));
    await idbClear();
    const merged = rows.concat(tmps);
    if (merged.length > 0) await idbPutMany(merged);
    refreshCurrentTab();
    updateMonthDots();
  } catch(e) {
    console.warn('[sync] 전체 재동기화 실패', e);
  }
}

// ── 앱 시작 시 호출 ──

async function initSync() {
  await getIDB();

  const idbRows = await idbGetAll();

  if (idbRows.length === 0) {
    // 로컬캐시 없음 → 전체 다운로드 (새 기기)
    await initialSync();
  } else {
    // 로컬캐시 있음 → 바로 렌더링 후 백그라운드에서 최신화
    // [수정 ②] bgSync 실패 시 콘솔 경고만 내고 조용히 넘어가던 것을
    //           실패해도 refreshCurrentTab/updateMonthDots는 반드시 호출되도록 보장
    if (AppState.isOnline) {
      bgSync().catch(e => {
        console.warn('[sync] bg sync 실패', e);
        refreshCurrentTab();
        updateMonthDots();
      });
    }
  }

  // ── 네트워크 작업 모두 백그라운드로 → 스플래시 즉시 해제 ──
  setTimeout(async () => {
    if (AppState.isOnline) await flushQueue();
    await startRealtime();
  }, 0);

  // ── 주기적 queue flush (30초마다) ──
  setInterval(async () => {
    if (AppState.isOnline) await flushQueue();
  }, 30 * 1000);

  // ── 포그라운드 복귀 시 재연결 (모바일 백그라운드 복귀 대응) ──
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startRealtime();
      if (AppState.isOnline) {
        bgSync().catch(e => {
          console.warn('[sync] bg sync 실패', e);
          refreshCurrentTab();
          updateMonthDots();
        });
      }
    }
  });
}

// ── 백그라운드 동기화 ──
// updated_at 변경분 + 삭제된 항목 감지를 위해 Supabase 전체 id 목록과 비교
async function bgSync() {
  const all = await idbGetAll();
  if (!all.length) return;

  // 1. updated_at 기준 변경분 가져오기
  const latest = all.reduce((max, t) => {
    const ts = t.updated_at || t.created_at || '';
    return ts > max ? ts : max;
  }, '');

  if (latest) {
    // gte(이상)로 조회 후 IDB와 실제 비교 → 경계값 누락 방지
    const updated = await sbFetch(
      `${TABLE_NAME}?updated_at=gte.${encodeURIComponent(latest)}&order=updated_at.asc`
    );
    if (updated && updated.length > 0) {
      // IDB와 실제로 다른 행만 저장 (gte 조회로 인한 중복 방지)
      const idbMap = new Map(all.map(t => [t.id, t]));
      const changed = updated.filter(r => {
        const local = idbMap.get(r.id);
        return !local || (r.updated_at > local.updated_at);
      });
      if (changed.length > 0) {
        await idbPutMany(changed);
      }
    }
  }

  // 2. Supabase 전체 목록(id, updated_at)과 IDB 비교
  //    - 서버에만 있는 행 → 받아와서 채움 (다른 기기 등록분을 놓친 경우)
  //    - 수정시각이 다른 행 → 서버 것으로 갱신 (기기 시계 차이·지연 전송으로 놓친 경우)
  //    - IDB에만 있는 행 → 삭제 (다른 기기에서 삭제된 경우)
  //    단, 아직 서버로 안 보낸 수정/삭제가 큐에 있는 행은 건드리지 않음
  // 페이지네이션으로 전체를 가져옴 (Supabase 기본 1000개 제한 우회)
  try {
    const snapshotIds = new Set(all.map(t => t.id));

    const pendingIds = new Set();
    const pendingMasters = new Set();
    try {
      const ops = await queueGetAll();
      ops.forEach(o => {
        const p = o.path || '';
        let m = p.match(/[?&]id=eq\.([^&]+)/);
        if (m) pendingIds.add(decodeURIComponent(m[1]));
        m = p.match(/[?&]repeat_master_id=eq\.([^&]+)/);
        if (m) pendingMasters.add(decodeURIComponent(m[1]));
      });
    } catch(e) {}

    let sbList = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const page = await sbFetch(`${TABLE_NAME}?select=id,updated_at,repeat_master_id&order=id.asc&limit=${pageSize}&offset=${offset}`);
      if (!page || page.length === 0) break;
      sbList = sbList.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    if (sbList.length > 0) {
      const idbAll = await idbGetAll();
      const idbMap = new Map(idbAll.map(t => [String(t.id), t]));
      const toTime = v => (v ? (Date.parse(v) || 0) : 0);

      // 2-1. 빠진 행 / 수정시각이 다른 행 받아오기
      const needIds = sbList
        .filter(r =>
          !pendingIds.has(String(r.id)) &&
          !_inflightIds.has(String(r.id)) &&
          !pendingMasters.has(String(r.id)) &&
          !(r.repeat_master_id && pendingMasters.has(String(r.repeat_master_id)))
        )
        .filter(r => {
          const local = idbMap.get(String(r.id));
          return !local || toTime(local.updated_at) !== toTime(r.updated_at);
        })
        .map(r => r.id);

      if (needIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < needIds.length; i += 100) chunks.push(needIds.slice(i, i + 100));
        const results = await Promise.all(chunks.map(ids =>
          sbFetch(`${TABLE_NAME}?id=in.(${ids.join(',')})`)
        ));
        const rows = results.flat().filter(Boolean);
        if (rows.length > 0) await idbPutMany(rows);
      }

      // 2-2. 서버에서 삭제된 행 지우기
      //      (목록을 받는 동안 새로 생긴 로컬 행은 제외: 조회 시작 전부터 있던 행만 대상)
      const sbIdSet = new Set(sbList.map(r => String(r.id)));
      const deletedLocally = idbAll.filter(t =>
        !String(t.id).startsWith('tmp_') &&
        snapshotIds.has(t.id) &&
        !sbIdSet.has(String(t.id))
      );
      if (deletedLocally.length > 0) {
        await Promise.all(deletedLocally.map(t => idbDelete(t.id)));
      }
    }
  } catch(e) {
    console.warn('[sync] 목록 비교 동기화 실패', e);
  }

  refreshCurrentTab();
  updateMonthDots();
}
