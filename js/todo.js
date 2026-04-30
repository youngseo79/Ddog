// =============================================
// todo.js — 할일 목록 렌더링 & 드래그 정렬
// =============================================

// 할일 목록 로드 & 렌더링
async function loadTodos() {
  const list = document.getElementById('todo-list');
  try {
    const dateStr = AppState.selectedDate;
    const allDirectRows = await fetchTodosByDate(dateStr);

    // 반복 마스터 행(repeat_type≠none, repeat_exception=false)은
    // 아래 가상 렌더링 로직이 담당 → directRows에서 제외해 중복 방지
    // repeat_deleted=true인 예외 행도 표시하지 않음
    const directRows = (allDirectRows || []).filter(r => {
      if (r.repeat_deleted) return false;
      if (!r.repeat_type || r.repeat_type === 'none') return true;
      if (r.repeat_exception === true) return true;
      return false;
    });

    // 반복 마스터 가상 렌더링 (컬럼 없으면 건너뜀)
    let virtualRows = [];
    try {
      const repeatMasters = await fetchRepeatMasters(dateStr);
      const exceptions = await fetchRepeatExceptions(dateStr);
      const exceptionIds = new Set((exceptions || []).map(e => e.repeat_master_id));
      const deletedIds  = new Set((exceptions || []).filter(e => e.repeat_deleted).map(e => e.repeat_master_id));
      virtualRows = (repeatMasters || [])
        .filter(m => isRepeatMatch(m, dateStr) && !exceptionIds.has(m.id) && !deletedIds.has(m.id))
        .map(m => ({ ...m, _virtual: true, _masterId: m.id, date: dateStr }));
    } catch(e) { /* 반복 컬럼 미존재 시 무시 */ }

    AppState.todos = [...directRows, ...virtualRows];
    renderTodos();
    updateMonthDots();
  } catch(e) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>불러오기 실패</div>';
    console.error(e);
  }
}

function renderTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  const todos = AppState.todos;
  if (!todos.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✨</div>할일이 없어요</div>';
    return;
  }

  // 정렬: 중요도 높은 것 → 미완료 → 완료
  const active = sortActiveTodos(todos.filter(t => !t.is_done));
  const done   = todos.filter(t => t.is_done);

  active.forEach(todo => list.appendChild(makeTodoItem(todo)));

  if (done.length > 0) {
    const divider = document.createElement('li');
    divider.className = 'done-divider';
    divider.textContent = '완료';
    list.appendChild(divider);
    done.forEach(todo => list.appendChild(makeTodoItem(todo)));
  }

  initDragSort();
}

// 활성 할일 정렬: 반복일정 최상단(나중 추가순) → 중요도 높은순 → sort_order
// ※ 반복 판정에 repeat_master_id를 포함 → 예외 행(repeat_type='none', repeat_master_id 있음)도
//   반복 그룹으로 간주되어 항상 최상단에 위치 (중요도 높음보다도 위)
function sortActiveTodos(todos) {
  return [...todos].sort((a, b) => {
    const aIsRepeat = !!(a.repeat_type && a.repeat_type !== 'none') || !!a.repeat_master_id;
    const bIsRepeat = !!(b.repeat_type && b.repeat_type !== 'none') || !!b.repeat_master_id;
    if (aIsRepeat !== bIsRepeat) return aIsRepeat ? -1 : 1;
    if (aIsRepeat && bIsRepeat) {
      // 둘 다 반복: 나중에 추가한 것이 위 (created_at 내림차순)
      return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
    }
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.sort_order - b.sort_order;
  });
}

function makeTodoItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item' + (todo.is_done ? ' done' : '');
  li.dataset.id = todo.id;

  // 중요도 바 (반복 일정이면 빨간선 + 별) — 예외 행(repeat_master_id 있음)도 반복 표시 유지
  const impBar = document.createElement('div');
  const isRepeat = (todo.repeat_type && todo.repeat_type !== 'none') || !!todo.repeat_master_id;
  if (isRepeat) {
    impBar.className = 'imp-badge imp-repeat';
    const star = document.createElement('span');
    star.className = 'repeat-star';
    star.textContent = '★';
    impBar.appendChild(star);
  } else {
    impBar.className = `imp-badge imp-${todo.importance}`;
  }

  // 체크박스
  const check = document.createElement('div');
  check.className = 'todo-check' + (todo.is_done ? ' checked' : '');
  check.addEventListener('click', () => handleToggleDone(todo));

  // 텍스트 영역
  const textWrap = document.createElement('div');
  textWrap.className = 'todo-text';

  const titleEl = document.createElement('div');
  titleEl.className = 'todo-title';
  // weekly_flag 별표
  if (todo.weekly_flag) {
    const flag = document.createElement('span');
    flag.className = 'weekly-flag-icon';
    flag.textContent = '★ ';
    titleEl.appendChild(flag);
  }
  // 체크리스트 아이콘 + 진행도
  if (hasChecklist(todo)) {
    const clIcon = document.createElement('span');
    clIcon.className = 'checklist-icon';
    clIcon.textContent = '☑';
    titleEl.appendChild(clIcon);
    const prog = getChecklistProgress(todo);
    if (prog) {
      const progEl = document.createElement('span');
      progEl.className = 'checklist-progress';
      progEl.textContent = ` (${prog.done}/${prog.total}) `;
      titleEl.appendChild(progEl);
    }
  }
  titleEl.appendChild(document.createTextNode(todo.title));

  textWrap.appendChild(titleEl);

  if (todo.memo) {
    const metaEl = document.createElement('div');
    metaEl.className = 'todo-meta';
    const memoEl = document.createElement('span');
    memoEl.className = 'todo-memo';
    memoEl.textContent = todo.memo;
    metaEl.appendChild(memoEl);
    textWrap.appendChild(metaEl);
  }

  // 드래그 핸들 (미완료만)
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.innerHTML = '<svg viewBox="0 0 24 14" width="22" height="14" fill="currentColor"><rect y="0" width="24" height="2.5" rx="1.2"/><rect y="5.5" width="24" height="2.5" rx="1.2"/><rect y="11" width="24" height="2.5" rx="1.2"/></svg>';
  handle.setAttribute('data-drag-handle', '');

  // 점3개 메뉴 버튼 (PC용 액션 트리거)
  const menuBtn = document.createElement('div');
  menuBtn.className = 'todo-menu-btn';
  menuBtn.innerHTML = '<svg viewBox="0 0 4 18" width="4" height="18" fill="currentColor"><circle cx="2" cy="2" r="1.6"/><circle cx="2" cy="9" r="1.6"/><circle cx="2" cy="16" r="1.6"/></svg>';
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    openActionPopup(todo.id, false, todo.date || AppState.selectedDate, todo);
  });

  li.appendChild(impBar);
  li.appendChild(check);
  li.appendChild(textWrap);
  if (!todo.is_done) li.appendChild(handle);
  li.appendChild(menuBtn);

  // 클릭 → 수정 모달 (체크/핸들 제외)
  textWrap.addEventListener('click', () => openEditModal(todo));
  impBar.addEventListener('click', () => openEditModal(todo));

  // 제스처 (gesture.js)
  initItemGesture(li, todo);

  return li;
}

// 완료 토글 처리 (반복 가상 항목 포함)
async function handleToggleDone(todo) {
  // 체크리스트가 있으면 토글 불가
  if (hasChecklist(todo)) {
    showToast('상세보기에서 체크리스트를 완료해주세요');
    return;
  }
  const newDone = !todo.is_done;
  // 이미 완료된 체크리스트 항목은 미완료 복귀도 차단
  // (체크리스트 없는 일반 할일은 자유롭게 토글)
  try {
    if (todo._virtual) {
      const exRow = await insertRepeatException(todo._masterId, AppState.selectedDate, newDone);
      const idx = AppState.todos.findIndex(t => t._masterId === todo._masterId && t._virtual);
      if (idx !== -1) AppState.todos[idx] = { ...exRow, _wasVirtual: true };
    } else if (todo.repeat_master_id) {
      await toggleDone(todo.id, newDone);
      const t = AppState.todos.find(t => t.id === todo.id);
      if (t) { t.is_done = newDone; t.done_at = newDone ? new Date().toISOString() : null; }
    } else {
      await toggleDone(todo.id, newDone);
      const t = AppState.todos.find(t => t.id === todo.id);
      if (t) { t.is_done = newDone; t.done_at = newDone ? new Date().toISOString() : null; }
    }
    if (newDone) playCompleteSound();
    renderTodos();
    updateMonthDots();
  } catch(e) {
    showToast('오류가 발생했어요');
    console.error(e);
  }
}

// =============================================
// 드래그 정렬 (미완료 항목만)
// =============================================
let dragSrc = null;
let autoScrollRAF = null;
let dragCurrentY = 0;

function startAutoScroll() {
  const scrollEl = document.getElementById('todo-list-section');
  const ZONE = 80;
  const MAX_SPEED = 6; // 속도 낮춤 (기존 14 → 6)

  function step() {
    const rect = scrollEl.getBoundingClientRect();
    const distTop    = dragCurrentY - rect.top;
    const distBottom = rect.bottom - dragCurrentY;

    let speed = 0;
    if (distBottom < ZONE && distBottom > 0) {
      speed = MAX_SPEED * (1 - distBottom / ZONE);
    } else if (distTop < ZONE && distTop > 0) {
      speed = -MAX_SPEED * (1 - distTop / ZONE);
    }

    if (speed !== 0) scrollEl.scrollTop += speed;
    autoScrollRAF = requestAnimationFrame(step);
  }
  autoScrollRAF = requestAnimationFrame(step);
}

function stopAutoScroll() {
  if (autoScrollRAF) {
    cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }
}

function initDragSort() {
  const items = document.querySelectorAll('.todo-item:not(.done)');
  items.forEach(item => {
    const handle = item.querySelector('[data-drag-handle]');
    if (!handle) return;

    // 터치 드래그
    handle.addEventListener('touchstart', onTouchDragStart, { passive: false });
    // 마우스 드래그
    handle.addEventListener('mousedown', onMouseDragStart);
  });
}

// ── 마우스 드래그 ──
function onMouseDragStart(e) {
  e.preventDefault();
  const item = e.currentTarget.closest('.todo-item');
  dragSrc = item;
  item.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  dragCurrentY = e.clientY;
  const startY = e.clientY;
  let scrollStarted = false;

  const onMove = ev => {
    dragCurrentY = ev.clientY;
    // 10px 이상 움직인 후에만 자동 스크롤 시작
    if (!scrollStarted && Math.abs(ev.clientY - startY) > 10) {
      scrollStarted = true;
      startAutoScroll();
    }
    const target = getDragTarget(ev.clientX, ev.clientY);
    highlightDragOver(target, ev.clientY);
  };
  const onUp = ev => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    stopAutoScroll();
    finishDrag(ev.clientX, ev.clientY);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── 터치 드래그 ──
function onTouchDragStart(e) {
  e.preventDefault();
  const item = e.currentTarget.closest('.todo-item');
  dragSrc = item;
  item.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  dragCurrentY = e.touches[0].clientY;
  const startY = e.touches[0].clientY;
  let scrollStarted = false;

  const onMove = ev => {
    const t = ev.touches[0];
    dragCurrentY = t.clientY;
    // 10px 이상 움직인 후에만 자동 스크롤 시작
    if (!scrollStarted && Math.abs(t.clientY - startY) > 10) {
      scrollStarted = true;
      startAutoScroll();
    }
    const target = getDragTarget(t.clientX, t.clientY);
    highlightDragOver(target, t.clientY);
  };
  const onEnd = ev => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    stopAutoScroll();
    const t = ev.changedTouches[0];
    finishDrag(t.clientX, t.clientY);
  };
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd, { passive: true });
}

function getDragTarget(x, y) {
  const els = document.elementsFromPoint(x, y);
  return els.find(el =>
    el.classList.contains('todo-item') &&
    !el.classList.contains('done') &&
    el !== dragSrc
  );
}

function highlightDragOver(target, clientY) {
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const mid  = rect.top + rect.height / 2;

  if (clientY < mid) {
    // 커서가 target 위쪽 절반 → target 위에 선 표시
    target.classList.add('drag-over-top');
  } else {
    // 커서가 target 아래쪽 절반 → target 아래에 선 표시
    target.classList.add('drag-over-bottom');
  }
}

async function finishDrag(x, y) {
  if (!dragSrc) return;
  dragSrc.classList.remove('dragging');

  const target = getDragTarget(x, y);
  document.querySelectorAll('.todo-item').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  if (target && target !== dragSrc) {
    const rect = target.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    const insertBefore = y < mid;

    if (insertBefore) {
      target.before(dragSrc);
    } else {
      target.after(dragSrc);
    }

    const list = document.getElementById('todo-list');
    const newOrder = [...list.querySelectorAll('.todo-item:not(.done)')]
      .map(el => AppState.todos.find(t => String(t.id) === String(el.dataset.id)))
      .filter(t => t && !t._virtual);

    try {
      await updateSortOrders(newOrder);
      newOrder.forEach((t, i) => { t.sort_order = i; });
    } catch(e) {
      console.error('sort order save failed', e);
    }
  }

  dragSrc = null;

  // 드래그 완료 후 중요도 순으로 즉시 재렌더링
  renderTodos();
}
