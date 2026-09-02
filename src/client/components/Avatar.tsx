import type { AvatarKey } from '../../shared/types.js';

type AvatarSize = 'small' | 'medium' | 'large';

const palettes: Record<AvatarKey, { shell: string; face: string; accent: string }> = {
  train: { shell: '#3478f6', face: '#dceaff', accent: '#ffb84d' },
  rocket: { shell: '#ef476f', face: '#ffe1e8', accent: '#ffd166' },
  robot: { shell: '#7458d4', face: '#ded8ff', accent: '#55d6be' },
  fox: { shell: '#ed8733', face: '#fff0dc', accent: '#633b2d' },
  owl: { shell: '#6656a6', face: '#eeeaff', accent: '#f6c453' },
  cat: { shell: '#e95f9f', face: '#ffe3f1', accent: '#71305a' },
  cactus: { shell: '#3fa96a', face: '#daf7e5', accent: '#ffd166' },
  comet: { shell: '#f4a51c', face: '#fff0bd', accent: '#e45757' },
  frog: { shell: '#58b957', face: '#ddf8d8', accent: '#f4cc55' },
  panda: { shell: '#263449', face: '#f7f8fc', accent: '#5a7dff' },
  alien: { shell: '#20a89a', face: '#d7fff8', accent: '#9d63ff' },
  pirate: { shell: '#31466c', face: '#ffe1bd', accent: '#ef476f' }
};

export function Avatar({ avatar, size = 'medium' }: { avatar: AvatarKey; size?: AvatarSize }) {
  const palette = palettes[avatar];
  return (
    <span className={`avatar-art avatar-${size} avatar-${avatar}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <defs><linearGradient id={`avatar-${avatar}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={palette.shell} /><stop offset="1" stopColor={palette.accent} /></linearGradient></defs>
        {avatar === 'comet' && <path d="M3 46C13 42 13 28 28 18L42 44C24 48 16 56 3 54Z" fill={palette.accent} opacity=".8" />}
        {avatar === 'fox' && <><path d="M10 24 17 7l13 13M54 24 47 7 34 20" fill={palette.shell} stroke={palette.accent} strokeWidth="3" strokeLinejoin="round" /></>}
        {avatar === 'cat' && <><path d="M11 25 15 8l14 12M53 25 49 8 35 20" fill={palette.shell} stroke={palette.accent} strokeWidth="3" strokeLinejoin="round" /></>}
        {avatar === 'panda' && <><circle cx="17" cy="17" r="10" fill={palette.shell} /><circle cx="47" cy="17" r="10" fill={palette.shell} /></>}
        {avatar === 'frog' && <><circle cx="18" cy="17" r="10" fill={palette.shell} /><circle cx="46" cy="17" r="10" fill={palette.shell} /></>}
        {avatar === 'owl' && <path d="M13 22 13 8l13 11h12L51 8v14" fill={palette.shell} />}
        {avatar === 'robot' && <><path d="M32 12V5" stroke={palette.shell} strokeWidth="4" strokeLinecap="round" /><circle cx="32" cy="5" r="3" fill={palette.accent} /></>}
        {avatar === 'alien' && <><path d="M32 13V6" stroke={palette.shell} strokeWidth="3" /><circle cx="32" cy="5" r="3" fill={palette.accent} /></>}
        {avatar === 'train' && <><path d="M21 14V6h22v8" fill={palette.shell} /><path d="M42 9h8v8" fill={palette.accent} /></>}
        {avatar === 'rocket' && <><path d="M10 38 3 50l13-2M54 38l7 12-13-2" fill={palette.accent} /></>}
        {avatar === 'cactus' && <><path d="M11 28V17M11 25h7M53 31V19M46 28h7" stroke={palette.shell} strokeWidth="5" strokeLinecap="round" /></>}
        <rect x="8" y="13" width="48" height="45" rx={avatar === 'robot' ? 12 : 22} fill={`url(#avatar-${avatar})`} stroke="rgba(255,255,255,.65)" strokeWidth="2" />
        <path d="M14 34c2-12 8-17 18-17s16 5 18 17v16H14Z" fill={palette.face} opacity=".96" />
        {avatar === 'panda' && <><ellipse cx="23" cy="34" rx="8" ry="10" fill={palette.shell} transform="rotate(22 23 34)" /><ellipse cx="41" cy="34" rx="8" ry="10" fill={palette.shell} transform="rotate(-22 41 34)" /></>}
        {avatar === 'owl' && <><circle cx="23" cy="34" r="10" fill="#fff" stroke={palette.accent} strokeWidth="3" /><circle cx="41" cy="34" r="10" fill="#fff" stroke={palette.accent} strokeWidth="3" /></>}
        {avatar === 'pirate' && <><path d="M8 23c9-13 39-16 48 1-16-5-33-5-48-1Z" fill="#182238" /><path d="M17 19c8-8 22-8 30 0" fill="none" stroke={palette.accent} strokeWidth="4" /></>}
        {avatar === 'train' && <path d="M13 27h38" stroke={palette.accent} strokeWidth="5" />}
        {avatar === 'alien' && <circle cx="32" cy="25" r="3" fill={palette.accent} />}
        <g fill={palette.shell}>
          <circle cx="23" cy="35" r={avatar === 'owl' ? 4 : 3.2} /><circle cx="41" cy="35" r={avatar === 'owl' ? 4 : 3.2} />
        </g>
        {avatar === 'pirate' && <><path d="M15 31h16l-3 10H18Z" fill="#182238" /><path d="m27 38 9 2" stroke="#182238" strokeWidth="2" /></>}
        {avatar === 'robot' ? <path d="M23 47h18" stroke={palette.shell} strokeWidth="4" strokeLinecap="round" strokeDasharray="3 4" />
          : avatar === 'frog' ? <path d="M22 45c5 6 15 6 20 0" fill={palette.accent} stroke={palette.shell} strokeWidth="2" strokeLinecap="round" />
          : avatar === 'fox' ? <><path d="m32 40-4 4h8Z" fill={palette.shell} /><path d="M25 48c4 3 10 3 14 0" fill="none" stroke={palette.shell} strokeWidth="2.5" strokeLinecap="round" /></>
          : avatar === 'cat' ? <><path d="m32 40-3 3h6Z" fill={palette.shell} /><path d="M17 42h10M47 42H37" stroke={palette.shell} strokeWidth="1.5" /></>
          : <path d="M23 45c4 7 14 7 18 0" fill={avatar === 'comet' ? palette.accent : '#fff'} stroke={palette.shell} strokeWidth="2.4" strokeLinecap="round" />}
        {avatar === 'cactus' && <g stroke={palette.shell} strokeWidth="1.5"><path d="m19 27 3 2M45 27l-3 2M18 43l4-1M46 43l-4-1" /></g>}
      </svg>
    </span>
  );
}
