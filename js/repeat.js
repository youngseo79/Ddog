// =============================================
// repeat.js — 반복 설정 모달 & 반복 계산
// =============================================

const LUNAR_REPEAT_LAST_YEAR = 2049; // 음력 반복 최종 연도 (데이터는 2050년까지지만 여유를 둠)
const BIRTHDAY_EMOJI = '🎂';

let repeatConfig = {
  type: 'none',
  weekdays: [],      // 매주: [0~6] 배열
  monthMode: 'day',  // 매월: 'day' | 'week'
  monthDay: 0,       // 매월 N일 (0 = 미설정)
  monthWeek: 1,      // 매월 X째주
  monthWeekday: 1,   // 매월 X째주 Y요일
  yearlyMonth: 1,    // 매년 M월
  yearlyDay: 0,      // 매년 M월 N일 (0 = 미설정)
  yearlyLunar: false,// 매년: 음력 기준 여부
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

  // 매년 - 음력 체크박스: 상단 날짜를 음력/양력으로 변환해 월·일 칸에 채움
  document.getElementById('repeat-yearly-lunar').addEventListener('change', e => {
    const baseDate = document.getElementById('input-date').value || getDefaultDate();
    const d = new Date(baseDate + 'T00:00:00');
    if (e.target.checked) {
      if (d.getFullYear() > LUNAR_REPEAT_LAST_YEAR) {
        showToast(`음력 반복은 ${LUNAR_REPEAT_LAST_YEAR}년까지만 가능합니다`);
        e.target.checked = false;
        return;
      }
      const lunar = (typeof getLunarInfo === 'function')
        ? getLunarInfo(d.getFullYear(), d.getMonth() + 1, d.getDate()) : null;
      if (!lunar) {
        showToast('해당 날짜의 음력 날짜가 없습니다');
        e.target.checked = false;
        return;
      }
      document.getElementById('repeat-yearly-month').value = lunar.month;
      document.getElementById('repeat-yearly-day').value   = lunar.day;
    } else {
      document.getElementById('repeat-yearly-month').value = d.getMonth() + 1;
      document.getElementById('repeat-yearly-day').value   = d.getDate();
    }
    updateYearlyLunarLabel(e.target.checked);
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
  // 매년: 이미 매년으로 설정된 경우는 저장값, 아니면 상단 입력 날짜(양력)로 기본 세팅
  const isYearlySet = repeatConfig.type === 'yearly' && repeatConfig.yearlyDay;
  document.getElementById('repeat-yearly-month').value = isYearlySet ? repeatConfig.yearlyMonth : (d.getMonth() + 1);
  document.getElementById('repeat-yearly-day').value   = isYearlySet ? repeatConfig.yearlyDay   : d.getDate();
  const lunarChk = document.getElementById('repeat-yearly-lunar');
  lunarChk.checked = isYearlySet ? !!repeatConfig.yearlyLunar : false;
  updateYearlyLunarLabel(lunarChk.checked);
  // 생일: 제목이 🎂로 시작하면 체크된 상태로 표시
  document.getElementById('repeat-yearly-birthday').checked =
    (document.getElementById('input-title').value || '').trim().startsWith(BIRTHDAY_EMOJI);
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
    const isLunar = document.getElementById('repeat-yearly-lunar').checked;
    const maxDay  = isLunar ? 30 : 31;
    repeatConfig.yearlyMonth = parseInt(document.getElementById('repeat-yearly-month').value) || 1;
    const val = parseInt(document.getElementById('repeat-yearly-day').value);
    if (!val || val < 1 || val > maxDay) { showToast(`날짜를 입력해주세요 (1~${maxDay})`); return; }
    repeatConfig.yearlyDay   = val;
    repeatConfig.yearlyLunar = isLunar;

    // 생일: 체크 시 제목 앞에 🎂 추가, 해제 시 제거
    const titleEl = document.getElementById('input-title');
    const title   = (titleEl.value || '').trim();
    const hasCake = title.startsWith(BIRTHDAY_EMOJI);
    if (document.getElementById('repeat-yearly-birthday').checked) {
      if (!hasCake) titleEl.value = `${BIRTHDAY_EMOJI} ${title}`;
    } else if (hasCake) {
      titleEl.value = title.slice(BIRTHDAY_EMOJI.length).trimStart();
    }
  } else {
    repeatConfig.yearlyLunar = false;
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
  repeatConfig = { type: 'none', weekdays: [], monthMode: 'day', monthDay: 0, monthWeek: 1, monthWeekday: 1, yearlyMonth: 1, yearlyDay: 0, yearlyLunar: false, customUnit: 'day', customInterval: 2, endDate: null };
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
    case 'yearly':  return `매년 ${repeatConfig.yearlyLunar ? '음력 ' : ''}${repeatConfig.yearlyMonth}/${repeatConfig.yearlyDay}`;
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
      yearlyLunar:   repeatConfig.type === 'yearly' && !!repeatConfig.yearlyLunar,
      customUnit:    repeatConfig.customUnit,
      customInterval:repeatConfig.customInterval,
    }),
  };
}

// DB에서 불러온 데이터로 repeatConfig 복원
function dataToRepeatConfig(todo) {
  if (!todo.repeat_type || todo.repeat_type === 'none') {
    return { type: 'none', weekdays: [], monthMode: 'day', monthDay: 1, monthWeek: 1, monthWeekday: 1, yearlyMonth: 1, yearlyDay: 1, yearlyLunar: false, customDays: [], endDate: null };
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
    yearlyLunar: !!meta.yearlyLunar,
    customUnit:  meta.customUnit     != null ? meta.customUnit     : 'day',
    customInterval: meta.customInterval != null ? meta.customInterval : 2,
    endDate:     todo.repeat_end_date || null,
  };
}

// 매년 라벨: 음력 체크 시 '매년(음력)'
function updateYearlyLunarLabel(isLunar) {
  const el = document.getElementById('repeat-yearly-label');
  if (el) el.textContent = isLunar ? '매년(음력)' : '매년';
}

// 음력 매년 반복 매칭
// - 윤달은 건너뜀(평달 기준), 음력 30일이 없는 해(작은달)는 그 달 29일에 표시
// - 종료일이 없어도 LUNAR_REPEAT_LAST_YEAR년까지만 반복
function isLunarYearlyMatch(target, ym, yd) {
  if (target.getFullYear() > LUNAR_REPEAT_LAST_YEAR) return false;
  if (typeof getLunarInfo !== 'function') return false;
  const l = getLunarInfo(target.getFullYear(), target.getMonth() + 1, target.getDate());
  if (!l || l.leap || l.month !== ym) return false;
  if (l.day === yd) return true;
  if (yd === 30 && l.day === 29) {
    const next = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
    const nl = getLunarInfo(next.getFullYear(), next.getMonth() + 1, next.getDate());
    return !!nl && nl.day === 1; // 이 달이 29일로 끝나는 작은달
  }
  return false;
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
        const firstDow = new Date(target.getFullYear(), target.getMonth(), 1).getDay();
        const weekNum = Math.ceil((dayOfMonth + firstDow) / 7);
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
      if (meta.yearlyLunar) return isLunarYearlyMatch(target, ym, yd);
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