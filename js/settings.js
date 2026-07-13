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


const RANK_ICONS = {
  이병: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><rect x="10" y="24" width="36" height="8" rx="3" fill="#f0c040"/></svg>`,
  일병: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><rect x="10" y="18" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="29" width="36" height="7" rx="2.5" fill="#f0c040"/></svg>`,
  상병: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><rect x="10" y="14" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="25" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="36" width="36" height="7" rx="2.5" fill="#f0c040"/></svg>`,
  병장: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><rect x="10" y="10" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="20" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="30" width="36" height="7" rx="2.5" fill="#f0c040"/><rect x="10" y="40" width="36" height="7" rx="2.5" fill="#f0c040"/></svg>`,
  하사: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polyline points="6,16 28,26 50,16" fill="none" stroke="#f0c040" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><rect x="10" y="30" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="38" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="46" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="54" width="36" height="5" rx="2" fill="#f0c040"/></svg>`,
  중사: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polyline points="6,10 28,19 50,10" fill="none" stroke="#f0c040" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,20 28,29 50,20" fill="none" stroke="#f0c040" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/><rect x="10" y="32" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="40" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="48" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="56" width="36" height="5" rx="2" fill="#f0c040"/></svg>`,
  상사: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polyline points="6,6 28,14 50,6" fill="none" stroke="#f0c040" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,15 28,23 50,15" fill="none" stroke="#f0c040" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,24 28,32 50,24" fill="none" stroke="#f0c040" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><rect x="10" y="35" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="43" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="51" width="36" height="5" rx="2" fill="#f0c040"/><rect x="10" y="59" width="36" height="5" rx="2" fill="#f0c040"/></svg>`,
  원사: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="28,2 30.5,9 38,9 32,13 34.5,20 28,16 21.5,20 24,13 18,9 25.5,9" fill="#f0c040"/><polyline points="6,24 28,31 50,24" fill="none" stroke="#f0c040" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,31 28,38 50,31" fill="none" stroke="#f0c040" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="6,38 28,45 50,38" fill="none" stroke="#f0c040" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><rect x="10" y="46" width="36" height="4" rx="1.5" fill="#f0c040"/><rect x="10" y="52" width="36" height="4" rx="1.5" fill="#f0c040"/><rect x="10" y="58" width="36" height="4" rx="1.5" fill="#f0c040"/><rect x="10" y="64" width="36" height="4" rx="1.5" fill="#f0c040"/></svg>`,
  소위: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="28,4 40,28 28,52 16,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/></svg>`,
  중위: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="17,4 27,28 17,52 7,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/><polygon points="39,4 49,28 39,52 29,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/></svg>`,
  대위: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="10,4 19,28 10,52 1,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/><polygon points="28,4 37,28 28,52 19,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/><polygon points="46,4 55,28 46,52 37,28" fill="#f0c040" stroke="#b8960a" stroke-width="0.8"/></svg>`,
  소령: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><g transform="translate(28,28)"><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-16" rx="3" ry="7" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-7 5,0 0,7 -5,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.6"/></g></svg>`,
  중령: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><g transform="translate(16,28)"><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-6 4,0 0,6 -4,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></g><g transform="translate(40,28)"><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-14" rx="2.5" ry="6" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-6 4,0 0,6 -4,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></g></svg>`,
  대령: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><g transform="translate(10,28)"><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-6 4,0 0,6 -4,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></g><g transform="translate(28,28)"><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-6 4,0 0,6 -4,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></g><g transform="translate(46,28)"><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(0)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(40)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(80)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(120)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(160)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(200)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(240)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(280)"/><ellipse cx="0" cy="-13" rx="2.2" ry="5.5" fill="#7fc050" transform="rotate(320)"/><polygon points="0,-6 4,0 0,6 -4,0" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></g></svg>`,
  준장: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="28,8 33.5,22 48,22 37,30 41,44 28,36 15,44 19,30 8,22 22.5,22" fill="#f0c040" stroke="#b8960a" stroke-width="0.5"/></svg>`,
  소장: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="14,8 18,19 30,19 21,26 24,37 14,30 4,37 7,26 -2,19 10,19" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="42,8 46,19 58,19 49,26 52,37 42,30 32,37 35,26 26,19 38,19" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/></svg>`,
  중장: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="8,10 11.5,20 22,20 14,26 17,36 8,30 -1,36 2,26 -6,20 4.5,20" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="28,10 31.5,20 42,20 34,26 37,36 28,30 19,36 22,26 14,20 24.5,20" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="48,10 51.5,20 62,20 54,26 57,36 48,30 39,36 42,26 34,20 44.5,20" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/></svg>`,
  대장: `<svg viewBox="0 0 56 56" width="56" height="56"><rect width="56" height="56" rx="8" fill="#15326b"/><polygon points="10,6 13,14 21,14 15,19 17,27 10,22 3,27 5,19 -1,14 7,14" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="28,6 31,14 39,14 33,19 35,27 28,22 21,27 23,19 17,14 25,14" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="10,30 13,38 21,38 15,43 17,51 10,46 3,51 5,43 -1,38 7,38" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/><polygon points="28,30 31,38 39,38 33,43 35,51 28,46 21,51 23,43 17,38 25,38" fill="#f0c040" stroke="#b8960a" stroke-width="0.4"/></svg>`,
};

const STAT_LEVELS = [
  { min: 0,      max: 49,       level: 1,  label: '이병', icon: RANK_ICONS.이병 },
  { min: 50,     max: 149,      level: 2,  label: '일병', icon: RANK_ICONS.일병 },
  { min: 150,    max: 299,      level: 3,  label: '상병', icon: RANK_ICONS.상병 },
  { min: 300,    max: 499,      level: 4,  label: '병장', icon: RANK_ICONS.병장 },
  { min: 500,    max: 999,      level: 5,  label: '하사', icon: RANK_ICONS.하사 },
  { min: 1000,   max: 1999,     level: 6,  label: '중사', icon: RANK_ICONS.중사 },
  { min: 2000,   max: 3499,     level: 7,  label: '상사', icon: RANK_ICONS.상사 },
  { min: 3500,   max: 4999,     level: 8,  label: '원사', icon: RANK_ICONS.원사 },
  { min: 5000,   max: 7499,     level: 9,  label: '소위', icon: RANK_ICONS.소위 },
  { min: 7500,   max: 9999,     level: 10, label: '중위', icon: RANK_ICONS.중위 },
  { min: 10000,  max: 12999,    level: 11, label: '대위', icon: RANK_ICONS.대위 },
  { min: 13000,  max: 16999,    level: 12, label: '소령', icon: RANK_ICONS.소령 },
  { min: 17000,  max: 20999,    level: 13, label: '중령', icon: RANK_ICONS.중령 },
  { min: 21000,  max: 24999,    level: 14, label: '대령', icon: RANK_ICONS.대령 },
  { min: 25000,  max: 26999,    level: 15, label: '준장', icon: RANK_ICONS.준장 },
  { min: 27000,  max: 28499,    level: 16, label: '소장', icon: RANK_ICONS.소장 },
  { min: 28500,  max: 29999,    level: 17, label: '중장', icon: RANK_ICONS.중장 },
  { min: 30000,  max: Infinity, level: 18, label: '대장', icon: RANK_ICONS.대장 },
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
      <div style="width:56px;height:56px;margin:0 auto 6px;">${lv.icon}</div>
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

// ── 습관 트래커 (PC 전용 중앙 팝업) ──
// 통계 모달과 동일하게 history는 건드리지 않음.
// 독립 파일 js/habits.html을 iframe으로 로드 → 코드 편입 없이 그대로 표시.
// 뒤로가기 처리는 app.js의 hasOpenPopup/closeTopPopup이 담당(모달만 닫힘).
function openHabitsModal() {
  if (document.getElementById('habits-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'habits-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.id = 'habits-modal-box';
  box.style.cssText = [
    'width:440px;max-width:92vw;height:86vh;max-height:880px;',
    'background:var(--bg-elevated);border-radius:20px;overflow:hidden;',
    'box-shadow:0 8px 40px rgba(0,0,0,0.5);animation:slideUp 0.25s ease;'
  ].join('');

  const frame = document.createElement('iframe');
  frame.id = 'habits-iframe';
  frame.src = 'js/habits.html';
  frame.style.cssText = 'width:100%;height:100%;border:none;display:block;background:transparent;';

  box.appendChild(frame);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // 바깥 클릭 시 닫기 (통계 모달과 동일)
  overlay.addEventListener('click', e => { if (e.target === overlay) closeHabitsModal(); });
}

function closeHabitsModal() {
  const overlay = document.getElementById('habits-modal-overlay');
  if (overlay) overlay.remove();
}

// ── 디데이 (PC 전용 중앙 팝업) ──
// 습관 트래커와 동일 패턴. 독립 파일 js/Dday.html을 iframe으로 로드.
function openDdayModal() {
  if (document.getElementById('dday-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'dday-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.id = 'dday-modal-box';
  box.style.cssText = [
    'width:440px;max-width:92vw;height:86vh;max-height:880px;',
    'background:var(--bg-elevated);border-radius:20px;overflow:hidden;',
    'box-shadow:0 8px 40px rgba(0,0,0,0.5);animation:slideUp 0.25s ease;'
  ].join('');

  const frame = document.createElement('iframe');
  frame.id = 'dday-iframe';
  frame.src = 'js/Dday.html';
  frame.style.cssText = 'width:100%;height:100%;border:none;display:block;background:transparent;';

  box.appendChild(frame);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeDdayModal(); });
}

function closeDdayModal() {
  const overlay = document.getElementById('dday-modal-overlay');
  if (overlay) overlay.remove();
}

// ── 버킷리스트 (PC 전용 중앙 팝업) ──
// 습관 트래커/디데이와 동일 패턴. 독립 파일 js/bucket.html을 iframe으로 로드.
function openBucketModal() {
  if (document.getElementById('bucket-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'bucket-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.id = 'bucket-modal-box';
  box.style.cssText = [
    'width:440px;max-width:92vw;height:86vh;max-height:880px;',
    'background:var(--bg-elevated);border-radius:20px;overflow:hidden;',
    'box-shadow:0 8px 40px rgba(0,0,0,0.5);animation:slideUp 0.25s ease;'
  ].join('');

  const frame = document.createElement('iframe');
  frame.id = 'bucket-iframe';
  frame.src = 'js/bucket.html';
  frame.style.cssText = 'width:100%;height:100%;border:none;display:block;background:transparent;';

  box.appendChild(frame);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeBucketModal(); });
}

function closeBucketModal() {
  const overlay = document.getElementById('bucket-modal-overlay');
  if (overlay) overlay.remove();
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
  const menuHabits = document.getElementById('menu-habits');
  if (menuHabits) menuHabits.addEventListener('click', () => {
    if (document.body.classList.contains('pc-layout')) {
      // PC: 통계 모달처럼 화면 중앙 팝업(iframe)으로 표시
      closeSettingsPanel();
      setTimeout(openHabitsModal, 350);
    } else {
      // 모바일: 풀페이지 이동
      location.href = 'js/habits.html';
    }
  });
  const menuDday = document.getElementById('menu-dday');
  if (menuDday) menuDday.addEventListener('click', () => {
    if (document.body.classList.contains('pc-layout')) {
      closeSettingsPanel();
      setTimeout(openDdayModal, 350);
    } else {
      location.href = 'js/Dday.html';
    }
  });
  const menuBucket = document.getElementById('menu-bucket');
  if (menuBucket) menuBucket.addEventListener('click', () => {
    if (document.body.classList.contains('pc-layout')) {
      closeSettingsPanel();
      setTimeout(openBucketModal, 350);
    } else {
      location.href = 'js/bucket.html';
    }
  });
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

// ── 반복함 표시 판정 ──
// 마스터가 "오늘(today) 이후로 아직 살아있는 발생분"을 하나라도 가지고 있는지 검사.
//  · 종료일 없는 무한 반복 → 미래가 항상 존재하므로 항상 표시
//  · 종료일이 이미 지난 반복 → 더 나올 게 없으므로 숨김
//  · 종료일이 남아있으면 오늘~종료일 사이에 '삭제 안 된 매칭 날짜'가 있는지 스캔
// ※ '이 날짜만 삭제'(repeat_deleted 예외 행)로 지워진 날짜는 발생분에서 제외
function hasRemainingOccurrence(master, allRows, today) {
  // 무한 반복: 앞으로 계속 나옴 → 항상 표시
  if (!master.repeat_end_date) return true;

  const end = master.repeat_end_date;
  // 종료일이 오늘보다 이전 → 남은 발생분 없음 → 숨김
  if (end < today) return false;

  // 이 마스터에서 '이 날짜만 삭제' 처리된 날짜 집합
  const deletedDates = new Set(
    allRows
      .filter(t => String(t.repeat_master_id) === String(master.id) && t.repeat_deleted)
      .map(t => t.date)
  );

  // 시작일이 미래면 시작일부터, 아니면 오늘부터 종료일까지 스캔
  const startStr = master.date > today ? master.date : today;
  const startDate = new Date(startStr + 'T00:00:00');
  const endDate   = new Date(end + 'T00:00:00');

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const ds = toLocalDateStr(d);
    if (isRepeatMatch(master, ds) && !deletedDates.has(ds)) return true;
  }
  return false;
}

async function loadRepeats() {
  const list = document.getElementById('repeats-list');
  list.innerHTML = '<div class="spinner"></div>';
  try {
    // IDB에서 읽기
    const all = await idbGetAll();
    const today = todayStr();
    const rows = all.filter(t =>
      t.repeat_type && t.repeat_type !== 'none' &&
      !t.repeat_master_id &&
      !t.repeat_exception &&
      // 반복함에는 "오늘 이후로 아직 한 번이라도 더 나올" 반복만 표시
      // → '이 날짜 이후 삭제'/종료일 만료 등으로 남은 발생분이 없으면 목록에서 제외
      hasRemainingOccurrence(t, all, today)
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


