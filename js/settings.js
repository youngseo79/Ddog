// =============================================
// settings.js — 설정 패널 & 반복함
// =============================================

const COLOR_THEMES = ['sage', 'sky', 'rose', 'lavender', 'navy'];

const THEMES = [
  { id: 'light',    label: '라이트 모드', bg: '#ebeee7', dot: '#3a9e6a' },
  { id: 'dark',     label: '다크 모드',   bg: '#1e2028', dot: '#7ecfa0' },
  { id: 'sage',     label: '연한 녹색',   bg: '#e4ede4', dot: '#3a8a5a' },
  { id: 'sky',      label: '연한 하늘색', bg: '#e2ecf6', dot: '#2868c0' },
  { id: 'rose',     label: '연한 붉은색', bg: '#f4e4e4', dot: '#c03848' },
  { id: 'lavender', label: '연한 자주색', bg: '#eae4f4', dot: '#7040c0' },
  { id: 'navy',     label: '진한 청색',   bg: '#1a2448', dot: '#4878e8' },
];

function applyTheme(themeId) {
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t));
  document.body.classList.remove('theme-active');

  if (themeId === 'light') {
    document.body.classList.add('light-mode');
    localStorage.setItem('lightmode', '1');
  } else if (themeId === 'dark') {
    document.body.classList.remove('light-mode');
    localStorage.setItem('lightmode', '0');
  } else if (COLOR_THEMES.includes(themeId)) {
    document.body.classList.remove('light-mode');
    document.body.classList.add('theme-' + themeId);
    document.body.classList.add('theme-active');
    localStorage.setItem('lightmode', '0');
  }

  localStorage.setItem('app-theme', themeId);
  if (typeof applyLogoMode === 'function') applyLogoMode();
}

function initTheme() {
  let saved = localStorage.getItem('app-theme');
  if (!saved) {
    saved = localStorage.getItem('lightmode') === '1' ? 'light' : 'dark';
  }
  applyTheme(saved);
}

function openThemePanel() {
  const existing = document.getElementById('theme-sheet');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'theme-sheet-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;';

  const sheet = document.createElement('div');
  sheet.id = 'theme-sheet';
  sheet.style.cssText = [
    'position:fixed;bottom:0;left:0;right:0;z-index:1201;',
    'background:var(--bg-elevated);border-radius:20px 20px 0 0;',
    'padding:20px 20px 40px;box-shadow:0 -4px 32px rgba(0,0,0,0.4);',
    'animation:slideUp 0.25s ease;max-height:80vh;overflow-y:auto;'
  ].join('');

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:16px;text-align:center;';
  title.textContent = '테마 선택';
  sheet.appendChild(title);

  const saved = localStorage.getItem('app-theme') || (localStorage.getItem('lightmode') === '1' ? 'light' : 'dark');

  THEMES.forEach(t => {
    const btn = document.createElement('button');
    const isActive = t.id === saved;
    btn.style.cssText = [
      'display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px;margin-bottom:8px;',
      'border-radius:12px;border:2px solid ' + (isActive ? 'var(--accent)' : 'transparent') + ';',
      'background:var(--bg-surface);cursor:pointer;font-family:var(--font-main);'
    ].join('');

    const preview = document.createElement('div');
    preview.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
    const bgDot = document.createElement('div');
    bgDot.style.cssText = 'width:18px;height:18px;border-radius:50%;background:' + t.bg + ';border:1px solid rgba(0,0,0,0.15);';
    const accentDot = document.createElement('div');
    accentDot.style.cssText = 'width:18px;height:18px;border-radius:50%;background:' + t.dot + ';';
    preview.appendChild(bgDot);
    preview.appendChild(accentDot);

    const label = document.createElement('span');
    label.style.cssText = 'font-size:15px;color:var(--text-primary);flex:1;text-align:left;';
    label.textContent = t.label;

    btn.appendChild(preview);
    btn.appendChild(label);

    if (isActive) {
      const check = document.createElement('span');
      check.style.cssText = 'color:var(--accent);font-size:18px;font-weight:700;';
      check.textContent = '✓';
      btn.appendChild(check);
    }

    btn.addEventListener('click', () => {
      applyTheme(t.id);
      overlay.remove();
      sheet.remove();
      closeSettingsPanel();
    });
    sheet.appendChild(btn);
  });

  overlay.addEventListener('click', () => { overlay.remove(); sheet.remove(); });
  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
}


const STAT_LEVELS = [
  { min: 0,      max: 99,     level: 1, label: '새싹',    icon: '🌱' },
  { min: 100,    max: 499,    level: 2, label: '성장 중',  icon: '🌿' },
  { min: 500,    max: 1999,   level: 3, label: '집중력',   icon: '📋' },
  { min: 2000,   max: 4999,   level: 4, label: '실행가',   icon: '⚡' },
  { min: 5000,   max: 9999,   level: 5, label: '전문가',   icon: '🎯' },
  { min: 10000,  max: 29999,  level: 6, label: '마스터',   icon: '🏆' },
  { min: 30000,  max: Infinity, level: 7, label: '전설',   icon: '👑' },
];

function getLevel(count) {
  return STAT_LEVELS.find(l => count >= l.min && count <= l.max) || STAT_LEVELS[0];
}

async function openStatsModal() {
  // IDB에서 전체 데이터 로드
  let all = [];
  try { all = await idbGetAll(); } catch(e) {}

  // 완료된 할일 수 (가상 row 제외)
  const doneCount = all.filter(t => t.is_done && !t._virtual).length;

  // 시작일: created_at 가장 오래된 row
  const dates = all.map(t => t.created_at).filter(Boolean).sort();
  let daysSince = 0;
  let startDateStr = '';
  if (dates.length > 0) {
    const start = new Date(dates[0]);
    const today = new Date();
    daysSince = Math.max(1, Math.floor((today - start) / 86400000) + 1);
    startDateStr = `${start.getFullYear()}년 ${start.getMonth()+1}월 ${start.getDate()}일`;
  }

  const lv = getLevel(doneCount);
  const nextLv = STAT_LEVELS.find(l => l.level === lv.level + 1);
  const progress = nextLv
    ? Math.min(100, Math.round((doneCount - lv.min) / (nextLv.min - lv.min) * 100))
    : 100;

  // 모달 생성
  const overlay = document.createElement('div');
  overlay.id = 'stats-overlay';
  const isPC = document.body.classList.contains('pc-layout');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.5);display:flex;' +
    (isPC ? 'align-items:center;justify-content:center;' : 'align-items:flex-end;');

  const box = document.createElement('div');
  box.id = 'stats-box';
  box.style.cssText = [
    isPC ? 'width:420px;max-width:90vw;' : 'width:100%;',
    'background:var(--bg-elevated);',
    isPC ? 'border-radius:20px;' : 'border-radius:20px 20px 0 0;',
    'padding:28px 24px 36px;',
    'box-shadow:0 8px 40px rgba(0,0,0,0.5);',
    'animation:slideUp 0.25s ease;',
    'font-family:var(--font-main);',
  ].join('');

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <div style="font-size:17px;font-weight:700;color:var(--text-primary);">📊 나의 통계</div>
      <button id="stats-close" style="font-size:18px;color:var(--text-muted);background:none;border:none;cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:50%;">✕</button>
    </div>

    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:56px;margin-bottom:6px;">${lv.icon}</div>
      <div style="font-size:22px;font-weight:700;color:var(--accent);margin-bottom:4px;">Lv.${lv.level} ${lv.label}</div>
      ${startDateStr ? `<div style="font-size:13px;color:var(--text-muted);">${startDateStr}부터 시작</div>` : ''}
    </div>

    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:var(--bg-surface);border-radius:14px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--accent);">${daysSince.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">사용 일수</div>
      </div>
      <div style="flex:1;background:var(--bg-surface);border-radius:14px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--accent);">${doneCount.toLocaleString()}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">완료한 할일</div>
      </div>
    </div>

    ${nextLv ? `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="font-size:13px;color:var(--text-secondary);">다음 레벨까지</span>
        <span style="font-size:13px;color:var(--text-secondary);">${(nextLv.min - doneCount).toLocaleString()}개 남음</span>
      </div>
      <div style="background:var(--bg-surface);border-radius:8px;height:10px;overflow:hidden;">
        <div style="background:var(--accent);height:100%;width:${progress}%;border-radius:8px;transition:width 0.6s ease;"></div>
      </div>
    </div>
    ` : `
    <div style="text-align:center;padding:12px;background:var(--bg-surface);border-radius:14px;">
      <span style="font-size:14px;color:var(--accent);font-weight:600;">✨ 최고 레벨 달성!</span>
    </div>
    `}
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  box.querySelector('#stats-close').addEventListener('click', () => overlay.remove());
}

function initSettings() {
  document.getElementById('nav-settings').addEventListener('click', openSettingsPanel);
  document.getElementById('settings-close').addEventListener('click', closeSettingsPanel);
  document.getElementById('settings-overlay').addEventListener('click', closeSettingsPanel);
  document.getElementById('menu-repeats').addEventListener('click', openRepeatsPanel);
  const menuTheme = document.getElementById('menu-theme');
  if (menuTheme) menuTheme.addEventListener('click', openThemePanel);
  const menuStats = document.getElementById('menu-stats');
  if (menuStats) menuStats.addEventListener('click', () => { closeSettingsPanel(); setTimeout(openStatsModal, 350); });
  document.getElementById('repeats-back').addEventListener('click', closeRepeatsPanel);
  document.getElementById('menu-logout').addEventListener('click', openLogoutConfirm);
}

function openLogoutConfirm() {
  document.getElementById('logout-modal').style.display = 'flex';
}

function closeLogoutConfirm() {
  document.getElementById('logout-modal').style.display = 'none';
}

async function doLogout() {
  closeLogoutConfirm();
  try { await getSupabaseClient().auth.signOut({ scope: 'local' }); } catch(e) {}
  clearSession();
  location.reload();
}

function openSettingsPanel() {
  document.getElementById('settings-overlay').classList.remove('hidden');
  document.getElementById('settings-panel').classList.remove('hidden');
  requestAnimationFrame(() => {
    document.getElementById('settings-panel').classList.add('open');
  });
}

function closeSettingsPanelOnly() {
  const panel = document.getElementById('settings-panel');
  panel.classList.remove('open');
  setTimeout(() => {
    panel.classList.add('hidden');
    document.getElementById('settings-overlay').classList.add('hidden');
    const repeatsPanel = document.getElementById('repeats-panel');
    repeatsPanel.classList.remove('open');
    repeatsPanel.classList.add('hidden');
  }, 300);
}

function closeSettingsPanel() {
  closeRepeatsPanel();
  closeSettingsPanelOnly();
}

function openRepeatsPanel() {
  loadRepeats();
  document.getElementById('repeats-panel').classList.remove('hidden');
  requestAnimationFrame(() => {
    document.getElementById('repeats-panel').classList.add('open');
  });
}

function closeRepeatsPanel() {
  const panel = document.getElementById('repeats-panel');
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('hidden'), 300);
}

async function loadRepeats() {
  const list = document.getElementById('repeats-list');
  list.innerHTML = '<div class="spinner"></div>';
  try {
    // IDB에서 읽기
    const all = await idbGetAll();
    const rows = all.filter(t =>
      t.repeat_type && t.repeat_type !== 'none' &&
      !t.repeat_master_id &&
      !t.repeat_exception
    ).sort((a, b) => (b.created_at || '') > (a.created_at || '') ? 1 : -1);

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔁</div>반복 일정이 없어요</div>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(todo => list.appendChild(makeRepeatItem(todo)));
  } catch(e) {
    list.innerHTML = '<div class="empty-state">불러오기 실패</div>';
  }
}

function makeRepeatItem(todo) {
  const el = document.createElement('div');
  el.className = 'repeat-list-item';

  const info = document.createElement('div');
  info.className = 'repeat-item-info';

  const title = document.createElement('div');
  title.className = 'repeat-item-title';
  title.textContent = todo.title;

  const sub = document.createElement('div');
  sub.className = 'repeat-item-sub';
  sub.textContent = getRepeatDescFromTodo(todo);

  info.appendChild(title);
  info.appendChild(sub);

  const delBtn = document.createElement('button');
  delBtn.className = 'repeat-item-del';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', () => showRepeatDeleteOptions(todo, el));

  el.appendChild(info);
  el.appendChild(delBtn);
  return el;
}

function getRepeatDescFromTodo(todo) {
  let meta = {};
  try { meta = JSON.parse(todo.repeat_meta || '{}'); } catch(e) {}
  const days = ['일','월','화','수','목','금','토'];
  switch(todo.repeat_type) {
    case 'daily': return '매일';
    case 'weekly': return '매주 ' + (meta.weekdays || []).map(d => days[d]).join(',');
    case 'monthly':
      if (meta.monthMode === 'week') {
        const weeks = ['첫째','둘째','셋째','넷째','마지막'];
        return `매월 ${weeks[(meta.monthWeek||1)-1]}주 ${days[meta.monthWeekday??1]}`;
      }
      return `매월 ${todo.repeat_day||1}일`;
    case 'yearly': return `매년 ${meta.yearlyMonth||1}월 ${meta.yearlyDay||1}일`;
    case 'custom': {
      const unitLabels = { day: '일', week: '주', month: '개월', year: '년' };
      const interval = meta.customInterval || 2;
      const unit = unitLabels[meta.customUnit] || '일';
      return `매 ${interval}${unit}마다`;
    }
    default: return '';
  }
}

function showRepeatDeleteOptions(todo, el) {
  el.querySelectorAll('.repeat-del-options').forEach(e => e.remove());

  const opts = document.createElement('div');
  opts.className = 'repeat-del-options';

  const choices = [
    {
      label: '오늘 이후 삭제',
      action: async () => {
        await deleteRepeatFromDate(todo.id, todayStr());
        showToast('오늘 이후 반복을 삭제했어요');
      }
    },
    {
      label: '전체 반복 삭제',
      action: async () => {
        await deleteRepeatAll(todo.id);
        showToast('반복 일정을 삭제했어요');
      }
    },
  ];

  choices.forEach(({ label, action }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    if (label.includes('전체')) btn.classList.add('danger');
    btn.addEventListener('click', async () => {
      await action();
      loadRepeats();
      refreshCurrentTab();
    });
    opts.appendChild(btn);
  });

  const cancel = document.createElement('button');
  cancel.textContent = '취소';
  cancel.className = 'cancel';
  cancel.addEventListener('click', () => opts.remove());
  opts.appendChild(cancel);

  el.appendChild(opts);
  // 최하단 아이템의 경우 삭제 옵션이 잘리지 않도록 스크롤
  setTimeout(() => opts.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}


