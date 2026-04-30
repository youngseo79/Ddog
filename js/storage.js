// =============================================
// storage.js — 창고 탭 (날짜 없는 "곧 할 일들")
// 독립 파일: todo.js / weekly.js / gesture.js 원본 미수정
// 자체 액션 시트를 사용 (기존 action-popup과 완전 분리)
// =============================================

function initStorage() {
  // 창고 전용 액션 시트는 필요할 때 동적으로 생성.
  // 헤더 스타일을 JS 인라인으로 강제 적용 → CSS 캐시/충돌과 무관하게 확실하게 렌더링.
  _applyStorageHeaderStyles();

  // 모바일 창고 탭 헤더 우측의 "+" 버튼 → 할일 탭의 FAB와 동일하게 openAddModal 호출
  // 단, 창고 탭에서 연 경우엔 자동으로 "상세"+"창고" 체크 + 제목을 "창고 추가"로 변경 + 잠금
  const fab = document.getElementById('storage-fab-add');
  if (fab && !fab._bound) {
    fab._bound = true;
    fab.addEventListener('click', () => {
      if (typeof openAddModal !== 'function') return;
      openAddModal();
      // 모달이 openAddModal 내부의 setTimeout(focus)까지 완료된 뒤에 창고 모드로 전환.
      // 순서: 상세 펼치기 → 창고 체크 → 제목 변경 → 잠금 → 제목 입력란에 포커스
      _forceStorageModeInAddModal();
    });
  }
}

// 창고탭 +로 열었을 때만 호출: 사용자가 수동으로 "상세" + "창고"를 클릭한 것과 동일한 효과 재현
// 다른 경로(할일탭 +, 편집 등)에서는 전혀 호출되지 않음.
function _forceStorageModeInAddModal() {
  // 1) 상세 토글 체크 + change 이벤트 발화 → 기존 리스너가 detail-section.hidden 제거
  const detailToggle = document.getElementById('detail-toggle');
  if (detailToggle && !detailToggle.checked) {
    detailToggle.checked = true;
    detailToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 2) 창고 체크박스 체크 + change 이벤트 발화 → 기존 applyStorageMode(true) 실행
  const storageToggle = document.getElementById('storage-flag-toggle');
  if (storageToggle && !storageToggle.checked) {
    storageToggle.checked = true;
    storageToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 3) 창고 체크박스 잠금 (해제 불가) — 편집 시와 동일한 시각 처리
  if (storageToggle) {
    storageToggle.disabled = true;
    const label = document.getElementById('storage-flag-label');
    if (label) label.classList.add('disabled');
  }

  // 4) 상세 토글 잠금 (접기 불가)
  if (detailToggle) {
    detailToggle.disabled = true;
    const detailLabel = document.getElementById('detail-toggle-label');
    if (detailLabel) detailLabel.style.opacity = '0.45';
  }

  // 5) 모달 제목을 "창고 추가"로 변경
  const titleLabel = document.getElementById('modal-title-label');
  if (titleLabel) titleLabel.textContent = '창고 추가';

  // 6) 제목 입력란에 포커스 (openAddModal의 setTimeout(300)과 겹치지 않게 약간 늦게)
  setTimeout(() => {
    const titleInput = document.getElementById('input-title');
    if (titleInput) titleInput.focus();
  }, 320);
}

function _applyStorageHeaderStyles() {
  const header = document.getElementById('storage-header');
  const dateEl = document.getElementById('storage-header-date');
  const title  = document.getElementById('storage-header-title');
  const fab    = document.getElementById('storage-fab-add');
  const isPc   = document.body.classList.contains('pc-layout');

  if (header) {
    header.style.cssText = `
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 10px 16px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      min-height: 44px;
      gap: 8px;
    `;
  }

  // 좌측 날짜/요일 (모바일 전용 — PC에는 좌측 패널에 이미 달력이 있음)
  if (dateEl) {
    if (isPc) {
      dateEl.style.cssText = 'visibility: hidden;';
    } else {
      dateEl.style.cssText = `
        justify-self: start;
        font-size: 14px;
        font-weight: 700;
        font-family: var(--font-ui);
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      _updateStorageHeaderDate();
    }
  }

  // 중앙 타이틀
  if (title) {
    title.style.cssText = `
      justify-self: center;
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.2px;
      text-align: center;
      white-space: nowrap;
    `;
  }

  // 우측 "+" 버튼 (모바일 전용)
  if (fab) {
    if (isPc) {
      fab.style.cssText = 'display: none;';
    } else {
      fab.style.cssText = `
        justify-self: end;
        width: 36px; height: 36px;
        border-radius: 50%;
        background: var(--accent);
        color: #1a1a2e;
        font-size: 22px;
        font-weight: 300;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        cursor: pointer;
        box-shadow: 0 3px 12px rgba(126,207,160,0.35);
        line-height: 1;
        transition: transform 0.15s;
        flex-shrink: 0;
        margin-right: 12px;
      `;
    }
  }
}

// 모바일 창고 탭 헤더 좌측의 날짜/요일: 언제나 "오늘" 날짜 표시.
//   - 할일 탭의 selectedDate 와 무관
//   - 자정을 넘긴 상태에서도 탭을 다시 열거나 loadStorage 호출 시 자동 갱신됨
function _updateStorageHeaderDate() {
  const el = document.getElementById('storage-header-date');
  if (!el) return;
  if (document.body.classList.contains('pc-layout')) return;

  const d    = new Date();             // 언제나 "오늘" (로컬 타임 = 한국 시간)
  const days = ['일','월','화','수','목','금','토'];
  const dow  = d.getDay();
  el.textContent = `${d.getMonth()+1}월 ${d.getDate()}일 (${days[dow]})`;
  el.style.color = dow === 0 ? 'var(--danger)' :
                   dow === 6 ? '#6b9fd4' :
                   'var(--text-primary)';
}

async function loadStorage() {
  const container = document.getElementById('storage-todo-list');
  if (!container) return;

  // 탭 전환 시마다 헤더 날짜 갱신 (선택 날짜가 바뀌어 있을 수 있음)
  _updateStorageHeaderDate();

  try {
    const rows = await fetchStorageTodos();
    renderStorageTodos(rows);
  } catch(e) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>불러오기 실패</div>';
    console.error(e);
  }
}

function renderStorageTodos(rows) {
  const container = document.getElementById('storage-todo-list');
  container.innerHTML = '';

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div>창고가 비었어요</div>';
    return;
  }

  // 정렬: 1차 중요도 내림차순, 2차 sort_order (드래그), 3차 최신순
  const sorted = [...rows].sort((a, b) => {
    if ((b.importance || 0) !== (a.importance || 0)) return (b.importance || 0) - (a.importance || 0);
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
  });

  sorted.forEach(todo => container.appendChild(makeStorageTodoItem(todo)));

  initStorageDragSort();
}

function makeStorageTodoItem(todo) {
  // 할일 탭 아이템(.todo-item)과 동일한 구조 사용 → 동일 디자인
  // 차이점: 체크박스 대신 투명 spacer, 제스처는 창고 전용
  const li = document.createElement('li');
  li.className = 'todo-item storage-item';
  li.dataset.id = todo.id;

  // 중요도 바 (창고는 반복 없음 → 항상 imp-N)
  const impBar = document.createElement('div');
  impBar.className = `imp-badge imp-${todo.importance || 0}`;

  // 체크박스 자리 → 투명 spacer (레이아웃 동일하게)
  const spacer = document.createElement('div');
  spacer.className = 'todo-check storage-check-spacer';

  // 텍스트 영역
  const textWrap = document.createElement('div');
  textWrap.className = 'todo-text';

  const titleEl = document.createElement('div');
  titleEl.className = 'todo-title';
  titleEl.appendChild(document.createTextNode(todo.title || '(제목 없음)'));
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

  // 드래그 핸들 (todo-item과 동일 스타일 클래스 사용)
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.innerHTML = '<svg viewBox="0 0 24 14" width="22" height="14" fill="currentColor"><rect y="0" width="24" height="2.5" rx="1.2"/><rect y="5.5" width="24" height="2.5" rx="1.2"/><rect y="11" width="24" height="2.5" rx="1.2"/></svg>';
  handle.setAttribute('data-storage-drag-handle', '');

  // 점3개 메뉴 버튼
  const menuBtn = document.createElement('div');
  menuBtn.className = 'todo-menu-btn';
  menuBtn.innerHTML = '<svg viewBox="0 0 4 18" width="4" height="18" fill="currentColor"><circle cx="2" cy="2" r="1.6"/><circle cx="2" cy="9" r="1.6"/><circle cx="2" cy="16" r="1.6"/></svg>';
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    openStorageAction(todo);
  });

  li.appendChild(impBar);
  li.appendChild(spacer);
  li.appendChild(textWrap);
  li.appendChild(handle);
  li.appendChild(menuBtn);

  // 클릭 → 편집 모달 (핸들/메뉴 제외)
  textWrap.addEventListener('click', () => openEditModal(todo));
  impBar.addEventListener('click', () => openEditModal(todo));

  initStorageItemGesture(li, todo);
  return li;
}

// ── 창고 항목 제스처: 좌→우, 우→좌 양방향 모두 차단 ──
//    창고는 단순 메모이므로 스와이프로 뭔가 일어나면 안 됨.
//    점3개 버튼으로만 액션 가능. 세로 스크롤은 그대로 허용.
function initStorageItemGesture(el, todo) {
  // 스와이프 자체를 허용하지 않음 → 터치 핸들러 최소화.
  // touchmove에서 가로 이동을 감지해도 시각 피드백/동작 없음.
  // → 아무 리스너도 등록하지 않는 것이 가장 확실.
  //    (기본 클릭/스크롤은 브라우저 기본 동작으로 처리됨)
  return;
}

function resetStorageItemStyle(el) {
  // 미사용 함수지만 호환성을 위해 유지
  el.style.transition = '';
  el.style.transform = '';
  el.style.background = '';
}

// =============================================
// 창고 전용 액션 시트 (action-popup과 완전 분리)
//   - 날짜 선택 / 삭제 두 가지만 존재
//   - 모바일: 하단 시트 방식 (action-popup과 유사)
//   - PC:     마우스 위치 근처 드롭다운 (pcShowDropdown과 유사)
// =============================================

let _storageActionTodo = null;

function openStorageAction(todo) {
  _storageActionTodo = todo;
  const isPc = document.body.classList.contains('pc-layout');
  if (isPc) {
    _openStoragePcDropdown(todo);
  } else {
    _openStorageMobileSheet(todo);
  }
}

function closeStorageAction() {
  const mobile = document.getElementById('storage-action-popup');
  if (mobile) mobile.remove();
  const pc = document.getElementById('storage-pc-dropdown');
  if (pc) pc.remove();
  _storageActionTodo = null;
}

// ── 모바일: 인라인 스타일로 100% 명시된 독립 시트 ──
//    (CSS 의존 없이 이 함수만으로 완전히 화면에 뜨도록 구성)
function _openStorageMobileSheet(todo) {
  closeStorageAction();

  const overlay = document.createElement('div');
  overlay.id = 'storage-action-popup';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 999;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  `;

  const box = document.createElement('div');
  box.id = 'storage-action-box';
  box.style.cssText = `
    background: var(--bg-elevated, #2a2a3e);
    width: 100%;
    max-width: 480px;
    border-radius: 16px 16px 0 0;
    padding: 12px 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  `;

  const makeBtn = (text, extra) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `
      padding: 15px 20px;
      border-radius: 8px;
      font-size: 15px;
      text-align: left;
      color: var(--text-primary, #e8e8f0);
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
      ${extra || ''}
    `;
    return b;
  };

  const btnPick = makeBtn('🗓  날짜 선택');
  btnPick.addEventListener('click', () => {
    closeStorageAction();
    _pickDateForStorage(todo.id);
  });

  const btnDelete = makeBtn('🗑  삭제', 'color: var(--danger, #e05c6a);');
  btnDelete.addEventListener('click', async () => {
    try {
      await deleteTodo(todo.id);
      closeStorageAction();
      showToast('삭제됐어요');
      await loadStorage();
    } catch(e) {
      console.error('[storage] delete failed', e);
      showToast('오류가 발생했어요');
    }
  });

  const btnCancel = makeBtn('취소', 'color: var(--text-secondary, #a8a8b8); text-align: center; border-top: 1px solid var(--border, #3a3a4a); margin-top: 4px;');
  btnCancel.addEventListener('click', closeStorageAction);

  box.appendChild(btnPick);
  box.appendChild(btnDelete);
  box.appendChild(btnCancel);
  overlay.appendChild(box);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeStorageAction();
  });

  document.body.appendChild(overlay);
}

// ── PC: 점3개 버튼 근처 드롭다운 (인라인 스타일로 완전 명시) ──
function _openStoragePcDropdown(todo) {
  closeStorageAction();

  // 해당 항목의 점3개 버튼 찾기 (이벤트 target 기반 fallback 포함)
  let refEl = null;
  document.querySelectorAll('.storage-item').forEach(el => {
    if (String(el.dataset.id) === String(todo.id)) {
      refEl = el.querySelector('.todo-menu-btn');
    }
  });

  // 못 찾으면 화면 중앙에 띄움 (안 뜨는 것보다 나음)
  let rect;
  if (refEl) {
    rect = refEl.getBoundingClientRect();
  } else {
    console.warn('[storage] PC dropdown: menu btn not found, falling back to center');
    rect = {
      top: window.innerHeight / 2,
      bottom: window.innerHeight / 2,
      right: window.innerWidth / 2 + 80,
      left: window.innerWidth / 2
    };
  }

  const dd = document.createElement('div');
  dd.id = 'storage-pc-dropdown';

  let top  = rect.bottom + 4;
  let left = rect.right - 160;
  if (left < 8) left = 8;
  if (top + 100 > window.innerHeight) top = rect.top - 104;

  // ── 인라인 스타일: CSS에 의존하지 않고 드롭다운 표시 보장 ──
  dd.style.cssText = `
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    background: var(--bg-elevated, #2a2a3e);
    border: 1px solid var(--border-light, #3a3a4a);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    z-index: 1001;
    min-width: 160px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  const makeBtn = (text, extra) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `
      display: block;
      width: 100%;
      padding: 10px 16px;
      font-size: 13px;
      color: var(--text-primary, #e8e8f0);
      text-align: left;
      border: none;
      background: transparent;
      cursor: pointer;
      font-family: inherit;
      border-bottom: 1px solid var(--border, #3a3a4a);
      ${extra || ''}
    `;
    b.addEventListener('mouseover', () => { b.style.background = 'var(--bg-hover, #3a3a4a)'; });
    b.addEventListener('mouseout',  () => { b.style.background = 'transparent'; });
    return b;
  };

  const btnPick = makeBtn('🗓  날짜 선택');
  btnPick.addEventListener('click', (e) => {
    e.stopPropagation();
    closeStorageAction();
    // PC: 할일/주간과 완전히 동일한 pcPickDate 달력 사용.
    //     onSelect 콜백으로 창고→일반 전환 동작 주입.
    if (typeof pcPickDate === 'function') {
      pcPickDate(todo.id, false, null, async (dateStr) => {
        try {
          await convertStorageToTodo(todo.id, dateStr);
          showToast('할일로 옮겼어요');
          await loadStorage();
          if (dateStr === AppState.selectedDate && typeof loadTodos === 'function') {
            await loadTodos();
          }
          updateMonthDots();
        } catch(err) {
          showToast('오류가 발생했어요');
          console.error('[storage] convert failed', err);
        }
      });
    } else {
      // pcPickDate가 없는 환경(이론상 발생 X) fallback
      _pickDateForStoragePc(todo.id);
    }
  });

  const btnDelete = makeBtn('🗑  삭제', 'color: var(--danger, #e05c6a); border-bottom: none;');
  btnDelete.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeStorageAction();
    try {
      await deleteTodo(todo.id);
      showToast('삭제됐어요');
      await loadStorage();
    } catch(err) {
      console.error('[storage] delete failed', err);
      showToast('오류가 발생했어요');
    }
  });

  dd.appendChild(btnPick);
  dd.appendChild(btnDelete);
  document.body.appendChild(dd);

  setTimeout(() => {
    document.addEventListener('click', function closeOut(e) {
      const el = document.getElementById('storage-pc-dropdown');
      if (el && !el.contains(e.target)) {
        closeStorageAction();
        document.removeEventListener('click', closeOut);
      }
    });
  }, 10);
}

// ── 모바일: 커스텀 달력 팝업으로 날짜 선택 (네이티브 input 대신 확실한 방식) ──
function _pickDateForStorage(storageId) {
  _openStorageDatePicker(storageId, false);
}

// ── PC: 동일한 커스텀 달력 팝업 사용 ──
function _pickDateForStoragePc(storageId) {
  _openStorageDatePicker(storageId, true);
}

// ── 외부(gesture.js 등)에서 재사용할 공용 날짜 선택 달력 ──
//   storage 관련 없이, 단순히 "예쁜 달력 띄우고 선택된 날짜를 콜백으로 돌려주는" 용도
function openCustomDatePicker(onSelect, initialDate) {
  // storageId=null, isPc=false(자동 분기 아님), onSelect 콜백 주입
  // initialDate는 현재 _openStorageDatePicker가 오늘 기준으로 시작하므로 생략
  _openStorageDatePicker(null, false, onSelect);
}

// ── 공용 커스텀 달력 팝업 (모바일/PC 공통) ──
//   storageId 가 있으면: 창고→일반 할일 전환 (기존 동작)
//   onSelect  가 있으면: 선택한 dateStr 로 콜백 호출 (일반 할일/주간에서 재사용용)
function _openStorageDatePicker(storageId, isPc, onSelect) {
  const existing = document.getElementById('storage-date-picker-popup');
  if (existing) existing.remove();

  const today = new Date();
  let pickerYear  = today.getFullYear();
  let pickerMonth = today.getMonth() + 1;

  // 화면 크기에 따라 팝업 너비 결정
  const vw = window.innerWidth;
  const popupWidth = Math.min(420, vw - 40);

  // 배경 오버레이 (탭 외부 클릭으로 닫기용)
  const backdrop = document.createElement('div');
  backdrop.id = 'storage-date-picker-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 1000;
  `;
  // ⚠️ backdrop click 리스너는 setTimeout으로 지연 등록.
  // 이유: 이전 액션 시트의 "날짜 선택" 버튼 클릭 이벤트가 아직 버블링 중인 상태에서
  //       새 backdrop이 즉시 추가되면, 같은 클릭을 받아서 달력을 즉시 닫아버림.
  //       10ms 지연으로 버블링이 끝난 뒤에 리스너 부착.
  setTimeout(() => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        popup.remove();
      }
    });
  }, 10);

  const popup = document.createElement('div');
  popup.id = 'storage-date-picker-popup';
  popup.style.cssText = `
    position: fixed; z-index: 1001;
    background: var(--bg-elevated, #2a2a3e);
    border: 1px solid var(--border-light, #3a3a4a);
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    padding: 20px;
    width: ${popupWidth}px;
    user-select: none;
    font-family: inherit;
  `;

  // 위치: 화면 정중앙
  popup.style.left = Math.round((vw - popupWidth) / 2) + 'px';
  popup.style.top  = Math.round((window.innerHeight - 440) / 2) + 'px';

  function renderPicker() {
    popup.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:4px;';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '‹';
    prevBtn.style.cssText = 'font-size:28px;color:var(--text-secondary);background:none;border:none;cursor:pointer;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    prevBtn.addEventListener('click', e => {
      e.stopPropagation();
      pickerMonth--; if (pickerMonth < 1) { pickerMonth = 12; pickerYear--; }
      renderPicker();
    });

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:17px;font-weight:700;color:var(--text-primary);flex:1;text-align:center;';
    titleEl.textContent = `${pickerYear}년 ${pickerMonth}월`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '›';
    nextBtn.style.cssText = prevBtn.style.cssText;
    nextBtn.addEventListener('click', e => {
      e.stopPropagation();
      pickerMonth++; if (pickerMonth > 12) { pickerMonth = 1; pickerYear++; }
      renderPicker();
    });

    const thisMonthBtn = document.createElement('button');
    thisMonthBtn.textContent = '오늘';
    thisMonthBtn.style.cssText = 'font-size:11px;font-weight:600;color:var(--accent);background:var(--accent-glow);border:1px solid var(--accent);cursor:pointer;padding:5px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0;';
    thisMonthBtn.addEventListener('click', e => {
      e.stopPropagation();
      const t = new Date();
      pickerYear  = t.getFullYear();
      pickerMonth = t.getMonth() + 1;
      renderPicker();
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'font-size:16px;color:var(--text-muted);background:none;border:none;cursor:pointer;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      popup.remove();
      backdrop.remove();
    });

    header.appendChild(prevBtn);
    header.appendChild(titleEl);
    header.appendChild(nextBtn);
    header.appendChild(thisMonthBtn);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    const wdays = document.createElement('div');
    wdays.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px;';
    ['일','월','화','수','목','금','토'].forEach((d, i) => {
      const span = document.createElement('div');
      span.textContent = d;
      span.style.cssText = `text-align:center;font-size:12px;font-weight:600;padding:4px 0;color:${i===0?'var(--danger)':i===6?'#6b9fd4':'var(--text-muted)'};`;
      wdays.appendChild(span);
    });
    popup.appendChild(wdays);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;';

    const firstDay = new Date(pickerYear, pickerMonth - 1, 1).getDay();
    const lastDate = new Date(pickerYear, pickerMonth, 0).getDate();
    const todayStr2 = toLocalDateStr(new Date());

    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (let d = 1; d <= lastDate; d++) {
      const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cell = document.createElement('button');
      cell.textContent = d;
      const isToday = dateStr === todayStr2;
      const dow = new Date(pickerYear, pickerMonth - 1, d).getDay();
      const color = dow === 0 ? 'var(--danger)' : dow === 6 ? '#6b9fd4' : 'var(--text-primary)';
      cell.style.cssText = `
        aspect-ratio:1;width:100%;border:none;cursor:pointer;border-radius:50%;
        font-size:15px;font-weight:${isToday?'700':'400'};
        background:${isToday?'var(--accent-glow)':'none'};
        color:${color};
        display:flex;align-items:center;justify-content:center;transition:background 0.12s;
      `;
      cell.addEventListener('click', async e => {
        e.stopPropagation();
        popup.remove();
        backdrop.remove();
        try {
          if (typeof onSelect === 'function') {
            // 일반 할일/주간 등 외부에서 재사용: 콜백으로 위임
            await onSelect(dateStr);
          } else {
            // 창고→일반 할일 전환 (기존 동작)
            await convertStorageToTodo(storageId, dateStr);
            showToast('할일로 옮겼어요');
            await loadStorage();
            if (dateStr === AppState.selectedDate && typeof loadTodos === 'function') {
              await loadTodos();
            }
            updateMonthDots();
          }
        } catch(e2) {
          showToast('오류가 발생했어요');
          console.error('[storage] date pick failed', e2);
        }
      });
      grid.appendChild(cell);
    }
    popup.appendChild(grid);
  }

  renderPicker();
  document.body.appendChild(backdrop);
  document.body.appendChild(popup);
}


// =============================================
// 창고 드래그 정렬 (todo.js 드래그 로직과 독립)
// =============================================
let _storageDragSrc = null;
let _storageAutoScrollRAF = null;
let _storageDragCurrentY = 0;

function _storageStartAutoScroll() {
  const scrollEl = document.getElementById('storage-list-section');
  if (!scrollEl) return;
  const ZONE = 80;
  const MAX_SPEED = 6;

  function step() {
    const rect = scrollEl.getBoundingClientRect();
    const distTop    = _storageDragCurrentY - rect.top;
    const distBottom = rect.bottom - _storageDragCurrentY;
    let speed = 0;
    if (distBottom < ZONE && distBottom > 0) {
      speed = MAX_SPEED * (1 - distBottom / ZONE);
    } else if (distTop < ZONE && distTop > 0) {
      speed = -MAX_SPEED * (1 - distTop / ZONE);
    }
    if (speed !== 0) scrollEl.scrollTop += speed;
    _storageAutoScrollRAF = requestAnimationFrame(step);
  }
  _storageAutoScrollRAF = requestAnimationFrame(step);
}

function _storageStopAutoScroll() {
  if (_storageAutoScrollRAF) {
    cancelAnimationFrame(_storageAutoScrollRAF);
    _storageAutoScrollRAF = null;
  }
}

function initStorageDragSort() {
  const items = document.querySelectorAll('.storage-item');
  items.forEach(item => {
    const handle = item.querySelector('[data-storage-drag-handle]');
    if (!handle) return;
    handle.addEventListener('touchstart', _onStorageTouchDragStart, { passive: false });
    handle.addEventListener('mousedown', _onStorageMouseDragStart);
  });
}

function _onStorageMouseDragStart(e) {
  e.preventDefault();
  const item = e.currentTarget.closest('.storage-item');
  _storageDragSrc = item;
  item.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  _storageDragCurrentY = e.clientY;
  const startY = e.clientY;
  let scrollStarted = false;

  const onMove = ev => {
    _storageDragCurrentY = ev.clientY;
    if (!scrollStarted && Math.abs(ev.clientY - startY) > 10) {
      scrollStarted = true;
      _storageStartAutoScroll();
    }
    const target = _getStorageDragTarget(ev.clientX, ev.clientY);
    _highlightStorageDragOver(target, ev.clientY);
  };
  const onUp = ev => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    _storageStopAutoScroll();
    _finishStorageDrag(ev.clientX, ev.clientY);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function _onStorageTouchDragStart(e) {
  e.preventDefault();
  const item = e.currentTarget.closest('.storage-item');
  _storageDragSrc = item;
  item.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  _storageDragCurrentY = e.touches[0].clientY;
  const startY = e.touches[0].clientY;
  let scrollStarted = false;

  const onMove = ev => {
    const t = ev.touches[0];
    _storageDragCurrentY = t.clientY;
    if (!scrollStarted && Math.abs(t.clientY - startY) > 10) {
      scrollStarted = true;
      _storageStartAutoScroll();
    }
    const target = _getStorageDragTarget(t.clientX, t.clientY);
    _highlightStorageDragOver(target, t.clientY);
  };
  const onEnd = ev => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    _storageStopAutoScroll();
    const t = ev.changedTouches[0];
    _finishStorageDrag(t.clientX, t.clientY);
  };
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onEnd, { passive: true });
}

function _getStorageDragTarget(x, y) {
  const els = document.elementsFromPoint(x, y);
  return els.find(el =>
    el.classList.contains('storage-item') &&
    el !== _storageDragSrc
  );
}

function _highlightStorageDragOver(target, clientY) {
  document.querySelectorAll('.storage-item').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const mid  = rect.top + rect.height / 2;
  if (clientY < mid) target.classList.add('drag-over-top');
  else               target.classList.add('drag-over-bottom');
}

async function _finishStorageDrag(x, y) {
  if (!_storageDragSrc) return;
  _storageDragSrc.classList.remove('dragging');

  const target = _getStorageDragTarget(x, y);
  document.querySelectorAll('.storage-item').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  if (target && target !== _storageDragSrc) {
    const rect = target.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    if (y < mid) target.before(_storageDragSrc);
    else         target.after(_storageDragSrc);

    const container = document.getElementById('storage-todo-list');
    const newOrder = [...container.querySelectorAll('.storage-item')]
      .map(el => el.dataset.id);

    try {
      await Promise.all(newOrder.map((id, i) => updateTodo(id, { sort_order: i })));
    } catch(e) { console.error('[storage] sort order save failed', e); }
  }

  _storageDragSrc = null;
  loadStorage();
}
