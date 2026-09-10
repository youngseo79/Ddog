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
    if (_pendingPlay) { _pendingPlay = false; playCompleteSound(); }
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
// =============================================
function playCompleteSound() {
  const ctx = _getCtx();

  // Web Audio 자체가 불가능한 환경 → 구형 방식으로 폴백
  if (!ctx) { _fallbackPlay(); return; }

  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!_buffer) {
    // 아직 디코딩 전이면, 끝나는 대로 한 번 재생
    _pendingPlay = true;
    _loadBuffer().then(() => {
      if (_pendingPlay) { _pendingPlay = false; playCompleteSound(); }
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
