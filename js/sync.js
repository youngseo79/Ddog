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

async function initialSync() {
  try {
    const rows = await sbFetch(`${TABLE_NAME}?order=created_at.asc`);
    if (rows && rows.length > 0) {
      await idbClear();
      await idbPutMany(rows);
    }

  } catch(e) {
    console.warn('[sync] 초기 동기화 실패 (오프라인?)', e);
  }
}

// ── Pending Queue flush ──

async function flushQueue() {
  const ops = await queueGetAll();
  if (!ops.length) return;

  for (const op of ops) {
    try {
      await sbFetch(op.path, {
        method: op.method,
        body: op.body ? JSON.stringify(op.body) : undefined
      });
      await queueDelete(op.qid);
    } catch(e) {
      console.warn('[sync] flush 실패, 다음 항목 계속:', e);
      // break 제거 → 하나 실패해도 나머지 계속 시도
    }
  }
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
async function fullResync() {
  try {
    const rows = await sbFetch(`${TABLE_NAME}?order=created_at.asc`);
    if (rows) {
      await idbClear();
      if (rows.length > 0) await idbPutMany(rows);
    }
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

  // 2. 삭제된 항목 감지: Supabase id 목록과 IDB id 목록 비교
  try {
    const sbIds = await sbFetch(`${TABLE_NAME}?select=id`);
    if (sbIds) {
      const sbIdSet = new Set(sbIds.map(r => r.id));
      const idbAll = await idbGetAll();
      const deletedLocally = idbAll.filter(t =>
        !String(t.id).startsWith('tmp_') && !sbIdSet.has(t.id)
      );
      if (deletedLocally.length > 0) {
        await Promise.all(deletedLocally.map(t => idbDelete(t.id)));
      }
    }
  } catch(e) {
    console.warn('[sync] 삭제 감지 실패', e);
  }

  refreshCurrentTab();
  updateMonthDots();
}
