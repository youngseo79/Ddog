/* =========================================================
   weather-pc.js — 오늘 날씨 칩 (PC 전용 · 날짜줄 양력/음력 오른쪽 #weather-display)
   · 날씨 정보: Open-Meteo (https://open-meteo.com) — API 키 없음 · 무료
   · 지역: 기본 세종 · 칩 끝 톱니바퀴로 변경 (이 PC에만 저장 · localStorage 'wxpc_loc' · 서버 동기화 없음)
   · 날씨 상태 = 지금 날씨(밤에 맑으면 달) · 최저/최고 = 오늘 하루 · 강수확률 = 남은 시간 중 최고
   · 화면을 켜 둔 동안 30분마다 칩만 자동 갱신 (실패하면 이전 값 유지) · 날짜가 바뀌면 새로 받음
   · 오늘이 아닌 날짜를 보고 있으면 지역명 앞에 '오늘' 표시
   · 무슨 오류가 나도 날씨만 표시하지 않고, 다른 기능에는 영향 없음
   · 모바일(index.html)은 기존 인라인 날씨 그대로 — 이 파일은 index-pc.html에서만 불러옴
   ========================================================= */
const WeatherPC = {
  LOC: { name: '세종', lat: 36.48, lon: 127.29 },   // 기본 지역 (설정이 없을 때)
  LS_CACHE: 'wxpc_cache',
  LS_LOC: 'wxpc_loc',         // 고른 지역 (이 PC에만 저장)

  /* ---------- 지역 ---------- */
  // 저장된 지역이 올바르면 그것, 아니면 기본 지역
  _loc() {
    try {
      const v = JSON.parse(localStorage.getItem(this.LS_LOC) || 'null');
      if (v && typeof v.name === 'string' && v.name.trim() && isFinite(v.lat) && isFinite(v.lon)
          && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180) return { name: v.name.trim(), lat: +v.lat, lon: +v.lon };
    } catch (e) {}
    return this.LOC;
  },
  _setLoc(l) {
    try { localStorage.setItem(this.LS_LOC, JSON.stringify({ name: l.name, lat: +l.lat, lon: +l.lon })); } catch (e) {}
  },
  TTL: 30 * 60 * 1000,        // 30분마다 새로 받기
  TIMEOUT: 4000,              // 4초 안에 응답이 없으면 포기 (표시 안 함)
  _mem: null,                 // 받아 둔 날씨 { key, at, d }
  _job: null,                 // 진행 중인 요청 (같은 요청을 여러 번 보내지 않도록)

  /* ---------- 날짜 ---------- */
  _ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  _today() { return this._ymd(new Date()); },
  // 선택된 날짜가 오늘인지 (알 수 없으면 오늘로 간주)
  _isToday() {
    try {
      if (typeof AppState !== 'undefined' && AppState && AppState.selectedDate) return AppState.selectedDate === this._today();
    } catch (e) {}
    return true;
  },

  /* ---------- 받아오기 ---------- */
  _key() { return 'v1|' + this._today() + '|' + this._loc().lat.toFixed(3) + ',' + this._loc().lon.toFixed(3); },
  async _json(url) {
    const ac = window.AbortController ? new AbortController() : null;
    const t = setTimeout(() => { if (ac) ac.abort(); }, this.TIMEOUT);
    try {
      const r = await fetch(url, ac ? { signal: ac.signal, cache: 'no-store' } : { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  },
  // 아직 유효한 저장본 (메모리 → 이 기기 저장소)
  _fresh() {
    const key = this._key(), now = Date.now();
    if (this._mem && this._mem.key === key && now - this._mem.at < this.TTL) return this._mem.d;
    try {
      const c = JSON.parse(localStorage.getItem(this.LS_CACHE) || 'null');
      if (c && c.key === key && now - c.at < this.TTL && c.d) { this._mem = c; return c.d; }
    } catch (e) {}
    return null;
  },
  async get() {
    const hit = this._fresh();
    if (hit) return hit;
    const l = this._loc(), key = this._key();
    if (this._job && this._job.key === key) return this._job.p;
    const p = (async () => {
      try {
        const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon
          + '&current=weather_code,is_day'
          + '&hourly=precipitation_probability'
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
          + '&timezone=Asia%2FSeoul&forecast_days=1';
        const j = await this._json(u);
        const dl = j && j.daily, cur = j && j.current, hr = j && j.hourly;
        const num = (v) => (v !== null && v !== undefined && v !== '' && isFinite(v)) ? +v : null;
        const hi = num(dl && dl.temperature_2m_max && dl.temperature_2m_max[0]);
        const lo = num(dl && dl.temperature_2m_min && dl.temperature_2m_min[0]);
        let code = num(cur && cur.weather_code);
        if (code === null) code = num(dl && dl.weather_code && dl.weather_code[0]);      // 지금 날씨가 없으면 하루 날씨로
        if (code === null || hi === null || lo === null) return null;
        // 남은 시간 강수확률: 지금 시각(정시 기준) 이후의 시간별 값 중 최고. 없으면 하루 최고값으로
        let pop = null;
        try {
          const nowH = (cur && typeof cur.time === 'string') ? cur.time.slice(0, 13) : '';
          if (nowH && hr && Array.isArray(hr.time) && Array.isArray(hr.precipitation_probability)) {
            hr.time.forEach((t, i) => {
              const v = num(hr.precipitation_probability[i]);
              if (typeof t === 'string' && t.slice(0, 13) >= nowH && v !== null) pop = pop === null ? v : Math.max(pop, v);
            });
          }
        } catch (e) { pop = null; }
        if (pop === null) pop = num(dl && dl.precipitation_probability_max && dl.precipitation_probability_max[0]);
        const day = num(cur && cur.is_day);
        const d = { code, hi: Math.round(hi), lo: Math.round(lo), pop: pop === null ? null : Math.round(pop), night: day === 0 };
        this._mem = { key, at: Date.now(), d };
        try { localStorage.setItem(this.LS_CACHE, JSON.stringify(this._mem)); } catch (e) {}
        return d;
      } catch (e) { return null; }
      finally { if (this._job && this._job.key === key) this._job = null; }
    })();
    this._job = { key, p };
    return p;
  },

  /* ---------- 날씨 종류 (WMO 코드) ---------- */
  kind(c) {
    if (c === 0) return ['sun', '맑음'];
    if (c === 1) return ['sun', '대체로 맑음'];
    if (c === 2) return ['part', '구름 조금'];
    if (c === 3) return ['cloud', '흐림'];
    if (c === 45 || c === 48) return ['fog', '안개'];
    if (c >= 51 && c <= 55) return ['drizzle', '이슬비'];
    if (c === 56 || c === 57 || c === 66 || c === 67) return ['sleet', '진눈깨비'];
    if (c >= 61 && c <= 65) return ['rain', c === 65 ? '많은 비' : '비'];
    if (c >= 80 && c <= 82) return ['rain', '소나기'];
    if (c >= 71 && c <= 77) return ['snow', c === 75 ? '많은 눈' : '눈'];
    if (c === 85 || c === 86) return ['snow', '소낙눈'];
    if (c >= 95) return ['storm', '뇌우'];
    return ['cloud', '흐림'];
  },

  /* ---------- 그림 (작은 하늘 창) ---------- */
  _cloud(cls) {
    return `<svg class="wx-cl ${cls}" viewBox="0 0 40 22" aria-hidden="true"><path d="M10 21h21a7 7 0 0 0 .6-14A9.5 9.5 0 0 0 13.3 6.6 7.3 7.3 0 0 0 10 21z"/></svg>`;
  },
  _sun(cls) {
    let rays = '';
    for (let i = 0; i < 8; i++) rays += `<line x1="12" y1="1.6" x2="12" y2="4.4" transform="rotate(${i * 45} 12 12)"/>`;
    return `<svg class="wx-sun ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><g class="wx-rays">${rays}</g><circle class="wx-core" cx="12" cy="12" r="5.2"/></svg>`;
  },
  // 빗방울·눈송이 자리 (고정 배열이라 매번 같은 모양)
  _drops(n, cls) {
    const X = [6, 13, 20, 27, 34, 41, 9, 17, 24, 31, 38, 3];
    const D = [0, .55, .2, .8, .35, .65, .45, .1, .9, .3, .7, .5];
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="${cls}" style="--x:${X[i % X.length]}px;--d:-${D[i % D.length]}s"></i>`;
    return h;
  },
  _moon(cls) {
    return `<svg class="wx-moon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.6A8.6 8.6 0 1 1 10.4 3.5a6.9 6.9 0 0 0 10.1 10.1z"/></svg>`;
  },
  _stars() {
    return '<i class="wx-star" style="--x:6px;--y:6px;--d:0s"></i><i class="wx-star" style="--x:40px;--y:21px;--d:-1.1s"></i><i class="wx-star" style="--x:11px;--y:22px;--d:-2.2s"></i><i class="wx-star" style="--x:43px;--y:5px;--d:-.6s"></i>';
  },
  _art(k) {
    if (k === 'moon') return this._stars() + this._moon('big');
    if (k === 'mpart') return this._stars() + this._moon('sm') + this._cloud('c1 gray');
    if (k === 'sun') return this._sun('big');
    if (k === 'part') return this._sun('sm') + this._cloud('c1');
    if (k === 'cloud') return this._cloud('c2 gray') + this._cloud('c1');
    if (k === 'fog') return this._cloud('c1 gray') + '<b class="wx-fb f1"></b><b class="wx-fb f2"></b><b class="wx-fb f3"></b>';
    if (k === 'drizzle') return this._drops(6, 'wx-drop slow') + this._cloud('top gray');
    if (k === 'rain') return this._drops(10, 'wx-drop') + this._cloud('top dark');
    if (k === 'sleet') return this._drops(5, 'wx-drop') + this._drops(5, 'wx-flake mix') + this._cloud('top gray');
    if (k === 'snow') return this._drops(10, 'wx-flake') + this._cloud('top snowc');
    if (k === 'storm') return this._drops(8, 'wx-drop fast') + this._cloud('top dark') + '<svg class="wx-bolt" viewBox="0 0 10 16" aria-hidden="true"><path d="M6 0 1 9h3.5L3 16l6-9.5H5.4L7 0z"/></svg>';
    return this._cloud('c1');
  },

  /* ---------- 화면에 붙이기 ---------- */
  _slot() { return document.getElementById('weather-display'); },
  init() {
    try {
      const slot = this._slot();
      if (!slot) return;
      // 칩 끝 톱니바퀴 → 지역 설정 모달 (칩 내용이 다시 그려져도 동작하도록 칩에 한 번만 연결)
      slot.addEventListener('click', (e) => {
        const g = e.target && e.target.closest && e.target.closest('.wx-gear');
        if (!g) return;
        e.preventDefault(); e.stopPropagation();
        this.openLocModal();
      });
      const hit = this._fresh();
      if (hit) this._show(hit);                             // 저장본이 있으면 바로 (깜빡임 없음)
      else setTimeout(() => { this.get().then(d => this._show(d), () => {}); }, 1500);   // 기존처럼 1.5초 뒤 (다른 초기화 먼저)
      this._startTimer();
    } catch (e) {}
  },
  _show(d) {
    const slot = this._slot();
    try { if (d && slot && slot.isConnected) this._fill(slot, d); }
    catch (e) { try { slot.hidden = true; } catch (_) {} }
  },
  // 선택 날짜가 바뀌었을 때: 인터넷 요청 없이 '오늘' 표시만 맞춤
  onDateChange() {
    try {
      const slot = this._slot();
      if (!slot || slot.hidden) return;
      const d = this._mem && this._mem.d;
      if (d) this._fill(slot, d);
    } catch (e) {}
  },

  /* ---------- 자동 갱신 ----------
     1분마다 '저장본이 30분 지났는지(또는 날짜가 바뀌었는지)'만 확인 (인터넷 요청 없음)
     → 지났으면 그때만 새로 받아 칩만 바꾼다. 받기에 실패하면 이전 값을 그대로 둔다.
     창이 숨겨진(최소화·다른 탭) 동안은 쉬고, 다시 보일 때 바로 확인한다. */
  _timer: null,
  _startTimer() {
    if (this._timer) return;
    try {
      this._timer = setInterval(() => this._tick(), 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this._tick(); });
    } catch (e) {}
  },
  _tick() {
    try {
      if (document.hidden) return;
      const slot = this._slot();
      if (!slot) return;
      const hit = this._fresh();
      if (hit && !slot.hidden) { this._show(hit); return; }   // 아직 30분 안 지남 ('오늘' 표시만 확인)
      this.get().then(d => this._show(d), () => {});
    } catch (e) {}
  },

  _fill(slot, d) {
    const l = this._loc();
    const isToday = this._isToday();
    let [k, txt] = this.kind(d.code);
    if (d.night && k === 'sun') k = 'moon';                 // 밤에 맑으면 달
    if (d.night && k === 'part') k = 'mpart';
    // 값이 그대로면 다시 그리지 않음 (애니메이션이 끊기지 않도록)
    const sig = [l.name, k, txt, d.lo, d.hi, d.pop, isToday].join('|');
    if (slot.dataset.sig === sig && !slot.hidden) return;
    slot.dataset.sig = sig;
    slot.className = 'wx wx-k-' + k + (d.night ? ' wx-night' : '');
    slot.title = `${l.name} 오늘 날씨\n지금: ${txt}\n오늘 최저 ${d.lo}° / 최고 ${d.hi}°${d.pop !== null ? '\n남은 시간 강수확률: ' + d.pop + '%' : ''}\n(30분마다 자동 갱신 · 날씨 정보: Open-Meteo.com)`;
    slot.innerHTML = `<span class="wx-art" aria-hidden="true">${this._art(k)}</span>
      <span class="wx-info"><span class="wx-city">${isToday ? '' : '<em>오늘</em>'}${l.name}</span><span class="wx-txt">${txt}</span></span>
      <span class="wx-tmp"><b class="lo">${d.lo}°</b><i>/</i><b class="hi">${d.hi}°</b></span>
      ${d.pop !== null ? `<span class="wx-pop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2C9 7.6 6.5 10.6 6.5 14a5.5 5.5 0 0 0 11 0c0-3.4-2.5-6.4-5.5-10.8z"/></svg>${d.pop}%</span>` : ''}
      <button type="button" class="wx-gear" title="날씨 지역 설정" aria-label="날씨 지역 설정"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.3a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6z"/></svg></button>`;
    slot.hidden = false;
  },

  /* ---------- 지역 설정 모달 ----------
     · 자주 쓰는 도시 버튼 + 이름 검색 (Open-Meteo 지명 검색 · 키 없음 · 무료)
     · '청주'처럼 시/군/구를 빼고 입력해도 찾도록 '청주시·청주군·청주구'도 함께 검색
     · 닫기: 닫기 버튼 · 바깥 클릭 · Esc · 뒤로가기(모달만 닫힘 — app.js 뒤로가기 처리에 연결) */
  PRESETS: [
    { name: '서울', lat: 37.5665, lon: 126.9780 }, { name: '인천', lat: 37.4563, lon: 126.7052 },
    { name: '수원', lat: 37.2636, lon: 127.0286 }, { name: '춘천', lat: 37.8813, lon: 127.7298 },
    { name: '강릉', lat: 37.7519, lon: 128.8761 }, { name: '세종', lat: 36.48, lon: 127.29 },
    { name: '대전', lat: 36.3504, lon: 127.3845 }, { name: '청주', lat: 36.6424, lon: 127.4890 },
    { name: '천안', lat: 36.8151, lon: 127.1139 }, { name: '전주', lat: 35.8242, lon: 127.1480 },
    { name: '광주', lat: 35.1595, lon: 126.8526 }, { name: '목포', lat: 34.8118, lon: 126.3922 },
    { name: '여수', lat: 34.7604, lon: 127.6622 }, { name: '대구', lat: 35.8714, lon: 128.6014 },
    { name: '포항', lat: 36.0190, lon: 129.3435 }, { name: '울산', lat: 35.5384, lon: 129.3114 },
    { name: '부산', lat: 35.1796, lon: 129.0756 }, { name: '창원', lat: 35.2280, lon: 128.6811 },
    { name: '제주', lat: 33.4996, lon: 126.5312 }, { name: '서귀포', lat: 33.2541, lon: 126.5600 },
  ],
  _OV_ID: 'wxpc-loc-overlay',
  _esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  isLocModalOpen() { return !!document.getElementById(this._OV_ID); },

  openLocModal() {
    try {
      if (this.isLocModalOpen()) return;
      const cur = this._loc();
      const ov = document.createElement('div');
      ov.id = this._OV_ID;
      ov.innerHTML = `
        <div class="wxl-box" role="dialog" aria-modal="true" aria-label="날씨 지역 설정">
          <div class="wxl-head"><b>날씨 지역 설정</b><button type="button" class="wxl-x" title="닫기" aria-label="닫기">✕</button></div>
          <div class="wxl-cur">현재 지역 <b>${this._esc(cur.name)}</b></div>
          <div class="wxl-sec">자주 쓰는 도시</div>
          <div class="wxl-presets">${this.PRESETS.map((p, i) =>
            `<button type="button" class="wxl-chip${(Math.abs(p.lat - cur.lat) < 0.01 && Math.abs(p.lon - cur.lon) < 0.01) ? ' on' : ''}" data-i="${i}">${this._esc(p.name)}</button>`).join('')}</div>
          <div class="wxl-sec">지역 검색 <span>시 · 군 · 구 이름 (예: 청주, 영동, 해운대)</span></div>
          <input type="text" class="wxl-input" placeholder="지역 이름 입력 후 잠시 기다리거나 Enter" autocomplete="off" spellcheck="false" />
          <div class="wxl-list"></div>
        </div>`;
      document.body.appendChild(ov);

      const box = ov.querySelector('.wxl-box');
      const input = ov.querySelector('.wxl-input');
      const list = ov.querySelector('.wxl-list');
      // 바깥 클릭으로 닫기 (모달 안에서 누르고 밖에서 뗀 경우는 제외 — 글자 드래그 등)
      let downIn = false;
      ov.addEventListener('mousedown', (e) => { downIn = box.contains(e.target); });
      ov.addEventListener('click', (e) => { if (e.target === ov && !downIn) this.closeLocModal(); downIn = false; });
      ov.querySelector('.wxl-x').addEventListener('click', () => this.closeLocModal());
      ov.querySelector('.wxl-presets').addEventListener('click', (e) => {
        const b = e.target.closest('.wxl-chip');
        if (b) this._pick(this.PRESETS[+b.dataset.i]);
      });
      list.addEventListener('click', (e) => {
        const b = e.target.closest('.wxl-item');
        if (b && this._results && this._results[+b.dataset.i]) this._pick(this._results[+b.dataset.i]);
      });
      let t = null;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this._search(input.value, list), 350); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); clearTimeout(t);
          // 결과가 이미 떠 있으면 첫 번째 선택, 아니면 바로 검색
          if (this._results && this._results.length && this._lastQ === input.value.trim()) this._pick(this._results[0]);
          else this._search(input.value, list);
        }
      });
      this._onKey = (e) => { if (e.key === 'Escape' && this.isLocModalOpen()) { e.preventDefault(); e.stopPropagation(); this.closeLocModal(); } };
      document.addEventListener('keydown', this._onKey, true);
      this._results = []; this._lastQ = ''; this._seq = 0;
      setTimeout(() => { try { input.focus(); } catch (e) {} }, 30);
    } catch (e) {}
  },

  closeLocModal() {
    try {
      const ov = document.getElementById(this._OV_ID);
      if (ov) ov.remove();
      if (this._onKey) { document.removeEventListener('keydown', this._onKey, true); this._onKey = null; }
      this._results = []; this._seq++;            // 진행 중이던 검색 결과는 버림
    } catch (e) {}
  },

  // 검색: 입력어 그대로 + 시/군/구를 붙이거나 뗀 이름까지 한꺼번에 찾아 합침
  async _search(raw, list) {
    const q = String(raw || '').trim();
    this._lastQ = q;
    const seq = ++this._seq;
    if (!q) { this._results = []; list.innerHTML = ''; return; }
    list.innerHTML = '<div class="wxl-msg">검색 중…</div>';

    const names = [q];
    if (/[가-힣]$/.test(q)) {
      const base = (q.length > 2 && /[시군구읍면]$/.test(q)) ? q.slice(0, -1) : q;
      [base, base + '시', base + '군', base + '구'].forEach(n => { if (n && !names.includes(n)) names.push(n); });
    }
    const one = (n) => this._json('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(n)
      + '&count=10&language=ko&format=json').then(j => (j && Array.isArray(j.results)) ? j.results : [], () => null);
    const packs = await Promise.all(names.map(one));
    if (seq !== this._seq || !this.isLocModalOpen()) return;     // 더 새로운 검색이 있거나 모달이 닫힘

    // 자주 쓰는 도시 중 이름이 맞는 것도 함께
    const out = [], seen = new Set();
    const add = (r) => {
      const k = r.lat.toFixed(2) + ',' + r.lon.toFixed(2);
      if (seen.has(k)) return; seen.add(k); out.push(r);
    };
    const qBase = (q.length > 1 ? q.replace(/[시군구]$/, '') : q) || q;
    this.PRESETS.forEach(p => { if (p.name.includes(qBase) || qBase.includes(p.name)) add({ name: p.name, lat: p.lat, lon: p.lon, sub: '자주 쓰는 도시', kr: 1, rank: 0, pop: 1e9 }); });

    const all = [];
    packs.forEach(arr => (arr || []).forEach(r => {
      if (!r || !isFinite(r.latitude) || !isFinite(r.longitude) || !r.name) return;
      const nm = String(r.name);
      const nb = nm.replace(/[시군구읍면]$/, '');
      const rank = (nm === q || nb === qBase) ? 1 : (nm.startsWith(qBase) ? 2 : 3);
      const sub = [r.admin1, r.admin2 && r.admin2 !== nm ? r.admin2 : '', r.country].filter(Boolean).join(' · ');
      all.push({ name: nm, lat: +r.latitude, lon: +r.longitude, sub, kr: r.country_code === 'KR' ? 1 : 0, rank, pop: +r.population || 0 });
    }));
    all.sort((a, b) => (b.kr - a.kr) || (a.rank - b.rank) || (b.pop - a.pop));
    all.forEach(add);
    this._results = out.slice(0, 15);

    if (!this._results.length) {
      const failed = packs.every(p => p === null);
      list.innerHTML = `<div class="wxl-msg">${failed ? '검색에 실패했어요. 인터넷 연결을 확인해 주세요.' : '찾는 지역이 없어요. 다른 이름으로 검색해 보세요.'}</div>`;
      return;
    }
    list.innerHTML = this._results.map((r, i) =>
      `<button type="button" class="wxl-item" data-i="${i}"><b>${this._esc(r.name)}</b><span>${this._esc(r.sub)}</span></button>`).join('');
  },

  // 지역 선택 → 저장하고 모달 닫은 뒤 바로 새 날씨 받기
  _pick(l) {
    try {
      if (!l || !isFinite(l.lat) || !isFinite(l.lon) || !l.name) return;
      this._setLoc({ name: l.name, lat: l.lat, lon: l.lon });
      this._mem = null;
      this.closeLocModal();
      this.get().then(d => {
        if (d) this._show(d);
        else if (typeof showToast === 'function') showToast('날씨를 불러오지 못했어요. 잠시 후 자동으로 다시 시도해요', 2500);
      }, () => {});
    } catch (e) {}
  },
};

/* 선택 날짜 라벨이 갱신될 때 '오늘' 표시도 맞추기
   (calendar.js는 수정하지 않고 바깥에서 감쌈 — 원래 동작은 그대로 실행) */
(function () {
  try {
    const orig = window.updateSelectedDateLabel;
    if (typeof orig !== 'function') return;
    window.updateSelectedDateLabel = function () {
      const r = orig.apply(this, arguments);
      try { WeatherPC.onDateChange(); } catch (e) {}
      return r;
    };
  } catch (e) {}
})();

/* 뒤로가기 = 지역 설정 모달만 닫기
   (app.js의 뒤로가기 처리 hasOpenPopup/closeTopPopup을 바깥에서 감쌈 — 원래 동작은 그대로) */
(function () {
  try {
    const origHas = window.hasOpenPopup, origClose = window.closeTopPopup;
    if (typeof origHas !== 'function' || typeof origClose !== 'function') return;
    window.hasOpenPopup = function () {
      try { if (WeatherPC.isLocModalOpen()) return true; } catch (e) {}
      return origHas.apply(this, arguments);
    };
    window.closeTopPopup = function () {
      try { if (WeatherPC.isLocModalOpen()) { WeatherPC.closeLocModal(); return; } } catch (e) {}
      return origClose.apply(this, arguments);
    };
  } catch (e) {}
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => WeatherPC.init());
else WeatherPC.init();
