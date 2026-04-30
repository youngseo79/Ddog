// =============================================
// calendar.js — 달력 렌더링 & 인터랙션
// =============================================

let calCollapsed = false;

function initCalendar() {
  document.getElementById('cal-toggle-btn').addEventListener('click', toggleCalendar);

  document.getElementById('cal-prev').addEventListener('click', () => moveCalMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => moveCalMonth(1));
  document.getElementById('cal-thismonth-btn').addEventListener('click', () => {
    const today = new Date();
    AppState.calYear  = today.getFullYear();
    AppState.calMonth = today.getMonth() + 1;
    AppState.selectedDate = toLocalDateStr(today);
    renderCalendar();
    updateMonthDots();
    loadTodos();
  });
  document.getElementById('cal-year').addEventListener('click', openYearPopup);
  document.getElementById('cal-month').addEventListener('click', openMonthPopup);

  initCalendarSwipe();

  document.getElementById('year-cancel').addEventListener('click', closeYearPopup);
  document.getElementById('year-confirm').addEventListener('click', confirmYear);
  document.getElementById('year-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmYear();
  });

  document.getElementById('month-popup').addEventListener('click', e => {
    if (e.target.id === 'month-popup') closeMonthPopup();
  });
  document.getElementById('year-popup').addEventListener('click', e => {
    if (e.target.id === 'year-popup') closeYearPopup();
  });

  document.querySelectorAll('.month-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.calMonth = parseInt(btn.dataset.m);
      closeMonthPopup();
      renderCalendar();
    });
  });

  renderCalendar();
}

function toggleCalendar() {
  calCollapsed = !calCollapsed;
  const section = document.getElementById('calendar-section');
  const icon = document.getElementById('cal-toggle-icon');

  if (calCollapsed) {
    section.classList.add('collapsed');
    // 아이콘 → 아래 화살표
    icon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
    renderMiniWeek();
  } else {
    section.classList.remove('collapsed');
    // 아이콘 → 위 화살표
    icon.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
    renderCalendar();
  }
}

function renderMiniWeek() {
  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const selectedDate = AppState.selectedDate;

  // 선택된 날짜가 포함된 주를 기준으로 렌더링
  const baseDate = new Date(selectedDate + 'T00:00:00');
  const dow = baseDate.getDay(); // 0=일, 6=토
  const weekStart = new Date(baseDate);
  weekStart.setDate(baseDate.getDate() - dow); // 일요일 기준 주 시작

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = toLocalDateStr(d);
    const cell = makeCalCell(d.getDate(), d.getFullYear(), d.getMonth() + 1, false, todayStr, selectedDate);
    grid.appendChild(cell);
  }

  // 헤더 년/월 표시 업데이트
  document.getElementById('cal-year').textContent  = baseDate.getFullYear();
  document.getElementById('cal-month').textContent = baseDate.getMonth() + 1;
}

function moveCalMonth(dir) {
  AppState.calMonth += dir;
  if (AppState.calMonth > 12) { AppState.calMonth = 1;  AppState.calYear++; }
  if (AppState.calMonth < 1)  { AppState.calMonth = 12; AppState.calYear--; }
  animateCalendar(dir);
  updateMonthDots();
}

function animateCalendar(dir) {
  const grid = document.getElementById('calendar-grid');
  const parent = grid.parentElement;
  const oldGrid = grid.cloneNode(true);
  oldGrid.style.cssText = `position:absolute;top:${grid.offsetTop}px;left:0;width:100%;z-index:1;pointer-events:none;`;
  parent.style.position = 'relative';
  parent.style.overflow = 'hidden';
  parent.appendChild(oldGrid);
  renderCalendar();
  const fromX = dir > 0 ? '100%' : '-100%';
  const toX   = dir > 0 ? '-100%' : '100%';
  grid.style.cssText = `transform:translateX(${fromX});transition:none;`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const dur = '0.28s cubic-bezier(0.4,0,0.2,1)';
      grid.style.cssText = `transform:translateX(0);transition:transform ${dur};`;
      oldGrid.style.transition = `transform ${dur}`;
      oldGrid.style.transform  = `translateX(${toX})`;
      setTimeout(() => {
        oldGrid.remove();
        grid.style.cssText = '';
        parent.style.overflow = '';
      }, 300);
    });
  });
}

function renderCalendar() {
  const { calYear, calMonth, selectedDate } = AppState;
  document.getElementById('cal-year').textContent  = calYear;
  document.getElementById('cal-month').textContent = calMonth;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const firstDay     = new Date(calYear, calMonth - 1, 1).getDay();
  const lastDate     = new Date(calYear, calMonth, 0).getDate();
  const prevLastDate = new Date(calYear, calMonth - 1, 0).getDate();
  const today        = todayStr();

  for (let i = firstDay - 1; i >= 0; i--)
    grid.appendChild(makeCalCell(prevLastDate - i, calYear, calMonth - 1, true, today, selectedDate));
  for (let d = 1; d <= lastDate; d++)
    grid.appendChild(makeCalCell(d, calYear, calMonth, false, today, selectedDate));
  const remaining = (7 - grid.children.length % 7) % 7;
  for (let d = 1; d <= remaining; d++)
    grid.appendChild(makeCalCell(d, calYear, calMonth + 1, true, today, selectedDate));

  updateSelectedDateLabel();
}

function makeCalCell(day, year, month, isOtherMonth, today, selectedDate) {
  const date    = new Date(year, month - 1, day);
  const dateStr = toLocalDateStr(date);
  const dow     = date.getDay();

  const el = document.createElement('div');
  el.className = 'cal-day';
  el.dataset.date = dateStr;

  // span으로 숫자+점 묶기 (z-index용)
  const span = document.createElement('span');
  span.textContent = day;
  el.appendChild(span);

  if (isOtherMonth) el.classList.add('other-month');
  if (dow === 0) el.classList.add('sun');
  if (dow === 6) el.classList.add('sat');
  if (dateStr === today) el.classList.add('today');
  if (dateStr === selectedDate) el.classList.add('selected');
  if (AppState.dotDates.has(dateStr)) el.classList.add('has-todo');
  if (AppState.pastUndoneDates && AppState.pastUndoneDates.has(dateStr)) el.classList.add('past-undone');

  el.addEventListener('click', () => selectDate(dateStr));
  return el;
}

function selectDate(dateStr) {
  AppState.selectedDate = dateStr;
  const [y, m] = dateStr.split('-').map(Number);
  if (calCollapsed) {
    // 축소 상태: 미니 주간 다시 렌더
    renderMiniWeek();
    updateSelectedDateLabel();
  } else if (y !== AppState.calYear || m !== AppState.calMonth) {
    AppState.calYear  = y;
    AppState.calMonth = m;
    renderCalendar();
  } else {
    document.querySelectorAll('.cal-day').forEach(el => {
      el.classList.toggle('selected', el.dataset.date === dateStr);
    });
    updateSelectedDateLabel();
  }
  loadTodos();
}

function updateSelectedDateLabel() {
  const d    = new Date(AppState.selectedDate + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  const dow  = d.getDay();
  const label = `${d.getMonth()+1}월 ${d.getDate()}일 (${days[dow]})`;
  const el = document.getElementById('selected-date-label');
  el.textContent = label;
  el.className = dow === 0 ? 'date-label-sun' : dow === 6 ? 'date-label-sat' : 'date-label-weekday';
}

async function updateMonthDots() {
  try {
    const dates = await fetchDotDatesForMonth(AppState.calYear, AppState.calMonth);
    const pastUndone = await fetchPastUndoneDatesForMonth(AppState.calYear, AppState.calMonth);
    AppState.dotDates = new Set(dates);
    AppState.pastUndoneDates = new Set(pastUndone);
    document.querySelectorAll('.cal-day').forEach(el => {
      el.classList.toggle('has-todo', AppState.dotDates.has(el.dataset.date));
      el.classList.toggle('past-undone', AppState.pastUndoneDates.has(el.dataset.date));
    });
  } catch(e) { console.warn('dot dates fetch failed', e); }
}

function openYearPopup() {
  document.getElementById('year-input').value = AppState.calYear;
  document.getElementById('year-popup').classList.remove('hidden');
  setTimeout(() => document.getElementById('year-input').focus(), 100);
}
function closeYearPopup() { document.getElementById('year-popup').classList.add('hidden'); }
function confirmYear() {
  const val = parseInt(document.getElementById('year-input').value);
  if (val >= 1900 && val <= 2100) {
    AppState.calYear = val;
    closeYearPopup();
    renderCalendar();
  }
}

function openMonthPopup() {
  document.querySelectorAll('.month-btn').forEach(btn => {
    btn.classList.toggle('current', parseInt(btn.dataset.m) === AppState.calMonth);
  });
  document.getElementById('month-popup').classList.remove('hidden');
}
function closeMonthPopup() { document.getElementById('month-popup').classList.add('hidden'); }

function initCalendarSwipe() {
  const calSection = document.getElementById('calendar-section');
  let startX = 0, startY = 0, movedH = false, movedV = false;

  calSection.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    movedH = false; movedV = false;
  }, { passive: true });

  calSection.addEventListener('touchmove', e => {
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > dy && dx > 10) movedH = true;
    if (dy > dx && dy > 10) movedV = true;
  }, { passive: true });

  calSection.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (movedH && Math.abs(dx) > 50) moveCalMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  // PC 마우스
  let mStartX = 0, mDown = false;
  calSection.addEventListener('mousedown', e => { mStartX = e.clientX; mDown = true; });
  calSection.addEventListener('mouseup', e => {
    if (!mDown) return; mDown = false;
    const dx = e.clientX - mStartX;
    if (Math.abs(dx) > 50) moveCalMonth(dx < 0 ? 1 : -1);
  });
  calSection.addEventListener('mouseleave', () => { mDown = false; });
}