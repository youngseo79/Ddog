// =============================================
// holiday.js — 공휴일 수동 등록 (Supabase: ddog_holidays)
// - 계정당 1행: { user_id, year, items:[{date,name,days}] }
// - 일반/업무 모드 공유 (TABLE_NAME과 무관한 별도 테이블)
// - 올해 목록이 비어 있으면(미등록) 1월 1일부터 앱을 열 때마다 등록 모달 표시
// - 해가 바뀌면 지난해 목록은 무시 → 새로 등록하면 덮어써짐
// - 달력/주간 카드/상단 날짜 라벨에 빨간색만 적용 (이름은 표시하지 않음)
// =============================================

const HOLIDAY_TABLE     = 'ddog_holidays';
const HOLIDAY_CACHE_KEY = 'ddog_holidays_cache';
const HOLIDAY_MAX_DAYS  = 15;

let _holidayYear  = null;          // 현재 적용 중인 연도
let _holidayItems = [];            // [{date:'YYYY-MM-DD', name, days}]
let _holidaySet   = new Set();     // 펼친 날짜 집합 (빨간 날)
let _holidayInited = false;
let _holidayCheckedYear = null;    // 자동 팝업 확인을 마친 연도 (앱 복귀 시 해 바뀜 감지용)
let _holidayWaitTimer = null;

// ── 빨간 날 스타일 (토요일 파란색보다 우선, 오늘/선택 표시는 기존 그대로 유지) ──
(function injectHolidayStyle() {
  const st = document.createElement('style');
  st.id = 'holiday-style';
  st.textContent = `
    .cal-day.holiday:not(.today):not(.selected) { color: var(--danger); }
    .week-day-card.holiday .wdc-name,
    .week-day-card.holiday .wdc-num { color: var(--danger); }
  `;
  document.head.appendChild(st);
})();

// ── 날짜 유틸 ──
function _hdCurYear() { return new Date().getFullYear(); }

function _hdValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
}

function _hdClampDays(v) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 1) return 1;
  return Math.min(n, HOLIDAY_MAX_DAYS);
}

// 목록 → 날짜 집합 (시작일 포함 days일)
function _hdBuildSet(items) {
  const set = new Set();
  (items || []).forEach(it => {
    if (!it || !_hdValidDate(it.date)) return;
    const d = new Date(it.date + 'T00:00:00');
    const n = _hdClampDays(it.days);
    for (let i = 0; i < n; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      set.add(toLocalDateStr(x));
    }
  });
  return set;
}

// ── 외부에서 쓰는 판정 함수 (calendar.js / weekly.js) ──
function isHolidayDate(dateStr) {
  return _holidaySet.has(dateStr);
}

// 올해 공휴일이 1개 이상 등록되어 있는지
function _hdIsRegistered() {
  return _holidayYear === _hdCurYear() && _holidayItems.length > 0;
}

// ── 상태 적용 (올해 것만 사용, 지난해 것은 무시) ──
function _hdApplyState(year, items) {
  if (year === _hdCurYear() && Array.isArray(items)) {
    _holidayYear  = year;
    _holidayItems = items.filter(it => it && _hdValidDate(it.date));
  } else {
    _holidayYear  = _hdCurYear();
    _holidayItems = [];
  }
  _holidaySet = _hdBuildSet(_holidayItems);
}

// ── 기기 캐시 (오프라인 표시용) ──
function _hdLoadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(HOLIDAY_CACHE_KEY) || 'null');
    if (!c || c.uid !== getCurrentUserId()) return null;
    return c;
  } catch (e) { return null; }
}

function _hdSaveCache(year, items) {
  try {
    localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify({ uid: getCurrentUserId(), year, items }));
  } catch (e) {}
}

// ── 화면 갱신 (다시 그리지 않고 클래스만 토글) ──
function refreshHolidayViews() {
  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.classList.toggle('holiday', _holidaySet.has(el.dataset.date));
  });
  document.querySelectorAll('.week-day-card[data-date]').forEach(el => {
    el.classList.toggle('holiday', _holidaySet.has(el.dataset.date));
  });
  if (typeof updateSelectedDateLabel === 'function' && AppState && AppState.selectedDate) {
    try { updateSelectedDateLabel(); } catch (e) {}
  }
}

// ── 서버 ──
async function _hdFetchServer() {
  const uid = getCurrentUserId();
  if (!uid) throw new Error('no user');
  const rows = await sbFetch(`${HOLIDAY_TABLE}?select=year,items&user_id=eq.${uid}&limit=1`,
    { signal: _timeoutSignal(5000) });
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row ? { year: row.year, items: Array.isArray(row.items) ? row.items : [] } : { year: null, items: [] };
}

async function _hdSaveServer(year, items) {
  const uid = getCurrentUserId();
  if (!uid) throw new Error('로그인 정보가 없습니다');
  const res = await fetch(`${DB.url}/rest/v1/${HOLIDAY_TABLE}?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...DB.headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: uid, year, items, updated_at: new Date().toISOString() }),
    signal: _timeoutSignal(8000),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── 초기화 (app.js bootApp 끝에서 호출) ──
async function initHoliday() {
  if (!_holidayInited) {
    _holidayInited = true;
    const menu = document.getElementById('menu-holiday');
    if (menu) menu.addEventListener('click', () => {
      if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
      setTimeout(openHolidayModal, 350);
    });
    // 앱을 오래 켜둔 채 해가 바뀐 경우: 복귀 시 다시 확인
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _holidayCheckedYear !== null &&
          _holidayCheckedYear !== _hdCurYear()) {
        _hdLoadAndCheck();
      }
    });
  }
  await _hdLoadAndCheck();
}

async function _hdLoadAndCheck() {
  // 1) 캐시로 먼저 표시
  const cache = _hdLoadCache();
  _hdApplyState(cache ? cache.year : null, cache ? cache.items : null);
  refreshHolidayViews();

  // 2) 서버 최신값
  let serverOk = false;
  if (AppState.isOnline && navigator.onLine) {
    try {
      const s = await _hdFetchServer();
      _hdApplyState(s.year, s.items);
      _hdSaveCache(_holidayYear, _holidayItems);
      refreshHolidayViews();
      serverOk = true;
    } catch (e) {
      console.warn('[holiday] 서버 조회 실패 → 기기 캐시 사용', e);
    }
  }

  _holidayCheckedYear = _hdCurYear();

  // 3) 올해 미등록이면 자동 팝업 (서버 확인이 된 경우만: 오프라인이면 저장도 못 하므로 다음 실행 때)
  if (serverOk && !_hdIsRegistered()) _hdShowWhenReady();
}

// 스플래시/시간 일정 팝업/할일 모달이 모두 닫힌 뒤에 띄움
function _hdShowWhenReady() {
  if (_holidayWaitTimer) return;
  const ready = () => {
    const splash = document.getElementById('splash-screen');
    if (splash && splash.style.display !== 'none') return false;
    if (document.getElementById('timed-todos-overlay')) return false;
    const modal = document.getElementById('modal-overlay');
    if (modal && !modal.classList.contains('hidden')) return false;
    return true;
  };
  _holidayWaitTimer = setInterval(() => {
    if (!ready()) return;
    clearInterval(_holidayWaitTimer);
    _holidayWaitTimer = null;
    if (!_hdIsRegistered()) openHolidayModal();
  }, 300);
}

// ── 날짜 버튼 (앱 디자인 달력 연동) ──
const _HD_DOW = ['일','월','화','수','목','금','토'];

// 버튼 표시: "9월 24일 (목)" (연도 없이), 값은 data-value에 YYYY-MM-DD로 보관
function _hdSetDateBtn(btn, v) {
  if (_hdValidDate(v)) {
    const d = new Date(v + 'T00:00:00');
    btn.dataset.value = v;
    btn.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${_HD_DOW[d.getDay()]})`;
    btn.style.color = 'var(--text-primary)';
  } else {
    btn.dataset.value = '';
    btn.textContent = '날짜 선택';
    btn.style.color = 'var(--text-muted)';
  }
}

// PC: pcPickDate (index-pc.html) / 모바일: openCustomDatePicker (storage.js)
// 값이 있으면 그 달부터 열고 강조, 없으면 이번 달부터 (강조 없음)
function _hdPickDate(cur, onSelect) {
  const init = _hdValidDate(cur) ? cur : null;
  const isPcLayout = document.body.classList.contains('pc-layout');
  if (isPcLayout && typeof pcPickDate === 'function') {
    pcPickDate(null, false, init || toLocalDateStr(new Date()), onSelect, { backdrop: true, noHighlight: !init });
  } else if (typeof openCustomDatePicker === 'function') {
    openCustomDatePicker(onSelect, init);
  }
}

// ── 모달 ──
function closeHolidayModal() {
  const ov = document.getElementById('holiday-overlay');
  if (ov) ov.remove();
}

function openHolidayModal() {
  if (document.getElementById('holiday-overlay')) return;
  const year  = _hdCurYear();
  const isPC  = document.body.classList.contains('pc-layout');
  const fs    = isPC ? '14px' : '16px';   // 모바일 16px: iOS 입력 시 화면 확대 방지

  const overlay = document.createElement('div');
  overlay.id = 'holiday-overlay';
  // z-index 550: 설정창(~202)보다 위, 앱 디자인 달력(PC 600 / 모바일 1000)보다 아래
  overlay.style.cssText = 'position:fixed;inset:0;z-index:550;background:rgba(0,0,0,0.5);display:flex;' +
    (isPC ? 'align-items:center;justify-content:center;' : 'align-items:flex-end;');

  const box = document.createElement('div');
  box.id = 'holiday-box';
  box.style.cssText = [
    isPC ? 'width:460px;max-width:90vw;max-height:80vh;' : 'width:100%;max-height:88vh;',
    'background:var(--bg-elevated);',
    isPC ? 'border-radius:20px;' : 'border-radius:20px 20px 0 0;',
    isPC ? 'padding:24px 24px 22px;' : 'padding:22px 16px calc(20px + env(safe-area-inset-bottom, 0px));',
    'box-shadow:0 8px 40px rgba(0,0,0,0.5);animation:slideUp 0.25s ease;',
    'font-family:var(--font-main);display:flex;flex-direction:column;box-sizing:border-box;',
  ].join('');

  const inputCss = `box-sizing:border-box;height:38px;padding:0 8px;border-radius:9px;border:1px solid var(--border-light);` +
    `background:var(--bg-surface);color:var(--text-primary);font-size:${fs};font-family:var(--font-ui);outline:none;min-width:0;`;
  const dateW = isPC ? '130px' : '112px';
  const daysW = '44px';
  const delW  = '30px';
  const gap   = '6px';

  box.innerHTML = `
    <style>
      #holiday-box .hd-in:focus { border-color: var(--accent) !important; }
      #holiday-box .hd-date { cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      #holiday-box input[type="number"]::-webkit-inner-spin-button,
      #holiday-box input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
      #holiday-box input[type="number"] { -moz-appearance:textfield; text-align:center; }
      #holiday-box .hd-del { width:${delW};height:38px;flex:0 0 ${delW};border:none;background:none;color:var(--text-muted);font-size:16px;cursor:pointer;border-radius:8px; }
      #holiday-box .hd-del:hover { color: var(--danger); }
    </style>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-size:17px;font-weight:700;color:var(--text-primary);">🎌 ${year}년 공휴일</div>
      <button id="holiday-close" style="font-size:18px;color:var(--text-muted);background:none;border:none;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;">✕</button>
    </div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.5;">
      일수는 시작일 포함 연속 일수예요. (비우면 1일)
    </div>
    <div style="display:flex;gap:${gap};padding:0 2px 6px;font-size:11.5px;color:var(--text-muted);">
      <span style="flex:0 0 ${dateW};">날짜</span>
      <span style="flex:1;min-width:0;">이름</span>
      <span style="flex:0 0 ${daysW};text-align:center;">일수</span>
      <span style="flex:0 0 ${delW};"></span>
    </div>
    <div id="holiday-rows" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:0;flex:1;padding:0 2px 2px;"></div>
    <button id="holiday-add" style="margin-top:12px;height:40px;border-radius:10px;border:1px dashed var(--border-light);background:none;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-main);">+ 추가</button>
    <div id="holiday-msg" style="min-height:18px;margin-top:8px;font-size:12.5px;color:var(--danger);text-align:center;"></div>
    <button id="holiday-save" style="margin-top:4px;height:44px;border-radius:12px;border:none;background:var(--accent);color:#1a1a2e;font-size:15px;font-weight:700;cursor:pointer;font-family:var(--font-main);">저장</button>
  `;

  const rowsEl = box.querySelector('#holiday-rows');
  const msgEl  = box.querySelector('#holiday-msg');

  function addRow(item, focus) {
    const row = document.createElement('div');
    row.className = 'hd-row';
    row.style.cssText = `display:flex;gap:${gap};align-items:center;`;
    row.innerHTML = `
      <button type="button" class="hd-in hd-date" style="${inputCss}flex:0 0 ${dateW};width:${dateW};padding:0 8px;"></button>
      <input type="text" class="hd-in hd-name" placeholder="예: 추석" maxlength="20" autocomplete="off" style="${inputCss}flex:1;width:0;">
      <input type="number" class="hd-in hd-days" placeholder="1" min="1" max="${HOLIDAY_MAX_DAYS}" inputmode="numeric" style="${inputCss}flex:0 0 ${daysW};width:${daysW};padding:0 2px;">
      <button type="button" class="hd-del" title="삭제">✕</button>
    `;
    const dateBtn = row.querySelector('.hd-date');
    _hdSetDateBtn(dateBtn, item && item.date ? item.date : '');
    dateBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      // 키보드가 올라와 있으면 내림 (달력 가림 방지)
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
      const cur = dateBtn.dataset.value || '';
      _hdPickDate(cur, picked => {
        if (!picked.startsWith(year + '-')) {
          msgEl.textContent = `${year}년 날짜만 선택할 수 있어요.`;
          return;
        }
        msgEl.textContent = '';
        dateBtn.style.borderColor = '';
        _hdSetDateBtn(dateBtn, picked);
      });
    });
    if (item) {
      row.querySelector('.hd-name').value = item.name || '';
      const n = _hdClampDays(item.days);
      row.querySelector('.hd-days').value = n > 1 ? n : '';
    }
    row.querySelector('.hd-del').addEventListener('click', () => {
      row.remove();
      if (!rowsEl.children.length) addRow(null, false);
    });
    rowsEl.appendChild(row);
    if (focus) {
      // 새 줄로 스크롤만 (모바일에서 키보드가 바로 올라오지 않도록 포커스는 주지 않음)
      rowsEl.scrollTop = rowsEl.scrollHeight;
    }
  }

  // 저장된 올해 목록 채우기 (없으면 빈 줄 1개)
  const saved = _hdIsRegistered() ? [..._holidayItems].sort((a, b) => a.date.localeCompare(b.date)) : [];
  if (saved.length) saved.forEach(it => addRow(it, false));
  else addRow(null, false);

  box.querySelector('#holiday-add').addEventListener('click', () => addRow(null, true));
  box.querySelector('#holiday-close').addEventListener('click', closeHolidayModal);

  const saveBtn = box.querySelector('#holiday-save');
  saveBtn.addEventListener('click', async () => {
    msgEl.textContent = '';
    const items = [];
    let bad = false;
    rowsEl.querySelectorAll('.hd-row').forEach(r => {
      const date = (r.querySelector('.hd-date').dataset.value || '').trim();
      const name = r.querySelector('.hd-name').value.trim();
      const daysRaw = r.querySelector('.hd-days').value.trim();
      r.querySelector('.hd-date').style.borderColor = '';
      if (!date && !name && !daysRaw) return;           // 완전히 빈 줄은 무시
      if (!_hdValidDate(date) || !date.startsWith(year + '-')) {
        r.querySelector('.hd-date').style.borderColor = 'var(--danger)';
        bad = true;
        return;
      }
      items.push({ date, name, days: _hdClampDays(daysRaw) });
    });
    if (bad) { msgEl.textContent = `${year}년 날짜를 입력해 주세요.`; return; }
    if (!AppState.isOnline || !navigator.onLine) { msgEl.textContent = '오프라인 상태에서는 저장할 수 없어요.'; return; }

    items.sort((a, b) => a.date.localeCompare(b.date));
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중…';
    try {
      await _hdSaveServer(year, items);
      _hdApplyState(year, items);
      _hdSaveCache(year, items);
      refreshHolidayViews();
      closeHolidayModal();
    } catch (e) {
      console.warn('[holiday] 저장 실패', e);
      msgEl.textContent = '저장에 실패했어요. 잠시 후 다시 시도해 주세요.';
      saveBtn.disabled = false;
      saveBtn.textContent = '저장';
    }
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // 바깥(어두운 배경) 클릭 시 닫기 (통계 모달 등과 동일)
  // ※ 디자인 달력은 overlay 밖(body)에 따로 뜨므로, 달력 조작 클릭으로는 닫히지 않음
  overlay.addEventListener('click', e => { if (e.target === overlay) closeHolidayModal(); });
}
