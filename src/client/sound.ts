import type { RoomTheme } from '../shared/types.js';

export type RoomSoundEvent = 'story-start' | 'vote' | 'reveal' | 'timer-start' | 'timer-end' | 'finalized' | 'consensus';

interface Note {
  frequency: number;
  at: number;
  duration: number;
  volume?: number;
}

const PATTERNS: Record<RoomSoundEvent, Note[]> = {
  'story-start': [
    { frequency: 392, at: 0, duration: .16 },
    { frequency: 523.25, at: .12, duration: .2 },
    { frequency: 783.99, at: .27, duration: .42, volume: .8 }
  ],
  vote: [
    { frequency: 659.25, at: 0, duration: .08, volume: .45 },
    { frequency: 880, at: .06, duration: .12, volume: .52 }
  ],
  reveal: [
    { frequency: 293.66, at: 0, duration: .18, volume: .62 },
    { frequency: 440, at: .13, duration: .22, volume: .68 },
    { frequency: 659.25, at: .28, duration: .36, volume: .74 }
  ],
  'timer-start': [
    { frequency: 880, at: 0, duration: .08, volume: .55 },
    { frequency: 1174.66, at: .13, duration: .1, volume: .65 }
  ],
  'timer-end': [
    { frequency: 987.77, at: 0, duration: .18 },
    { frequency: 783.99, at: .2, duration: .18 },
    { frequency: 587.33, at: .4, duration: .5, volume: .85 }
  ],
  finalized: [
    { frequency: 440, at: 0, duration: .16 },
    { frequency: 554.37, at: .1, duration: .18 },
    { frequency: 659.25, at: .2, duration: .42, volume: .75 }
  ],
  consensus: [
    { frequency: 523.25, at: 0, duration: .48 },
    { frequency: 659.25, at: .12, duration: .55 },
    { frequency: 783.99, at: .24, duration: .72, volume: .9 }
  ]
};

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedContext ??= new AudioContextClass();
  return sharedContext;
}

export function unlockRoomSounds(): void {
  const context = audioContext();
  if (context?.state === 'suspended') void context.resume();
}

export function playRoomSound(event: RoomSoundEvent, theme: RoomTheme): void {
  const context = audioContext();
  if (!context) return;
  void context.resume();
  const master = context.createGain();
  const now = context.currentTime;
  const themePitch = theme === 'turbo' ? 1.12 : theme === 'station' ? 1.04 : 1;
  const eventVolume = event === 'timer-end' || event === 'consensus' ? .16 : event === 'vote' ? .075 : .11;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(eventVolume, now + .015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
  master.connect(context.destination);

  for (const note of PATTERNS[event]) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = theme === 'turbo' ? 'square' : theme === 'station' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(note.frequency * themePitch, now + note.at);
    if (event === 'story-start') {
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * themePitch * 1.08, now + note.at + note.duration);
    }
    envelope.gain.setValueAtTime(0.0001, now + note.at);
    envelope.gain.exponentialRampToValueAtTime(note.volume ?? .65, now + note.at + .012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(now + note.at);
    oscillator.stop(now + note.at + note.duration + .02);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
