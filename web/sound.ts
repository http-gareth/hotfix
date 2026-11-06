type Note = [number, number, number]

const SOUNDS: Record<string, Note[]> = {
  key: [[1500, 0, 0.012]],
  miss: [[150, 0, 0.07]],
  tick: [[880, 0, 0.06]],
  go: [[1046, 0, 0.22]],
  found: [[660, 0, 0.08], [990, 0.08, 0.14]],
  nope: [[240, 0, 0.12], [170, 0.1, 0.2]],
  fixed: [[523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.24]],
  combo: [[784, 0, 0.07], [988, 0.07, 0.07], [1175, 0.14, 0.07], [1568, 0.21, 0.26]],
  win: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1046, 0.36, 0.45]],
  over: [[392, 0, 0.16], [330, 0.16, 0.16], [262, 0.32, 0.36]]
}

let context: AudioContext | undefined
let muted = false
try {
  muted = localStorage.getItem('hotfix-muted') === '1'
} catch {}

export const isMuted = () => muted

export const toggleMute = () => {
  muted = !muted
  try {
    localStorage.setItem('hotfix-muted', muted ? '1' : '0')
  } catch {}
  return muted
}

export const unlock = () => {
  context ??= new AudioContext()
  context.resume()
}

export const sound = (name: keyof typeof SOUNDS) => {
  if (muted || !context || context.state !== 'running') return
  const start = context.currentTime
  for (const [frequency, at, length] of SOUNDS[name]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = name === 'key' || name === 'miss' ? 'square' : 'triangle'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(name === 'key' ? 0.025 : 0.12, start + at)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start + at)
    oscillator.stop(start + at + length + 0.02)
  }
}
