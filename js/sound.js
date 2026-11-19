// =============================================
// sound.js — 효과음 재생 (4차: 배경음악 유지 / 첫 재생 보장)
// =============================================
//
// [기존 문제 원인]
// 1) new Audio() = HTMLMediaElement → iOS 오디오 세션 타입이 'playback'(독점).
//    다른 앱 음악을 "정지"시킴. AudioContext는 기본 타입이 'ambient'(혼합)라
//    음악이 끊기지 않음.  → Web Audio API 방식으로 전면 교체.
// 2) Chrome(Android)은 길이 5초 이상 미디어에 full audio focus를 요청 →
//    배경 음악 정지. 기존 effect 1.mp3 = 5.57초(실제 소리 1.89초 + 무음 3.68초).
//    → mp3를 2초로 잘라서 교체할 것. (같이 제공된 effect 1.mp3 사용)
// 3) 기존 _unlockAudio()는 AudioContext를 열었다가 close() 해버렸고,
//    _audioUnlocked 플래그는 어디에서도 쓰이지 않았음. 즉 언락이 무의미했음.
//    게다가 모든 호출부가 await(서버 통신) 이후에 실행돼서 제스처 컨텍스트가
//    끊긴 상태였음 → 첫 효과음이 안 남.
//    → 컨텍스트를 계속 살려두고 첫 터치에서 resume()까지 확실히 처리.
//
// [옵션] iOS에서 그래도 음악이 끊기면 아래 AUDIO_SESSION_TYPE 을
//        'ambient' 로 바꿔서 테스트. (단 'ambient'는 무음 스위치에 따름)
// =============================================

const SFX_VOLUME = 0.7;
const AUDIO_SESSION_TYPE = 'auto'; // 'auto' | 'ambient' | 'transient'

// ── mp3 경로 계산 (파일명 변경/캐시버스터에 영향받지 않음) ──
const _sfxCandidates = (function () {
  const list = [];
  const me = document.currentScript && document.currentScript.src;
  if (me) {
    // js/sound.js → ../effect 1.mp3  (루트에 있는 경우)
    try { list.push(new URL('../effect 1.mp3', me).href); } catch (e) {}
    // sound.js 와 같은 폴더에 있는 경우
    try { list.push(new URL('./effect 1.mp3', me).href); } catch (e) {}
  }
  try { list.push(new URL('effect 1.mp3', location.href).href); } catch (e) {}
  return list;
})();

let _ctx = null;          // 단 하나의 AudioContext (절대 close() 하지 않음)
let _buffer = null;       // 디코딩된 효과음
let _loading = null;      // 로딩 Promise (중복 요청 방지)
let _pendingPlay = false; // 로딩 끝나기 전에 재생 요청이 들어온 경우

function _getCtx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    _ctx = new AC();
    // 오디오 세션 타입 지정 (Safari 16.4+ 에서만 존재)
    if (AUDIO_SESSION_TYPE !== 'auto' && 'audioSession' in navigator) {
      try { navigator.audioSession.type = AUDIO_SESSION_TYPE; } catch (e) {}
    }
  } catch (e) {
    _ctx = null;
  }
  return _ctx;
}

// ── 효과음 미리 로드 + 디코딩 ──
// decodeAudioData 는 컨텍스트가 suspended 상태여도 동작하므로
// 사용자 제스처를 기다릴 필요 없이 페이지 로드 시점에 끝내둔다. (첫 재생 지연 제거)
function _loadBuffer() {
  if (_buffer) return Promise.resolve(_buffer);
  if (_loading) return _loading;

  const ctx = _getCtx();
  if (!ctx) return Promise.reject(new Error('no AudioContext'));

  _loading = (async () => {
    let lastErr = null;
    for (const url of _sfxCandidates) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) { lastErr = new Error(res.status + ' ' + url); continue; }
        const arr = await res.arrayBuffer();
        _buffer = await new Promise((resolve, reject) => {
          // 콜백형 시그니처: 구형 Safari 호환
          const p = ctx.decodeAudioData(arr, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
        return _buffer;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('effect 1.mp3 로드 실패');
  })();

  _loading.catch(() => { _loading = null; }); // 실패 시 재시도 허용
  return _loading;
}

// ── 첫 사용자 제스처에서 컨텍스트 resume ──
// 브라우저 자동재생 정책상 AudioContext 는 반드시 제스처 안에서 resume 되어야 한다.
// running 이 될 때까지 리스너를 유지한다. (once:true 로 한 번만 시도하면 실패 시 영영 못 켬)
const _UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];

function _unlockAudio() {
  const ctx = _getCtx();
  if (!ctx) { _removeUnlock(); return; }

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  // iOS: 무음 버퍼를 한 번 start() 해줘야 확실히 열린다. (컨텍스트는 그대로 유지)
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {}

  _loadBuffer().then(() => {
    if (_pendingPlay) { _pendingPlay = false; _playSfx(); }
  }).catch(() => {});

  if (ctx.state === 'running') _removeUnlock();
}

function _removeUnlock() {
  _UNLOCK_EVENTS.forEach(ev => document.removeEventListener(ev, _unlockAudio, true));
}

// capture 단계로 등록 → 다른 핸들러가 stopPropagation() 해도 언락은 항상 실행됨
_UNLOCK_EVENTS.forEach(ev =>
  document.addEventListener(ev, _unlockAudio, { capture: true, passive: true })
);

// 페이지 로드 직후 미리 받아두기 (제스처 불필요)
_loadBuffer().catch(() => {});

// =============================================
// 공개 API — 기존 호출부 그대로 사용 가능
// 할일 완료 시: 효과음(즉시) + 폭죽(화면 갱신이 먼저 그려진 다음)
// =============================================
function playCompleteSound() {
  _playSfx();
  _scheduleFireworks();
}

// 폭죽은 지금 하던 일(체크 표시·목록 다시 그리기)과 그 화면 그리기가 끝난 다음에 시작
// → 체크는 지연 없이 바로 바뀌고, 폭죽은 한 박자(1프레임) 뒤에 따라옴
function _scheduleFireworks() {
  try {
    const go = () => setTimeout(() => { try { Fireworks.play('small', 4000); } catch (e) {} }, 0);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else go();
  } catch (e) { /* 연출 실패는 무시 */ }
}

// ── 효과음 재생 (기존 playCompleteSound 내용 그대로) ──
function _playSfx() {
  const ctx = _getCtx();

  // Web Audio 자체가 불가능한 환경 → 구형 방식으로 폴백
  if (!ctx) { _fallbackPlay(); return; }

  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!_buffer) {
    // 아직 디코딩 전이면, 끝나는 대로 한 번 재생
    _pendingPlay = true;
    _loadBuffer().then(() => {
      if (_pendingPlay) { _pendingPlay = false; _playSfx(); }
    }).catch(() => { _pendingPlay = false; _fallbackPlay(); });
    return;
  }

  try {
    const src = ctx.createBufferSource();
    src.buffer = _buffer;
    const gain = ctx.createGain();
    gain.gain.value = SFX_VOLUME;
    src.connect(gain).connect(ctx.destination);
    src.start(0);
    // 노드 정리 (연타해도 서로 안 끊기고 겹쳐 재생됨)
    src.onended = () => { try { src.disconnect(); gain.disconnect(); } catch (e) {} };
  } catch (e) {
    _fallbackPlay();
  }
}

// ── 폴백: 아주 구형 브라우저 전용 (이 경로에서는 배경음악이 끊길 수 있음) ──
let _fallbackEl = null;
function _fallbackPlay() {
  try {
    if (!_fallbackEl) {
      _fallbackEl = new Audio(_sfxCandidates[0] || 'effect 1.mp3');
      _fallbackEl.volume = SFX_VOLUME;
      _fallbackEl.preload = 'auto';
    }
    _fallbackEl.currentTime = 0;
    _fallbackEl.play().catch(() => {});
  } catch (e) {}
}

// =============================================
// 폭죽 엔진 (학원 앱과 같은 모양 · 모바일 지연 줄인 버전)
// - 화면 맨 위 투명 캔버스에만 그림 (pointer-events:none) → 터치·클릭·스크롤·다른 기능에 영향 없음
// - 캔버스는 처음 한 번만 만들고 다시 씀 (완료할 때마다 새로 만들지 않음), 쉴 때는 숨김
// - 해상도: 모바일 1배 · PC 최대 1.5배 (색종이는 고해상도가 필요 없음 → 그리는 양 크게 줄임)
// - 화면 크기에 맞춰 양·범위 자동 조절 (PC는 넓고 크게, 모바일은 모바일대로)
// - 오류가 나도 무시 → 완료 처리·저장·동기화·효과음은 절대 멈추지 않음
// =============================================
const Fireworks = {
  COLORS: ['#F0A202', '#F7B733', '#FFFDF6', '#E8730A', '#FF9F6B'],
  cv: null, ctx: null, parts: [], queue: [], until: 0, fade: 600, raf: 0, last: 0, t0: 0, t: 0, w: 0, h: 0, dpr: 1,

  reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); },
  canvas() {
    if (!this.cv) {
      const cv = this.cv = document.createElement('canvas');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;display:none';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      this.ctx = cv.getContext('2d');
      this.w = 0; this.h = 0;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = w < 600 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {          // 크기가 바뀐 경우에만 다시 맞춤
      this.w = w; this.h = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    }
    this.cv.style.display = 'block';
  },
  rnd(a, b) { return a + Math.random() * (b - a); },

  // 양옆 아래에서 안쪽 위로 쏘는 축포 (화면 가운데까지 닿게)
  cannon(n, cols) {
    const { w, h } = this, up = Math.max(0.75, Math.min(1.3, h / 850));
    for (let i = 0; i < n; i++) {
      const L = i % 2 === 0;
      this.parts.push({ t: 'c', x: L ? -10 : w + 10, y: h * this.rnd(0.72, 0.95), vx: (L ? 1 : -1) * this.rnd(5, 15) * Math.max(0.8, w / 1400),
        vy: -this.rnd(13, 25) * up, g: 0.34, d: 0.99, s: this.rnd(6, 12), r: Math.random() * 6.3, vr: this.rnd(-0.35, 0.35), c: cols[i % cols.length] });
    }
  },
  // 화면 가운데 · 위쪽에서 둥글게 퍼지는 불꽃 (불티 + 색종이)
  burst(n, cols) {
    const { w, h } = this;
    const cx = w * this.rnd(0.22, 0.78), cy = h * this.rnd(0.18, 0.5), sp = Math.max(0.8, Math.min(1.4, Math.min(w, h) / 750));
    const c0 = cols[Math.floor(Math.random() * cols.length)];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = this.rnd(2.5, 10) * sp;
      this.parts.push({ t: 's', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.07, d: 0.955, s: this.rnd(2, 3.8),
        life: this.rnd(900, 1700), age: 0, c: i % 3 ? c0 : cols[i % cols.length] });
    }
    for (let i = 0; i < Math.round(n / 4); i++) {
      const a = Math.random() * Math.PI * 2, v = this.rnd(3, 9) * sp;
      this.parts.push({ t: 'c', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.18, d: 0.97, s: this.rnd(6, 11),
        r: Math.random() * 6.3, vr: this.rnd(-0.35, 0.35), c: cols[i % cols.length] });
    }
  },
  // 위에서 화면 전체로 천천히 내려오는 색종이
  rain(n, cols) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ t: 'r', x: Math.random() * this.w, y: -this.rnd(10, 60), vx: 0, vy: this.rnd(1.6, 3.6), ph: Math.random() * 6.3,
        s: this.rnd(6, 11), r: Math.random() * 6.3, vr: this.rnd(-0.12, 0.12), c: cols[i % cols.length] });
    }
  },
  // 시간표대로 조각 넣기 — 한꺼번에 만들지 않고 프레임마다 나눠 넣음
  plan(kind, cols) {
    const k = this.w < 600 ? 0.6 : 1, N = (x) => Math.max(1, Math.round(x * k)), at = (ms, fn) => this.queue.push({ at: this.t + ms, fn });
    if (kind === 'big') {
      at(0, () => this.cannon(N(240), cols));
      at(300, () => this.cannon(N(200), cols));
      [200, 800, 1400, 2000, 2700, 3400].forEach(ms => at(ms, () => this.burst(N(110), cols)));
      for (let ms = 1500; ms <= 4500; ms += 300) at(ms, () => this.rain(N(30), cols));
    } else {
      at(0, () => this.cannon(N(140), cols));
      [100, 550, 1050].forEach(ms => at(ms, () => this.burst(N(70), cols)));
      for (let ms = 900; ms <= 2100; ms += 300) at(ms, () => this.rain(N(16), cols));
    }
  },

  play(kind, ms, colors) {
    try {
      if (this.reduced()) return;
      const now = performance.now();
      if (!this.raf) { this.canvas(); this.t0 = now; this.t = 0; this.last = now; this.parts = []; this.queue = []; }
      this.plan(kind, colors && colors.length ? colors : this.COLORS);
      this.until = Math.max(this.until, now + ms);
      this.fade = kind === 'big' ? 900 : 600;
      if (!this.raf) this.raf = requestAnimationFrame(() => this.step());
    } catch (e) { /* 연출 실패는 무시 */ }
  },
  stop() {
    try {
      cancelAnimationFrame(this.raf);
      this.raf = 0; this.until = 0; this.parts = []; this.queue = [];
      if (this.ctx) { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
      if (this.cv) this.cv.style.display = 'none';
    } catch (e) {}
  },
  step() {
    try {
      const now = performance.now();
      const left = this.until - now;
      if (left <= 0 || !this.cv) { this.stop(); return; }
      const dt = Math.min(3, (now - this.last) / 16.67);        // 화면 주사율과 상관없이 같은 속도
      this.last = now; this.t = now - this.t0;
      if (this.queue.length) {
        const due = this.queue.filter(q => q.at <= this.t);
        if (due.length) { this.queue = this.queue.filter(q => q.at > this.t); due.forEach(q => q.fn()); }
      }
      const { ctx, w, h, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const base = Math.min(1, left / this.fade);              // 끝날 때 서서히 흐려짐
      const keep = [];
      for (const q of this.parts) {
        if (q.t === 'r') { q.x += Math.sin(this.t / 400 + q.ph) * 0.9 * dt; q.y += q.vy * dt; }
        else { q.vy += q.g * dt; const dd = Math.pow(q.d, dt); q.vx *= dd; q.vy *= dd; q.x += q.vx * dt; q.y += q.vy * dt; }
        if (q.y > h + 40 || q.x < -60 || q.x > w + 60) continue;
        if (q.t === 's') {
          q.age += 16.67 * dt;
          if (q.age >= q.life) continue;
          ctx.globalAlpha = base * (1 - q.age / q.life);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = q.c;
          ctx.fillRect(q.x - q.s, q.y - q.s, q.s * 2, q.s * 2);   // 불티: 원 대신 작은 사각형 (모바일에서 훨씬 가벼움, 눈으로는 거의 같음)
        } else {
          q.r += q.vr * dt;
          ctx.globalAlpha = base;
          const c = Math.cos(q.r), s = Math.sin(q.r);
          ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, q.x * dpr, q.y * dpr);
          ctx.fillStyle = q.c;
          ctx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2);
        }
        keep.push(q);
      }
      this.parts = keep;
      ctx.globalAlpha = 1;
      this.raf = requestAnimationFrame(() => this.step());
    } catch (e) { this.stop(); }
  },
};
