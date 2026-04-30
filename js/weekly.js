// =============================================
// weekly.js — 주간 일정 탭
// =============================================

let weekOffset = 0;
let selectedWeekDay = null;
let weekAllRows = [];
let weekImportantOnly = true;

function initWeekly() {
  document.getElementById('week-prev').addEventListener('click', () => { weekOffset--; loadWeekly(); });
  document.getElementById('week-next').addEventListener('click', () => { weekOffset++; loadWeekly(); });
  document.getElementById('week-important-btn').classList.add('active');
  document.getElementById('week-important-btn').addEventListener('click', () => {
    weekImportantOnly = !weekImportantOnly;
    document.getElementById('week-important-btn').classList.toggle('active', weekImportantOnly);
    renderWeekAllTodos(weekAllRows, getWeekRange(weekOffset).monday);
  });
}

function getWeekRange(offset) {
  const today = new Date();
  // 오늘 기준 + offset*7일이 시작일
  const start = new Date(today);
  start.setDate(today.getDate() + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { monday: start, sunday: end };
}

async function loadWeekly() {
  const { monday, sunday } = getWeekRange(weekOffset);
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  document.getElementById('week-range-label').textContent = `${fmt(monday)} ~ ${fmt(sunday)}`;

  const fromStr = toLocalDateStr(monday);
  const toStr   = toLocalDateStr(sunday);
  const container = document.getElementById('weekly-todo-list');

  try {
    // ── IDB에서 읽기 (Supabase 직접 호출 X → 오프라인 대응 + 빠른 속도) ──
    const all = await idbGetAll();

    const directRows = all
      .filter(r => r.date >= fromStr && r.date <= toStr)
      .filter(r => {
        if (r.storage_flag) return false;
        if (r.repeat_deleted) return false;
        if (!r.repeat_type || r.repeat_type === 'none') return true;
        if (r.repeat_exception === true) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
      });

    // 반복 마스터 가상 렌더링
    let virtualRows = [];
    try {
      const repeatMasters = all.filter(t =>
        t.repeat_type && t.repeat_type !== 'none' &&
        t.date <= toStr &&
        !t.repeat_master_id &&
        !t.repeat_exception &&
        !t.storage_flag
      );

      const exceptions = all.filter(r =>
        r.date >= fromStr && r.date <= toStr && r.repeat_exception === true
      );
      const exceptionSet = new Set(exceptions.map(e => `${e.repeat_master_id}_${e.date}`));
      const deletedSet   = new Set(exceptions.filter(e => e.repeat_deleted).map(e => `${e.repeat_master_id}_${e.date}`));

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = toLocalDateStr(d);
        repeatMasters
          .filter(m => isRepeatMatch(m, dateStr) && !exceptionSet.has(`${m.id}_${dateStr}`) && !deletedSet.has(`${m.id}_${dateStr}`))
          .forEach(m => virtualRows.push({ ...m, _virtual: true, _masterId: m.id, date: dateStr }));
      }
    } catch(e) { /* 반복 컬럼 미존재 시 무시 */ }

    weekAllRows = [...directRows, ...virtualRows]
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  } catch(e) {
    container.innerHTML = '<div class="empty-state">불러오기 실패</div>';
    return;
  }

  const hasTodo = {};
  weekAllRows.forEach(r => { hasTodo[r.date] = true; });
  renderWeekDayCards(monday, hasTodo);
  renderWeekAllTodos(weekAllRows, monday);
}

function isInWeek(dateStr, monday) {
  const d = new Date(dateStr + 'T00:00:00');
  const s = new Date(monday); s.setDate(monday.getDate() + 6);
  return d >= monday && d <= s;
}

function renderWeekDayCards(monday, hasTodo) {
  const row = document.getElementById('week-day-row');
  row.innerHTML = '';
  const dayNames = ['일','월','화','수','목','금','토'];
  const todayDateStr = toLocalDateStr(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const dow = d.getDay();
    const card = document.createElement('div');
    card.className = 'week-day-card';
    if (dow === 6) card.classList.add('sat');
    if (dow === 0) card.classList.add('sun');
    if (dateStr === todayDateStr) card.classList.add('today');
    if (hasTodo[dateStr]) card.classList.add('has-todo');
    card.innerHTML = `<span class="wdc-name">${dayNames[dow]}</span><span class="wdc-num">${d.getDate()}</span>`;
    row.appendChild(card);
  }
}

function renderWeekAllTodos(allRows, monday) {
  const container = document.getElementById('weekly-todo-list');
  container.innerHTML = '';

  const filtered = weekImportantOnly ? allRows.filter(r => r.weekly_flag) : allRows;

  const grouped = {};
  filtered.forEach(r => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });

  const dayNames = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  let hasAny = false;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const dayTodos = grouped[dateStr];
    if (!dayTodos || dayTodos.length === 0) continue;
    hasAny = true;
    const dow = d.getDay();

    const header = document.createElement('div');
    header.className = 'week-section-header';
    header.id = `week-section-${dateStr}`;
    if (dow === 0) header.classList.add('week-sun');
    if (dow === 6) header.classList.add('week-sat');
    header.textContent = `${d.getMonth()+1}월 ${d.getDate()}일 (${dayNames[dow]})`;
    container.appendChild(header);

    // 활성 항목 정렬: 반복일정 최상단(나중 추가순) → 중요도 높은순 → sort_order
    // ※ 반복 판정에 repeat_master_id를 포함 → 예외 행(repeat_type='none', repeat_master_id 있음)도
    //   반복 그룹으로 간주되어 항상 최상단에 위치
    const active = dayTodos.filter(t => !t.is_done)
      .sort((a, b) => {
        const aIsRepeat = !!(a.repeat_type && a.repeat_type !== 'none') || !!a.repeat_master_id;
        const bIsRepeat = !!(b.repeat_type && b.repeat_type !== 'none') || !!b.repeat_master_id;
        if (aIsRepeat !== bIsRepeat) return aIsRepeat ? -1 : 1;
        if (aIsRepeat && bIsRepeat) {
          return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
        }
        if (b.importance !== a.importance) return b.importance - a.importance;
        return a.sort_order - b.sort_order;
      });
    const done   = dayTodos.filter(t => t.is_done);
    active.forEach(todo => container.appendChild(makeWeekTodoItem(todo, false)));
    if (done.length > 0) {
      const div = document.createElement('div');
      div.className = 'week-done-divider';
      div.textContent = '완료';
      container.appendChild(div);
      done.forEach(todo => container.appendChild(makeWeekTodoItem(todo, true)));
    }
  }

  if (!hasAny) {
    const msg = weekImportantOnly ? '주간 표시된 할일이 없어요' : '이번 주 할일이 없어요';
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🗓</div>${msg}</div>`;
  }
}

function makeWeekTodoItem(todo, isDone) {
  const el = document.createElement('div');
  el.className = 'week-todo-item' + (isDone ? ' done' : '');

  const bar = document.createElement('div');
  const isRepeat = (todo.repeat_type && todo.repeat_type !== 'none') || !!todo.repeat_master_id;
  if (isRepeat) {
    bar.className = 'imp-badge imp-repeat';
    const star = document.createElement('span');
    star.className = 'repeat-star';
    star.textContent = '★';
    bar.appendChild(star);
  } else {
    bar.className = `imp-badge imp-${todo.importance || 0}`;
  }

  const check = document.createElement('div');
  check.className = 'todo-check' + (isDone ? ' checked' : '');
  check.addEventListener('click', async (e) => {
    e.stopPropagation();
    // 체크리스트가 있으면 완료 토글 차단
    if (hasChecklist(todo)) {
      showToast('상세보기에서 체크리스트를 완료해주세요');
      return;
    }
    try {
      if (todo._virtual) {
        await insertRepeatException(todo._masterId, todo.date, !todo.is_done);
      } else {
        await toggleDone(todo.id, !todo.is_done);
      }
      if (!todo.is_done) playCompleteSound(); // 완료 방향일 때만
      loadWeekly();
    } catch(e) { showToast('오류가 발생했어요'); }
  });

  const text = document.createElement('div');
  text.className = 'todo-text';
  const title = document.createElement('div');
  title.className = 'todo-title';

  if (todo.weekly_flag) {
    const flag = document.createElement('span');
    flag.className = 'weekly-flag-icon';
    flag.textContent = '★ ';
    title.appendChild(flag);
  }
  // 체크리스트 아이콘 + 진행도
  if (hasChecklist(todo)) {
    const clIcon = document.createElement('span');
    clIcon.className = 'checklist-icon';
    clIcon.textContent = '☑';
    title.appendChild(clIcon);
    const prog = getChecklistProgress(todo);
    if (prog) {
      const progEl = document.createElement('span');
      progEl.className = 'checklist-progress';
      progEl.textContent = ` (${prog.done}/${prog.total}) `;
      title.appendChild(progEl);
    }
  }
  const titleText = document.createTextNode(todo.title || '(제목 없음)');
  title.appendChild(titleText);
  text.appendChild(title);
  if (todo.memo) {
    const memo = document.createElement('div');
    memo.className = 'todo-memo';
    memo.textContent = todo.memo;
    text.appendChild(memo);
  }

  // 점3개 메뉴 버튼 (PC용 액션 트리거)
  const menuBtn = document.createElement('div');
  menuBtn.className = 'todo-menu-btn';
  menuBtn.innerHTML = '<svg viewBox="0 0 4 18" width="4" height="18" fill="currentColor"><circle cx="2" cy="2" r="1.6"/><circle cx="2" cy="9" r="1.6"/><circle cx="2" cy="16" r="1.6"/></svg>';
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    openActionPopup(todo.id, true, todo.date, todo);
  });

  el.appendChild(bar);
  el.appendChild(check);
  el.appendChild(text);
  el.appendChild(menuBtn);

  initWeekItemGesture(el, todo);
  return el;
}

function initWeekItemGesture(el, todo) {
  let startX = 0, startY = 0, moved = false, isHorizontal = null;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    moved = false; isHorizontal = null; el.style.transition = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (isHorizontal === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) isHorizontal = Math.abs(dx) > Math.abs(dy);
      return;
    }
    if (!isHorizontal) return;
    moved = true;
    const clampedX = Math.max(-120, Math.min(120, dx));
    el.style.transform = `translateX(${clampedX}px)`;
    if (dx > 20) el.style.background = `rgba(126,207,160,${Math.min(dx/120,0.3)})`;
    else if (dx < -20) el.style.background = `rgba(224,92,106,${Math.min(Math.abs(dx)/120,0.25)})`;
    else el.style.background = '';
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!isHorizontal || !moved) { resetWeekItemStyle(el); return; }
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) || Math.abs(dx) < 60) { resetWeekItemStyle(el); return; }
    if (dx > 0 && !todo.is_done) {
      // 체크리스트가 있으면 스와이프 완료 차단
      if (hasChecklist(todo)) {
        resetWeekItemStyle(el);
        showToast('상세보기에서 체크리스트를 완료해주세요');
        return;
      }
      el.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      el.style.transform = 'translateX(110%)'; el.style.opacity = '0';
      setTimeout(async () => {
        try {
          if (todo._virtual) {
            await insertRepeatException(todo._masterId, todo.date, true);
          } else {
            await toggleDone(todo.id, true);
          }
          playCompleteSound();
          loadWeekly();
        }
        catch(e) { resetWeekItemStyle(el); showToast('오류가 발생했어요'); }
      }, 250);
    } else if (dx < 0) {
      resetWeekItemStyle(el);
      openActionPopup(todo.id, true, todo.date, todo);
    } else { resetWeekItemStyle(el); }
  }, { passive: true });
}

function resetWeekItemStyle(el) {
  el.style.transition = 'transform 0.2s ease, background 0.2s ease';
  el.style.transform = ''; el.style.background = '';
  setTimeout(() => { el.style.transition = ''; }, 220);
}
