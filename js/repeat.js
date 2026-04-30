// =============================================
// repeat.js — 반복 설정 모달 & 반복 계산
// =============================================

let repeatConfig = {
  type: 'none',
  weekdays: [],      // 매주: [0~6] 배열
  monthMode: 'day',  // 매월: 'day' | 'week'
  monthDay: 0,       // 매월 N일 (0 = 미설정)
  monthWeek: 1,      // 매월 X째주
  monthWeekday: 1,   // 매월 X째주 Y요일
  yearlyMonth: 1,    // 매년 M월
  yearlyDay: 0,      // 매년 M월 N일 (0 = 미설정)
  customUnit: 'day', // 커스텀: 'day'|'week'|'month'|'year'
  customInterval: 2, // 커스텀: 반복 간격 (N)
  endDate: null,
};

function initRepeat() {
  document.getElementById('repeat-btn').addEventListener('click', openRepeatModal);
  document.getElementById('repeat-modal-close').addEventListener('click', closeRepeatModal);
  document.getElementById('repeat-overlay').addEventListener('click', e => {
    if (e.target.id === 'repeat-overlay') closeRepeatModal();
  });
  document.getElementById('repeat-cancel-btn').addEventListener('click', () => {
    resetRepeat();
    closeRepeatModal();
  });
  document.getElementById('repeat-confirm-btn').addEventListener('click', confirmRepeat);

  // 반복 타입 버튼
  document.querySelectorAll('.rtype-btn').forEach(btn => {
    btn.addEventListener('click', () => selectRepeatType(btn.dataset.type));
  });

  // 매주 요일 버튼
  document.querySelectorAll('#repeat-weekday-btns .rday-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  // 커스텀 단위 버튼 (일/주/개월/년)
  document.querySelectorAll('.rcustom-unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rcustom-unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateCustomUnitLabel(btn.dataset.unit);
    });
  });

  // 매월 모드 버튼
  document.querySelectorAll('.rmonth-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rmonth-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('repeat-monthly-day-wrap').classList.toggle('hidden', mode !== 'day');
      document.getElementById('repeat-monthly-week-wrap').classList.toggle('hidden', mode !== 'week');
    });
  });

  // 종료일 토글
  document.getElementById('repeat-end-toggle').addEventListener('change', e => {
    document.getElementById('repeat-end-date-wrap').classList.toggle('hidden', !e.target.checked);
  });
}

function openRepeatModal() {
  const baseDate = document.getElementById('input-date').value || getDefaultDate();
  const d = new Date(baseDate + 'T00:00:00');

  // 초기값 세팅
  document.getElementById('repeat-monthly-day').value = repeatConfig.monthDay || '';
  document.getElementById('repeat-yearly-month').value = repeatConfig.yearlyMonth || (d.getMonth() + 1);
  document.getElementById('repeat-yearly-day').value = repeatConfig.yearlyDay || '';
  document.getElementById('repeat-end-date').value = repeatConfig.endDate || '';
  document.getElementById('repeat-end-toggle').checked = !!repeatConfig.endDate;
  document.getElementById('repeat-end-date-wrap').classList.toggle('hidden', !repeatConfig.endDate);

  // 요일 버튼 초기화
  document.querySelectorAll('#repeat-weekday-btns .rday-btn').forEach(btn => {
    btn.classList.toggle('active', repeatConfig.weekdays.includes(parseInt(btn.dataset.d)));
  });
  document.querySelectorAll('.rcustom-unit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === (repeatConfig.customUnit || 'day'));
  });
  updateCustomUnitLabel(repeatConfig.customUnit || 'day');
  const intervalInput = document.getElementById('repeat-custom-interval');
  if (intervalInput) {
    intervalInput.value = (repeatConfig.type === 'custom') ? repeatConfig.customInterval : '';
  }

  selectRepeatType(repeatConfig.type || 'none');
  document.getElementById('repeat-overlay').classList.remove('hidden');
}

function closeRepeatModal() {
  document.getElementById('repeat-overlay').classList.add('hidden');
}

function selectRepeatType(type) {
  document.querySelectorAll('.rtype-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.rtype-btn[data-type="${type}"]`);
  if (btn) btn.classList.add('active');

  // 모든 상세 옵션 숨김
  document.querySelectorAll('.repeat-detail').forEach(el => el.classList.add('hidden'));

  // 해당 타입 옵션 표시
  if (type === 'weekly')  document.getElementById('repeat-weekly-wrap').classList.remove('hidden');
  if (type === 'monthly') document.getElementById('repeat-monthly-wrap').classList.remove('hidden');
  if (type === 'yearly')  document.getElementById('repeat-yearly-wrap').classList.remove('hidden');
  if (type === 'custom')  document.getElementById('repeat-custom-wrap').classList.remove('hidden');

  repeatConfig.type = type;
}

function confirmRepeat() {
  const type = repeatConfig.type;

  if (type === 'none') {
    resetRepeat();
    closeRepeatModal();
    updateRepeatBtn();
    return;
  }

  if (type === 'weekly') {
    repeatConfig.weekdays = [...document.querySelectorAll('#repeat-weekday-btns .rday-btn.active')]
      .map(b => parseInt(b.dataset.d));
    if (!repeatConfig.weekdays.length) { showToast('요일을 선택해주세요'); return; }
  }

  if (type === 'monthly') {
    const mode = document.querySelector('.rmonth-mode-btn.active')?.dataset.mode || 'day';
    repeatConfig.monthMode = mode;
    if (mode === 'day') {
      const val = parseInt(document.getElementById('repeat-monthly-day').value);
      if (!val || val < 1 || val > 31) { showToast('날짜를 입력해주세요 (1~31)'); return; }
      repeatConfig.monthDay = val;
    } else {
      repeatConfig.monthWeek = parseInt(document.getElementById('repeat-monthly-week').value) || 1;
      repeatConfig.monthWeekday = parseInt(document.getElementById('repeat-monthly-weekday').value);
    }
  }

  if (type === 'yearly') {
    repeatConfig.yearlyMonth = parseInt(document.getElementById('repeat-yearly-month').value) || 1;
    const val = parseInt(document.getElementById('repeat-yearly-day').value);
    if (!val || val < 1 || val > 31) { showToast('날짜를 입력해주세요 (1~31)'); return; }
    repeatConfig.yearlyDay = val;
  }

  if (type === 'custom') {
    const intervalVal = parseInt(document.getElementById('repeat-custom-interval').value);
    const n = isNaN(intervalVal) ? 2 : intervalVal;
    if (n < 2) { showToast('최솟값은 2입니다'); return; }
    repeatConfig.customInterval = n;
    repeatConfig.customUnit = document.querySelector('.rcustom-unit-btn.active')?.dataset.unit || 'day';
  }

  if (document.getElementById('repeat-end-toggle').checked) {
    repeatConfig.endDate = document.getElementById('repeat-end-date').value || null;
  } else {
    repeatConfig.endDate = null;
  }

  closeRepeatModal();
  updateRepeatBtn();
}

function resetRepeat() {
  repeatConfig = { type: 'none', weekdays: [], monthMode: 'day', monthDay: 0, monthWeek: 1, monthWeekday: 1, yearlyMonth: 1, yearlyDay: 0, customUnit: 'day', customInterval: 2, endDate: null };
  updateRepeatBtn();
}

function updateRepeatBtn() {
  const btn = document.getElementById('repeat-btn');
  const isSet = repeatConfig.type !== 'none';
  btn.classList.toggle('active', isSet);
  btn.title = isSet ? getRepeatLabel() : '반복 설정';
}

function getRepeatLabel() {
  switch(repeatConfig.type) {
    case 'daily':   return '매일';
    case 'weekly': {
      const days = ['일','월','화','수','목','금','토'];
      return '매주 ' + repeatConfig.weekdays.map(d => days[d]).join(',');
    }
    case 'monthly':
      if (repeatConfig.monthMode === 'week') {
        const weeks = ['첫째','둘째','셋째','넷째','마지막'];
        const days = ['일','월','화','수','목','금','토'];
        return `매월 ${weeks[repeatConfig.monthWeek-1]}주 ${days[repeatConfig.monthWeekday]}`;
      }
      return `매월 ${repeatConfig.monthDay}일`;
    case 'yearly':  return `매년 ${repeatConfig.yearlyMonth}/${repeatConfig.yearlyDay}`;
    case 'custom': {
      const unitLabels = { day: '일', week: '주', month: '개월', year: '년' };
      return `매 ${repeatConfig.customInterval}${unitLabels[repeatConfig.customUnit] || '일'}마다`;
    }
    default: return '';
  }
}

// 반복 config를 DB 저장용 데이터로 변환
function repeatConfigToData() {
  if (repeatConfig.type === 'none') return { repeat_type: 'none' };
  return {
    repeat_type:     repeatConfig.type,
    repeat_interval: repeatConfig.type === 'custom' ? repeatConfig.customInterval : 1,
    repeat_day:      repeatConfig.type === 'monthly' && repeatConfig.monthMode === 'day'
                       ? repeatConfig.monthDay
                       : repeatConfig.type === 'yearly' ? repeatConfig.yearlyDay : null,
    repeat_end_date: repeatConfig.endDate || null,
    // 복잡한 옵션은 JSON으로 memo_repeat에 저장
    repeat_meta: JSON.stringify({
      weekdays:      repeatConfig.weekdays,
      monthMode:     repeatConfig.monthMode,
      monthWeek:     repeatConfig.monthWeek,
      monthWeekday:  repeatConfig.monthWeekday,
      yearlyMonth:   repeatConfig.yearlyMonth,
      yearlyDay:     repeatConfig.yearlyDay,
      customUnit:    repeatConfig.customUnit,
      customInterval:repeatConfig.customInterval,
    }),
  };
}

// DB에서 불러온 데이터로 repeatConfig 복원
function dataToRepeatConfig(todo) {
  if (!todo.repeat_type || todo.repeat_type === 'none') {
    return { type: 'none', weekdays: [], monthMode: 'day', monthDay: 1, monthWeek: 1, monthWeekday: 1, yearlyMonth: 1, yearlyDay: 1, customDays: [], endDate: null };
  }
  let meta = {};
  try { meta = JSON.parse(todo.repeat_meta || '{}'); } catch(e) {}
  return {
    type:        todo.repeat_type,
    weekdays:    meta.weekdays     != null ? meta.weekdays     : [],
    monthMode:   meta.monthMode    != null ? meta.monthMode    : 'day',
    monthDay:    todo.repeat_day   != null ? todo.repeat_day   : (meta.monthDay != null ? meta.monthDay : 1),
    monthWeek:   meta.monthWeek    != null ? meta.monthWeek    : 1,
    monthWeekday:meta.monthWeekday != null ? meta.monthWeekday : 1,
    yearlyMonth: meta.yearlyMonth  != null ? meta.yearlyMonth  : 1,
    yearlyDay:   meta.yearlyDay    != null ? meta.yearlyDay    : 1,
    customUnit:  meta.customUnit     != null ? meta.customUnit     : 'day',
    customInterval: meta.customInterval != null ? meta.customInterval : 2,
    endDate:     todo.repeat_end_date || null,
  };
}

// 커스텀 단위 라벨 업데이트 헬퍼
function updateCustomUnitLabel(unit) {
  const labels = { day: '일마다', week: '주마다', month: '개월마다', year: '년마다' };
  const el = document.getElementById('repeat-custom-unit-label');
  if (el) el.textContent = labels[unit] || '일마다';
}

// ── 반복 날짜 매칭 계산 ──
function isRepeatMatch(todo, dateStr) {
  if (!todo.repeat_type || todo.repeat_type === 'none') return false;
  if (todo.repeat_master_id) return false;

  const base   = new Date(todo.date + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  if (target < base) return false;
  if (todo.repeat_end_date) {
    const end = new Date(todo.repeat_end_date + 'T00:00:00');
    if (target > end) return false;
  }

  // 시작일 당일은 반복 유형에 관계없이 항상 표시
  // (매주 특정 요일, 매월 특정 일, 매년 특정 날짜 등 시작일이 조건에 안 맞아도 첫 등록일엔 보여야 함)
  if (target.getTime() === base.getTime()) return true;

  let meta = {};
  try { meta = JSON.parse(todo.repeat_meta || '{}'); } catch(e) {}

  const diffDays = Math.round((target - base) / 86400000);
  const targetDow = target.getDay();

  switch(todo.repeat_type) {
    case 'daily':
      return true;
    case 'weekly': {
      const weekdays = meta.weekdays || [];
      return weekdays.includes(targetDow);
    }
    case 'monthly': {
      const mode = meta.monthMode || 'day';
      if (mode === 'day') {
        return target.getDate() === (todo.repeat_day || base.getDate());
      } else {
        // X째주 Y요일
        const week = meta.monthWeek || 1;
        const wd   = meta.monthWeekday ?? 1;
        if (targetDow !== wd) return false;
        const dayOfMonth = target.getDate();
        const weekNum = Math.ceil(dayOfMonth / 7);
        if (week === 5) { // 마지막주
          const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
          return dayOfMonth > lastDay - 7;
        }
        return weekNum === week;
      }
    }
    case 'yearly': {
      const ym = meta.yearlyMonth || 1;
      const yd = meta.yearlyDay || 1;
      return (target.getMonth() + 1) === ym && target.getDate() === yd;
    }
    case 'custom': {
      const customUnit     = meta.customUnit     || 'day';
      const customInterval = meta.customInterval || 2;
      switch(customUnit) {
        case 'day':
          return diffDays % customInterval === 0;
        case 'week':
          return diffDays % (customInterval * 7) === 0;
        case 'month': {
          if (target.getDate() !== base.getDate()) return false;
          const monthDiff = (target.getFullYear() - base.getFullYear()) * 12 +
                            (target.getMonth() - base.getMonth());
          return monthDiff % customInterval === 0;
        }
        case 'year': {
          if (target.getMonth() !== base.getMonth()) return false;
          if (target.getDate()  !== base.getDate())  return false;
          const yearDiff = target.getFullYear() - base.getFullYear();
          return yearDiff % customInterval === 0;
        }
        default: return false;
      }
    }
    default:
      return false;
  }
}