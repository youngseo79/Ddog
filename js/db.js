// =============================================
// db.js — 로컬캐시(IDB) 우선 CRUD
// 읽기: IDB에서 즉시
// 쓰기: IDB에 즉시 반영 + Supabase 백그라운드 push
// 오프라인: pending queue에 저장 후 나중에 flush
// =============================================

// ── Supabase push (백그라운드) ──

async function sbPush(path, method, body) {
  if (AppState.isOnline) {
    try {
      const res = await fetch(`${DB.url}/rest/v1/${path}`, {
        method,
        headers: DB.headers,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) throw new Error(await res.text());
      if (res.status === 204) return null;
      return res.json();
    } catch(e) {
      // 네트워크 실패 → queue에 저장
      console.warn('[db] push 실패, queue에 저장:', e);
      await queuePush({ path, method, body });
      return null;
    }
  } else {
    // 오프라인 → queue에 저장
    await queuePush({ path, method, body });
    return null;
  }
}

// ── SELECT (IDB에서 읽기) ──

async function fetchTodosByDate(dateStr) {
  const all = await idbGetAll();
  return all
    .filter(t => t.date === dateStr && !t.storage_flag)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
    });
}

// ── 창고 항목 조회 ──
async function fetchStorageTodos() {
  const all = await idbGetAll();
  return all.filter(t => t.storage_flag === true);
}

async function fetchDotDatesForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  const all = await idbGetAll();

  // 일반 행 (반복 마스터 제외, 창고 항목 제외)
  const directDates = all
    .filter(t =>
      t.date >= from && t.date <= to &&
      !t.is_done &&
      !(t.repeat_deleted) &&
      !t.storage_flag &&
      (!t.repeat_type || t.repeat_type === 'none' || t.repeat_exception === true)
    )
    .map(t => t.date);

  // 반복 마스터 행 → 해당 월 날짜 중 매칭되는 날 계산 (창고 제외)
  const repeatMasters = all.filter(t =>
    t.repeat_type && t.repeat_type !== 'none' &&
    !t.repeat_master_id &&
    !t.repeat_exception &&
    !t.storage_flag &&
    t.date <= to
  );

  // 예외/삭제 행 세트
  const exceptions = all.filter(t =>
    t.date >= from && t.date <= to &&
    t.repeat_exception === true
  );
  const exceptionSet = new Set(exceptions.map(e => `${e.repeat_master_id}_${e.date}`));
  const deletedSet   = new Set(exceptions.filter(e => e.repeat_deleted).map(e => `${e.repeat_master_id}_${e.date}`));

  const repeatDates = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    for (const m of repeatMasters) {
      const key = `${m.id}_${dateStr}`;
      if (deletedSet.has(key)) continue;
      if (exceptionSet.has(key)) {
        // 예외 행이 있고 완료 안됐으면 점 표시
        const ex = exceptions.find(e => e.repeat_master_id === m.id && e.date === dateStr);
        if (ex && !ex.is_done && !ex.repeat_deleted) repeatDates.push(dateStr);
        continue;
      }
      if (isRepeatMatch(m, dateStr)) {
        repeatDates.push(dateStr);
        break;
      }
    }
  }

  return [...directDates, ...repeatDates];
}

// 과거 미완료 할일이 있는 날짜 목록 (오늘 제외 이전 날짜만)
async function fetchPastUndoneDatesForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  const today = todayStr();
  const all = await idbGetAll();

  // 일반 행: 과거 + 미완료 (창고 제외)
  const directDates = all
    .filter(t =>
      t.date >= from && t.date < today && t.date <= to &&
      !t.is_done &&
      !(t.repeat_deleted) &&
      !t.storage_flag &&
      (!t.repeat_type || t.repeat_type === 'none' || t.repeat_exception === true)
    )
    .map(t => t.date);

  // 반복 마스터: 과거 날짜 중 미완료 (창고 제외)
  const repeatMasters = all.filter(t =>
    t.repeat_type && t.repeat_type !== 'none' &&
    !t.repeat_master_id &&
    !t.repeat_exception &&
    !t.storage_flag &&
    t.date <= to
  );

  const exceptions = all.filter(t =>
    t.date >= from && t.date <= to &&
    t.repeat_exception === true
  );
  const exceptionSet = new Set(exceptions.map(e => `${e.repeat_master_id}_${e.date}`));
  const deletedSet   = new Set(exceptions.filter(e => e.repeat_deleted).map(e => `${e.repeat_master_id}_${e.date}`));

  const repeatDates = [];
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dateStr >= today) continue; // 오늘 이후는 제외
    for (const m of repeatMasters) {
      const key = `${m.id}_${dateStr}`;
      if (deletedSet.has(key)) continue;
      if (exceptionSet.has(key)) {
        const ex = exceptions.find(e => e.repeat_master_id === m.id && e.date === dateStr);
        if (ex && !ex.is_done && !ex.repeat_deleted) repeatDates.push(dateStr);
        continue;
      }
      if (isRepeatMatch(m, dateStr)) {
        repeatDates.push(dateStr);
        break;
      }
    }
  }

  return [...new Set([...directDates, ...repeatDates])];
}

async function searchTodos(keyword) {
  const all = await idbGetAll();
  const kw = keyword.toLowerCase();
  return all
    .filter(t =>
      (t.title || '').toLowerCase().includes(kw) ||
      (t.memo  || '').toLowerCase().includes(kw)
    )
    .sort((a, b) => {
      if (a.date !== b.date) return b.date > a.date ? 1 : -1;
      return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
    });
}

// ── INSERT ──

async function insertTodo(data) {
  const isStorage = !!data.storage_flag;

  // 창고 항목은 창고 탭 내에서 정렬, 일반 할일은 기존 방식(AppState.todos 기준)
  let minOrder;
  if (isStorage) {
    try {
      const all = await idbGetAll();
      const storageRows = all.filter(t => t.storage_flag === true);
      minOrder = storageRows.length > 0
        ? Math.min(...storageRows.map(t => t.sort_order || 0)) - 1
        : 0;
    } catch(e) { minOrder = 0; }
  } else {
    minOrder = AppState.todos.length > 0
      ? Math.min(...AppState.todos.map(t => t.sort_order)) - 1
      : 0;
  }

  const now = new Date().toISOString();
  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);

  const payload = {
    title:            data.title || '',
    memo:             data.memo  || '',
    importance:       data.importance ?? 0,
    date:             data.date  || todayStr(),
    remind_days:      data.remind_days ?? 0,
    weekly_flag:      data.weekly_flag ?? false,
    is_done:          false,
    sort_order:       minOrder,
    repeat_type:      data.repeat_type     || 'none',
    repeat_interval:  data.repeat_interval || 1,
    repeat_day:       data.repeat_day      || null,
    repeat_end_date:  data.repeat_end_date || null,
    repeat_meta:      data.repeat_meta     || null,
    repeat_master_id: null,
    repeat_exception: false,
    checklist:        data.checklist       || null,
    storage_flag:     isStorage,
    created_at:       now,
    updated_at:       now,
    user_id:          getCurrentUserId(),
  };

  if (AppState.isOnline) {
    try {
      // Supabase에 저장해서 실제 id 받아오기
      let res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: DB.headers,
        body: JSON.stringify(payload)
      });

      // storage_flag 컬럼이 DB에 아직 추가되지 않았다면 Supabase가 400/404 에러를 냄.
      // 이 경우 storage_flag를 제외하고 재시도 (기존 기능은 어쨌든 동작해야 함).
      if (!res.ok) {
        const errText = await res.text();
        const isColumnError = /storage_flag/i.test(errText) &&
                              /column|schema|PGRST204|not find|not exist/i.test(errText);
        if (isColumnError) {
          console.warn('[db] storage_flag 컬럼이 DB에 없음. 컬럼 제외하고 재시도:', errText);
          const { storage_flag, ...fallbackPayload } = payload;
          res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
            method: 'POST',
            headers: DB.headers,
            body: JSON.stringify(fallbackPayload)
          });
          if (!res.ok) throw new Error(await res.text());
        } else {
          throw new Error(errText);
        }
      }

      const rows = await res.json();
      const saved = rows[0];
      await idbPut(saved);
      return saved;
    } catch(e) {
      console.warn('[db] insert 실패, 임시 id로 로컬 저장:', e);
    }
  }

  // 오프라인 or 실패 → 임시 id로 IDB 저장 + queue
  const localTodo = { ...payload, id: tempId };
  await idbPut(localTodo);
  await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
  return localTodo;
}

async function insertRemindCopy(original, remindDate, dateLabel) {
  const titleSuffix = dateLabel ? `(${dateLabel})` : '';
  const now = new Date().toISOString();
  const payload = {
    title:       `🔔 ${original.title}${titleSuffix}`,
    memo:        original.memo || '',
    importance:  original.importance,
    date:        remindDate,
    remind_days: 0,
    is_done:     false,
    sort_order:  0,
    created_at:  now,
    updated_at:  now,
    user_id:     getCurrentUserId(),
  };

  if (AppState.isOnline) {
    try {
      const res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: DB.headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const rows = await res.json();
        await idbPut(rows[0]);
        return rows[0];
      }
    } catch(e) {}
  }

  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const localTodo = { ...payload, id: tempId };
  await idbPut(localTodo);
  await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
  return localTodo;
}

// ── UPDATE ──

async function updateTodo(id, data) {
  const now = new Date().toISOString();
  const patch = { ...data, updated_at: now };

  // IDB 즉시 반영
  const existing = await idbGet(id);
  if (existing) {
    await idbPut({ ...existing, ...patch });
  }

  // Supabase 백그라운드
  const isTmp = String(id).startsWith('tmp_');
  if (!isTmp) {
    await sbPush(`${TABLE_NAME}?id=eq.${id}`, 'PATCH', patch);
  }
}

async function toggleDone(id, isDone) {
  return updateTodo(id, {
    is_done: isDone,
    done_at: isDone ? new Date().toISOString() : null
  });
}

async function moveTodoDate(id, newDate) {
  return updateTodo(id, { date: newDate, sort_order: 0 });
}

// ── 창고 항목을 일반 할일로 전환 ──
// 방식: 기존 창고 row 완전 삭제 + 제목/중요도/메모만 복사해서 새 할일 insert
// 이유: 찌꺼기 속성/참조가 남지 않고, insertTodo 경로를 그대로 타므로
//       sort_order/created_at/updated_at 등 모든 필드가 신규 할일 기준으로 설정됨.
async function convertStorageToTodo(storageId, newDate) {
  // 1) 원본 데이터 복사 (IDB에서 조회)
  const original = await idbGet(storageId);
  if (!original) throw new Error('창고 항목을 찾을 수 없습니다');

  // 2) 제목 / 중요도 / 메모만 승계. 나머지(주간/상기/반복/리스트 등)는 모두 기본값.
  const newData = {
    title:      original.title || '',
    memo:       original.memo  || '',
    importance: original.importance || 0,
    date:       newDate,
    // 아래는 명시적으로 기본값(찌꺼기 방지):
    remind_days:  0,
    weekly_flag:  false,
    repeat_type:  'none',
    repeat_interval: 1,
    repeat_day:   null,
    repeat_end_date: null,
    repeat_meta:  null,
    checklist:    null,
    storage_flag: false,
  };

  // 3) 기존 창고 row 삭제 (IDB + Supabase)
  await deleteTodo(storageId);

  // 4) 새 할일 insert (insertTodo가 알아서 새 id, sort_order, created_at 등 생성)
  const newTodo = await insertTodo(newData);
  return newTodo;
}

async function updateSortOrders(todos) {
  return Promise.all(todos.map((t, i) => updateTodo(t.id, { sort_order: i })));
}

// ── DELETE ──

async function deleteTodo(id) {
  await idbDelete(id);
  const isTmp = String(id).startsWith('tmp_');
  if (!isTmp) {
    await sbPush(`${TABLE_NAME}?id=eq.${id}`, 'DELETE', null);
  }
}

// ── 반복 관련 ──

async function fetchRepeatMasters(dateStr) {
  try {
    const all = await idbGetAll();
    return all.filter(t =>
      t.repeat_type && t.repeat_type !== 'none' &&
      t.date <= dateStr &&
      !t.repeat_master_id &&
      !t.repeat_exception &&
      !t.storage_flag
    );
  } catch(e) { return []; }
}

async function fetchRepeatExceptions(dateStr) {
  try {
    const all = await idbGetAll();
    return all.filter(t => t.date === dateStr && t.repeat_exception === true);
  } catch(e) { return []; }
}

// ── 반복 일정 삭제 3종 ──

// ── 반복 마스터 완전 소멸 체크 후 삭제 ──
// 유한 반복(repeat_end_date 있음)에서 모든 유효 날짜가 repeat_deleted 처리됐으면 마스터 삭제
async function checkAndCleanMaster(masterId) {
  const all = await idbGetAll();
  const master = all.find(t => String(t.id) === String(masterId));
  if (!master) return; // 이미 없음

  // 종료일 없는 무한 반복은 판단 불가 → 유지
  if (!master.repeat_end_date) return;

  // 시작일부터 종료일까지 모든 매칭 날짜 계산
  const start = new Date(master.date + 'T00:00:00');
  const end   = new Date(master.repeat_end_date + 'T00:00:00');

  // 삭제된 예외 날짜 세트
  const deletedDates = new Set(
    all
      .filter(t => String(t.repeat_master_id) === String(masterId) && t.repeat_deleted)
      .map(t => t.date)
  );

  // 매칭 날짜 중 하나라도 삭제 안 된 게 있으면 유지
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toLocalDateStr(d);
    if (isRepeatMatch(master, dateStr) && !deletedDates.has(dateStr)) {
      return; // 아직 살아있는 날짜 있음 → 마스터 유지
    }
  }

  // 모두 삭제됨 → 마스터 행 완전 삭제
  await deleteRepeatAll(masterId);
}

// 1. 이 날짜만 삭제: repeat_deleted 예외 행 생성 후 마스터 소멸 체크
async function deleteRepeatOnlyDate(masterId, dateStr) {
  const all = await idbGetAll();
  const existing = all.find(t =>
    String(t.repeat_master_id) === String(masterId) && t.date === dateStr && t.repeat_exception
  );

  if (existing) {
    await updateTodo(existing.id, { repeat_deleted: true });
  } else {
    // 예외 행 새로 생성
    const master = all.find(t => String(t.id) === String(masterId));
    const now = new Date().toISOString();
    const payload = {
      title:            master?.title || '',
      memo:             master?.memo  || '',
      importance:       master?.importance || 0,
      date:             dateStr,
      remind_days:      0,
      is_done:          false,
      sort_order:       0,
      repeat_type:      'none',
      repeat_master_id: masterId,
      repeat_exception: true,
      repeat_deleted:   true,
      created_at:       now,
      updated_at:       now,
      user_id:          getCurrentUserId(),
    };

    if (AppState.isOnline) {
      try {
        const res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
          method: 'POST',
          headers: DB.headers,
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const rows = await res.json();
          await idbPut(rows[0]);
        }
      } catch(e) {
        const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        await idbPut({ ...payload, id: tempId });
        await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
      }
    } else {
      const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      await idbPut({ ...payload, id: tempId });
      await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
    }
  }

  // 유한 반복에서 모든 날짜 삭제됐으면 마스터도 삭제
  await checkAndCleanMaster(masterId);
}

// 2. 이 날짜 이후 삭제
async function deleteRepeatFromDate(masterId, dateStr) {
  const all = await idbGetAll();
  const master = all.find(t => String(t.id) === String(masterId));

  // dateStr이 마스터 시작일 이하면 → 유효 날짜가 하나도 안 남음 → 전체 삭제
  if (master && dateStr <= master.date) {
    await deleteRepeatAll(masterId);
    return;
  }

  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const endDate = toLocalDateStr(d);

  await updateTodo(masterId, { repeat_end_date: endDate });

  // 이후 예외 행들 삭제
  const all2 = await idbGetAll();
  const toDeletes = all2.filter(t =>
    String(t.repeat_master_id) === String(masterId) && t.date >= dateStr
  );
  await Promise.all(toDeletes.map(t => deleteTodo(t.id)));

  // 시작일~종료일 사이에 유효 날짜가 모두 삭제됐으면 마스터도 삭제
  await checkAndCleanMaster(masterId);
}

// 3. 전체 삭제: 마스터 + 모든 예외 행
async function deleteRepeatAll(masterId) {
  // IDB에서 마스터 + 예외 행 모두 즉시 삭제
  const all = await idbGetAll();
  const toDeletes = all.filter(t =>
    String(t.id) === String(masterId) || String(t.repeat_master_id) === String(masterId)
  );
  await Promise.all(toDeletes.map(t => idbDelete(t.id)));

  // Supabase 삭제 — 예외 행 먼저, 마스터 나중에 (FK 순서)
  if (AppState.isOnline) {
    try {
      await fetch(`${DB.url}/rest/v1/${TABLE_NAME}?repeat_master_id=eq.${masterId}`, {
        method: 'DELETE',
        headers: DB.headers,
      });
      await fetch(`${DB.url}/rest/v1/${TABLE_NAME}?id=eq.${masterId}`, {
        method: 'DELETE',
        headers: DB.headers,
      });
    } catch(e) {
      console.warn('[db] deleteRepeatAll Supabase 실패, queue에 저장:', e);
      await queuePush({ path: `${TABLE_NAME}?repeat_master_id=eq.${masterId}`, method: 'DELETE', body: null });
      await queuePush({ path: `${TABLE_NAME}?id=eq.${masterId}`, method: 'DELETE', body: null });
    }
  } else {
    await queuePush({ path: `${TABLE_NAME}?repeat_master_id=eq.${masterId}`, method: 'DELETE', body: null });
    await queuePush({ path: `${TABLE_NAME}?id=eq.${masterId}`, method: 'DELETE', body: null });
  }
}

async function insertRepeatException(masterId, dateStr, isDone = false) {
  // 마스터 행은 AppState 또는 IDB에서 찾기
  let master = AppState.todos.find(t => t.id === masterId || t._masterId === masterId);
  if (!master) {
    // AppState에 없으면 IDB에서 직접 조회
    try { master = await idbGet(masterId); } catch(e) {}
  }
  const now = new Date().toISOString();
  const payload = {
    title:            master?.title || '',
    memo:             master?.memo  || '',
    importance:       master?.importance || 0,
    weekly_flag:      master?.weekly_flag || false,
    checklist:        master?.checklist   || null,
    date:             dateStr,
    remind_days:      0,
    is_done:          isDone,
    done_at:          isDone ? now : null,
    sort_order:       0,
    repeat_type:      'none',
    repeat_master_id: masterId,
    repeat_exception: true,
    created_at:       now,
    updated_at:       now,
    user_id:          getCurrentUserId(),
  };

  if (AppState.isOnline) {
    try {
      const res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: DB.headers,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const rows = await res.json();
        await idbPut(rows[0]);
        return rows[0];
      }
    } catch(e) {}
  }

  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const localTodo = { ...payload, id: tempId };
  await idbPut(localTodo);
  await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
  return localTodo;
}

// ── 반복 수정 3종 ──

// 1. 이 날짜만 수정: 예외 행 생성/업데이트
async function updateRepeatOnlyDate(masterId, dateStr, data) {
  const all = await idbGetAll();
  const existing = all.find(t =>
    String(t.repeat_master_id) === String(masterId) && t.date === dateStr && t.repeat_exception
  );

  if (existing) {
    await updateTodo(existing.id, data);
  } else {
    const master = all.find(t => String(t.id) === String(masterId));
    const now = new Date().toISOString();
    const payload = {
      title:            data.title            ?? master?.title ?? '',
      memo:             data.memo             ?? master?.memo  ?? '',
      importance:       data.importance       ?? master?.importance ?? 0,
      weekly_flag:      data.weekly_flag      ?? master?.weekly_flag ?? false,
      checklist:        data.checklist        ?? master?.checklist ?? null,
      date:             dateStr,
      remind_days:      data.remind_days      ?? 0,
      is_done:          data.is_done          ?? false,
      done_at:          data.done_at          ?? null,
      sort_order:       0,
      repeat_type:      'none',
      repeat_master_id: masterId,
      repeat_exception: true,
      created_at:       now,
      updated_at:       now,
      user_id:          getCurrentUserId(),
    };

    if (AppState.isOnline) {
      try {
        const res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
          method: 'POST',
          headers: DB.headers,
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const rows = await res.json();
          await idbPut(rows[0]);
          return rows[0];
        }
      } catch(e) {}
    }
    const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    await idbPut({ ...payload, id: tempId });
    await queuePush({ path: TABLE_NAME, method: 'POST', body: payload });
  }
}

// 2. 이 날짜 이후 모두 수정: 마스터 종료일을 dateStr-1로 자르고, 새 마스터 생성
async function updateRepeatFromDate(masterId, dateStr, data) {
  const all = await idbGetAll();
  const master = all.find(t => String(t.id) === String(masterId));
  if (!master) return;

  // 현재 마스터를 dateStr 하루 전으로 종료
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const endDate = toLocalDateStr(d);

  if (dateStr <= master.date) {
    // 이 날짜가 시작일 이전이면 전체 수정과 동일
    await updateRepeatAll(masterId, data);
    return;
  }

  await updateTodo(masterId, { repeat_end_date: endDate });

  // dateStr 이후 예외 행 삭제
  const all2 = await idbGetAll();
  const toDeletes = all2.filter(t =>
    String(t.repeat_master_id) === String(masterId) && t.date >= dateStr
  );
  await Promise.all(toDeletes.map(t => deleteTodo(t.id)));

  // 새 마스터 행 생성
  const now = new Date().toISOString();
  const newPayload = {
    title:           data.title           ?? master.title,
    memo:            data.memo            ?? master.memo ?? '',
    importance:      data.importance      ?? master.importance ?? 0,
    weekly_flag:     data.weekly_flag     ?? master.weekly_flag ?? false,
    checklist:       data.checklist       ?? master.checklist ?? null,
    date:            dateStr,
    remind_days:     data.remind_days     ?? master.remind_days ?? 0,
    is_done:         false,
    sort_order:      master.sort_order ?? 0,
    repeat_type:     data.repeat_type     ?? master.repeat_type,
    repeat_interval: data.repeat_interval ?? master.repeat_interval ?? 1,
    repeat_day:      data.repeat_day      ?? master.repeat_day ?? null,
    repeat_end_date: data.repeat_end_date ?? master.repeat_end_date ?? null,
    repeat_meta:     data.repeat_meta     ?? master.repeat_meta ?? null,
    repeat_master_id: null,
    repeat_exception: false,
    created_at:      now,
    updated_at:      now,
    user_id:         getCurrentUserId(),
  };

  if (AppState.isOnline) {
    try {
      const res = await fetch(`${DB.url}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: DB.headers,
        body: JSON.stringify(newPayload)
      });
      if (res.ok) {
        const rows = await res.json();
        await idbPut(rows[0]);
        return rows[0];
      }
    } catch(e) {}
  }
  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  await idbPut({ ...newPayload, id: tempId });
  await queuePush({ path: TABLE_NAME, method: 'POST', body: newPayload });
}

// 3. 전체 수정: 마스터 업데이트 + 모든 예외 행 삭제 후 재생성 없이 마스터만 업데이트
async function updateRepeatAll(masterId, data) {
  const all = await idbGetAll();

  // 모든 예외 행 삭제
  const exceptions = all.filter(t => String(t.repeat_master_id) === String(masterId));
  await Promise.all(exceptions.map(t => deleteTodo(t.id)));

  // 마스터 업데이트
  await updateTodo(masterId, data);
}

// ── 체크리스트 완료 여부 판단 ──
function hasChecklist(todo) {
  if (!todo.checklist) return false;
  try {
    const items = JSON.parse(todo.checklist);
    return Array.isArray(items) && items.some(it => it.text && it.text.trim());
  } catch(e) { return false; }
}

function isChecklistComplete(todo) {
  if (!hasChecklist(todo)) return true;
  try {
    const items = JSON.parse(todo.checklist);
    const valid = items.filter(it => it.text && it.text.trim());
    return valid.length > 0 && valid.every(it => it.checked);
  } catch(e) { return false; }
}

function getChecklistProgress(todo) {
  if (!hasChecklist(todo)) return null;
  try {
    const items = JSON.parse(todo.checklist);
    const valid = items.filter(it => it.text && it.text.trim());
    if (!valid.length) return null;
    const done = valid.filter(it => it.checked).length;
    return { done, total: valid.length };
  } catch(e) { return null; }
}
