// Gerador de alerta sonoro de alta potência para cozinha/balcão reutilizando AudioContext
let cachedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!cachedAudioCtx || cachedAudioCtx.state === 'closed') {
    cachedAudioCtx = new AudioContextClass();
  }
  if (cachedAudioCtx.state === 'suspended') {
    cachedAudioCtx.resume();
  }
  return cachedAudioCtx;
}

export function playOrderAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Compressor + ganho master para volume máximo nos alto-falantes de celular/PC sem distorção
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(6, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.15, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, now);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Sequência tripla estilo campainha de cozinha / delivery (forte, aguda e impossível de ignorar)
    const notes = [
      // Toque 1
      { freq: 783.99, time: 0.00, duration: 0.14 },
      { freq: 987.77, time: 0.14, duration: 0.14 },
      { freq: 1318.51, time: 0.28, duration: 0.28 },
      // Toque 2 (repetição rápida de alerta)
      { freq: 783.99, time: 0.62, duration: 0.14 },
      { freq: 987.77, time: 0.76, duration: 0.14 },
      { freq: 1318.51, time: 0.90, duration: 0.30 },
      // Toque 3 (chamada final sustentada)
      { freq: 1046.50, time: 1.28, duration: 0.18 },
      { freq: 1567.98, time: 1.46, duration: 0.55 }
    ];

    notes.forEach(({ freq, time, duration }) => {
      // Oscilador principal (square = harmônicos fortes que cortam barulho de liquidificador/cozinha)
      const oscSquare = ctx.createOscillator();
      // Oscilador de corpo (triangle = volume cheio no alto-falante)
      const oscTriangle = ctx.createOscillator();
      const noteGain = ctx.createGain();

      oscSquare.type = 'square';
      oscSquare.frequency.setValueAtTime(freq, now + time);

      oscTriangle.type = 'triangle';
      oscTriangle.frequency.setValueAtTime(freq, now + time);

      // Envelope com sustentação alta (mantém volume máximo durante quase toda a nota)
      const sustainEnd = Math.max(0.02, duration * 0.75);
      noteGain.gain.setValueAtTime(0.001, now + time);
      noteGain.gain.linearRampToValueAtTime(0.95, now + time + 0.012);
      noteGain.gain.setValueAtTime(0.90, now + time + sustainEnd);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

      oscSquare.connect(noteGain);
      oscTriangle.connect(noteGain);
      noteGain.connect(compressor);

      oscSquare.start(now + time);
      oscTriangle.start(now + time);
      oscSquare.stop(now + time + duration);
      oscTriangle.stop(now + time + duration);
    });
  } catch (e) {
    console.warn("Não foi possível reproduzir som de alerta:", e);
  }
}

export function playCancellationAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, now);
    compressor.ratio.setValueAtTime(5, now);
    compressor.connect(ctx.destination);

    const notes = [
      { freq: 587.33, time: 0.00, duration: 0.22 },
      { freq: 440.00, time: 0.24, duration: 0.22 },
      { freq: 329.63, time: 0.48, duration: 0.45 }
    ];

    notes.forEach(({ freq, time, duration }) => {
      const oscSquare = ctx.createOscillator();
      const oscSaw = ctx.createOscillator();
      const gain = ctx.createGain();

      oscSquare.type = 'square';
      oscSquare.frequency.setValueAtTime(freq, now + time);

      oscSaw.type = 'sawtooth';
      oscSaw.frequency.setValueAtTime(freq, now + time);

      const sustainEnd = Math.max(0.02, duration * 0.7);
      gain.gain.setValueAtTime(0.001, now + time);
      gain.gain.linearRampToValueAtTime(0.90, now + time + 0.015);
      gain.gain.setValueAtTime(0.85, now + time + sustainEnd);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

      oscSquare.connect(gain);
      oscSaw.connect(gain);
      gain.connect(compressor);

      oscSquare.start(now + time);
      oscSaw.start(now + time);
      oscSquare.stop(now + time + duration);
      oscSaw.stop(now + time + duration);
    });
  } catch (e) {
    console.warn("Não foi possível reproduzir som de cancelamento:", e);
  }
}
