// =============================================
// gesture.js — 할일 아이템 스와이프 제스처
// =============================================

let actionTargetId = null;
let actionTargetTodo = null;
let actionFromWeekly = false;
let actionTargetDate = null;

function initGesturePopup() {
  document.getElementById('action-popup').addEventListener('click', e => {
    if (e.target.id === 'action-popup') closeActionPopup();
  });

  document.getElementById('action-tomorrow').addEventListener('click', async () => {
    if (!actionTargetId) return;
    const fromWeekly = actionFromWeekly; // 플래그를 먼저 로컬에 저장
    try {
      const baseDate = actionTargetDate || AppState.selectedDate;
      const d = new Date(baseDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      const nextDay = toLocalDateStr(d);
      await moveTodoDate(actionTargetId, nextDay);
      closeActionPopup();
      showToast('1일 뒤로 이동했어요');
      if (fromWeekly) {
        await loadWeekly();
      } else {
        await loadTodos();
        updateMonthDots();
      }
    } catch(e) { showToast('오류가 발생했어요'); }
  });

  document.getElementById('action-pick-date').addEventListener('click', () => {
    const fromWeekly = actionFromWeekly;
    const targetId   = actionTargetId;
    // 액션 팝업을 먼저 닫아 달력이 깔끔하게 뜨도록
    closeActionPopup();

    // 공용 커스텀 달력 (storage.js가 제공) 호출.
    // 날짜 선택 후 기존 로직(moveTodoDate + 화면 갱신)을 그대로 실행.
    const onSelect = async (newDate) => {
      if (!newDate || !targetId) return;
      try {
        await moveTodoDate(targetId, newDate);
        showToast('날짜를 변경했어요');
        if (fromWeekly) {
          await loadWeekly();
        } else {
          await loadTodos();
          updateMonthDots();
        }
      } catch(e) { showToast('오류가 발생했어요'); }
    };

    // PC면 pcPickDate (index-pc.html이 제공), 모바일이면 openCustomDatePicker (storage.js 제공)
    const isPc = document.body.classList.contains('pc-layout');
    if (isPc && typeof pcPickDate === 'function') {
      pcPickDate(targetId, fromWeekly, actionTargetDate, onSelect);
    } else if (typeof openCustomDatePicker === 'function') {
      openCustomDatePicker(onSelect);
    } else {
      // 최후의 fallback: 네이티브 input (이론상 도달하지 않음)
      const picker = document.getElementById('action-date-picker');
      picker.value = actionTargetDate || AppState.selectedDate;
      picker.showPicker?.();
      picker.addEventListener('change', async function onPick() {
        picker.removeEventListener('change', onPick);
        if (picker.value) await onSelect(picker.value);
      });
    }
  });

  document.getElementById('action-delete').addEventListener('click', async () => {
    if (!actionTargetId) return;
    const todo = actionTargetTodo;

    // 반복 일정 판단:
    // 1) 가상 항목(_virtual): 마스터에서 파생된 가상 렌더
    // 2) 반복 마스터(repeat_type≠none, repeat_master_id 없음)
    // 3) 예외 행(repeat_master_id 있음): 체크 완료 등으로 이미 예외 행이 생성된 상태
    //    → 예외 행도 결국 반복 일정이므로 삭제 옵션 3가지를 표시해야 함
    const isRepeat = todo && (
      todo._virtual ||
      (todo.repeat_type && todo.repeat_type !== 'none' && !todo.repeat_master_id && !todo.repeat_exception) ||
      (!!todo.repeat_master_id && todo.repeat_exception)
    );

    if (isRepeat) {
      const masterId = todo._virtual   ? todo._masterId :
                       todo.repeat_master_id ? todo.repeat_master_id : todo.id;
      showRepeatDeleteSheet(masterId, actionTargetDate, actionFromWeekly);
    } else {
      const fromWeekly = actionFromWeekly;
      try {
        await deleteTodo(actionTargetId);
        AppState.todos = AppState.todos.filter(t => t.id !== actionTargetId);
        closeActionPopup();
        showToast('삭제됐어요');
        if (fromWeekly) await loadWeekly();
        else { await loadTodos(); updateMonthDots(); }
      } catch(e) { showToast('오류가 발생했어요'); }
    }
  });
}

function openActionPopup(id, fromWeekly = false, targetDate = null, todo = null) {
  actionTargetId = id;
  actionTargetTodo = todo;
  actionFromWeekly = fromWeekly;
  actionTargetDate = targetDate || AppState.selectedDate;
  document.getElementById('action-popup').classList.remove('hidden');
}

function closeActionPopup() {
  document.getElementById('action-popup').classList.add('hidden');
  const sheet = document.getElementById('repeat-delete-sheet');
  if (sheet) sheet.remove();
  actionTargetId = null;
  actionTargetTodo = null;
  actionFromWeekly = false;
  actionTargetDate = null;
}

// ── 반복 삭제 선택 시트 ──
function showRepeatDeleteSheet(masterId, dateStr, fromWeekly) {
  // 기존 시트 제거
  const old = document.getElementById('repeat-delete-sheet');
  if (old) old.remove();

  const sheet = document.createElement('div');
  sheet.id = 'repeat-delete-sheet';
  sheet.className = 'repeat-delete-sheet';

  const title = document.createElement('div');
  title.className = 'rds-title';
  title.textContent = '반복 일정 삭제';
  sheet.appendChild(title);

  const options = [
    { label: '이 날짜만 삭제',       action: async () => { await deleteRepeatOnlyDate(masterId, dateStr); showToast('이 날짜만 삭제했어요'); } },
    { label: '이 날짜 이후 모두 삭제', action: async () => { await deleteRepeatFromDate(masterId, dateStr); showToast('이후 반복을 삭제했어요'); } },
    { label: '전체 반복 삭제',        action: async () => { await deleteRepeatAll(masterId); showToast('반복 일정을 삭제했어요'); } },
  ];

  options.forEach(({ label, action }) => {
    const btn = document.createElement('button');
    btn.className = 'rds-btn';
    if (label.includes('전체')) btn.classList.add('danger');
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      try {
        await action();
        closeActionPopup();
        if (fromWeekly) await loadWeekly();
        else { await loadTodos(); updateMonthDots(); }
      } catch(e) { showToast('오류가 발생했어요'); }
    });
    sheet.appendChild(btn);
  });

  const cancel = document.createElement('button');
  cancel.className = 'rds-btn cancel';
  cancel.textContent = '취소';
  cancel.addEventListener('click', () => sheet.remove());
  sheet.appendChild(cancel);

  document.getElementById('action-box').appendChild(sheet);
}

// ── 할일탭 아이템 제스처 ──
function initItemGesture(el, todo) {
  let startX = 0, startY = 0, moved = false, currentX = 0, isHorizontal = null;

  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false; currentX = 0; isHorizontal = null;
    el.style.transition = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (isHorizontal === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8)
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      return;
    }
    if (!isHorizontal) return;
    moved = true;
    currentX = dx;
    const clampedX = Math.max(-120, Math.min(120, dx));
    el.style.transform = `translateX(${clampedX}px)`;
    if (dx > 20)       el.style.background = `rgba(126,207,160,${Math.min(dx/120, 0.3)})`;
    else if (dx < -20) el.style.background = `rgba(224,92,106,${Math.min(Math.abs(dx)/120, 0.25)})`;
    else               el.style.background = '';
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!isHorizontal || !moved) { resetItemStyle(el); return; }
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < Math.abs(dy) || Math.abs(dx) < 60) { resetItemStyle(el); return; }

    if (dx > 0 && !todo.is_done) {
      // 체크리스트가 있으면 스와이프 완료 차단
      if (hasChecklist(todo)) {
        resetItemStyle(el);
        showToast('상세보기에서 체크리스트를 완료해주세요');
        return;
      }
      el.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      el.style.transform = 'translateX(110%)';
      el.style.opacity = '0';
      setTimeout(async () => {
        try {
          if (todo._virtual) {
            await insertRepeatException(todo._masterId, todo.date || AppState.selectedDate, true);
          } else {
            await toggleDone(todo.id, true);
            const t = AppState.todos.find(t => t.id === todo.id);
            if (t) { t.is_done = true; t.done_at = new Date().toISOString(); }
          }
          playCompleteSound();
          await loadTodos();
          updateMonthDots();
        } catch(e) { resetItemStyle(el); showToast('오류가 발생했어요'); }
      }, 250);
    } else if (dx < 0) {
      resetItemStyle(el);
      openActionPopup(todo.id, false, todo.date || AppState.selectedDate, todo);
    } else {
      resetItemStyle(el);
    }
  }, { passive: true });
}

function resetItemStyle(el) {
  el.style.transition = 'transform 0.2s ease, background 0.2s ease';
  el.style.transform = '';
  el.style.background = '';
  setTimeout(() => { el.style.transition = ''; }, 220);
}