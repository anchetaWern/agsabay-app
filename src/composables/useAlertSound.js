import { ref } from 'vue'

export const useAlertSound = () => {
  const audioUnlocked = ref(false)
  let audioContext = null

  const getAudioContext = () => {
    if (audioContext) return audioContext
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    audioContext = new AudioCtx()
    return audioContext
  }

  const unlockAudio = async () => {
    const ctx = getAudioContext()
    if (!ctx) return false
    if (ctx.state === 'running') {
      audioUnlocked.value = true
      return true
    }
    try {
      await ctx.resume()
      audioUnlocked.value = ctx.state === 'running'
      return audioUnlocked.value
    } catch {
      return false
    }
  }

  const playBell = () => {
    if (!audioUnlocked.value) return false
    const ctx = getAudioContext()
    if (!ctx) return false

    const oscillatorA = ctx.createOscillator()
    const oscillatorB = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const now = ctx.currentTime

    oscillatorA.type = 'sine'
    oscillatorB.type = 'sine'
    oscillatorA.frequency.setValueAtTime(880, now)
    oscillatorB.frequency.setValueAtTime(1320, now)
    oscillatorA.detune.setValueAtTime(-6, now)
    oscillatorB.detune.setValueAtTime(4, now)

    gainNode.gain.setValueAtTime(0.0001, now)
    gainNode.gain.linearRampToValueAtTime(0.35, now + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)

    oscillatorA.connect(gainNode)
    oscillatorB.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillatorA.start(now)
    oscillatorB.start(now)
    oscillatorA.stop(now + 0.9)
    oscillatorB.stop(now + 0.9)

    oscillatorB.onended = () => {
      oscillatorA.disconnect()
      oscillatorB.disconnect()
      gainNode.disconnect()
    }

    return true
  }

  return {
    audioUnlocked,
    unlockAudio,
    playBell,
  }
}
