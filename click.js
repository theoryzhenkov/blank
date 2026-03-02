/** @type {AudioContext | null} */
let ctx = null;

/** @type {AudioBuffer | null} */
let clickBuffer = null;

function ensureContext() {
  if (!ctx) {
    ctx = new AudioContext();

    const sampleRate = ctx.sampleRate;
    const length = Math.ceil(sampleRate * 0.012); // 12ms
    clickBuffer = ctx.createBuffer(1, length, sampleRate);

    const data = clickBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Exponentially-decaying white noise
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.003);
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
}

/**
 * Pre-initialize the AudioContext during a user gesture so
 * subsequent playClick() calls produce sound immediately.
 */
export function warmupAudio() {
  ensureContext();
}

/**
 * Play a subtle mechanical click sound.
 * Lazily creates AudioContext on first call (must be inside a user gesture).
 */
export function playClick() {
  ensureContext();

  const source = ctx.createBufferSource();
  source.buffer = clickBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 3000;
  bandpass.Q.value = 1.0;

  const gain = ctx.createGain();
  gain.gain.value = 0.15;

  source.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(ctx.destination);

  source.start();
}
