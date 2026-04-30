// =============================================
// sound.js — 효과음 재생
// =============================================

const _sfxComplete = new Audio();
_sfxComplete.src = (function() {
  // index.html 기준 루트 경로로 고정
  const scripts = document.getElementsByTagName('script');
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].src;
    if (src && src.includes('sound.js')) {
      return src.replace(/js\/sound\.js.*$/, 'effect 1.mp3');
    }
  }
  return 'effect 1.mp3';
})();
_sfxComplete.volume = 0.7;
_sfxComplete.preload = 'auto';

let _audioUnlocked = false;

function _unlockAudio() {
  if (_audioUnlocked) return;
  // AudioContext 무음 버퍼로 언락 (iOS/Android/Desktop 공통)
  // — Audio.play()→pause() 방식보다 소리가 새어나올 가능성이 구조적으로 없음
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    // onended: 정상 종료 시 언락 완료
    src.onended = () => { ctx.close(); _audioUnlocked = true; };
    // 폴백: onended가 드물게 발화 안 되는 iOS 케이스 대비
    // 100ms 후에도 언락이 안 됐으면 강제로 완료 처리
    setTimeout(() => { if (!_audioUnlocked) { _audioUnlocked = true; } }, 100);
  } catch(e) {
    // AudioContext 자체가 실패해도 언락 완료로 처리
    // (이 경우 playCompleteSound의 play()가 자체적으로 시도)
    _audioUnlocked = true;
  }
}

// { once: true }: 언락 완료 후 리스너 자동 제거 (메모리 정리)
document.addEventListener('touchstart', _unlockAudio, { passive: true, once: true });
document.addEventListener('mousedown',  _unlockAudio, { once: true });

function playCompleteSound() {
  try {
    _sfxComplete.currentTime = 0;
    _sfxComplete.play().catch(() => {});
  } catch(e) {}
}
