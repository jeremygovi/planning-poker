interface TrainArtProps {
  variant?: 'hero' | 'card' | 'empty';
  value?: string;
  className?: string;
}

export function TrainArt({ variant = 'card', value, className = '' }: TrainArtProps) {
  return (
    <svg className={`train-art train-art-${variant} ${className}`} viewBox="0 0 220 112" aria-hidden="true">
      <g className="train-motion">
        <path className="train-shadow" d="M22 92h178" />
        <circle className="train-wheel" cx="67" cy="87" r="14" />
        <circle className="train-wheel" cx="163" cy="87" r="14" />
        <circle className="train-wheel-hub" cx="67" cy="87" r="5" />
        <circle className="train-wheel-hub" cx="163" cy="87" r="5" />
        <path className="train-body" d="M28 32h108c25 0 45 15 56 42l5 12H28z" />
        <path className="train-nose" d="M136 32c22 1 42 15 56 42h-56z" />
        <path className="train-roof" d="M43 29h88l12 8H34z" />
        <rect className="train-window" x="53" y="43" width="29" height="22" rx="5" />
        <rect className="train-window" x="91" y="43" width="29" height="22" rx="5" />
        <path className="train-window" d="M143 43h14c11 0 20 7 26 20h-40z" />
        <path className="train-stripe" d="M34 72h156" />
        <circle className="train-light" cx="188" cy="71" r="4" />
        {value && <text className="train-number" x="111" y="82" textAnchor="middle">{value}</text>}
      </g>
    </svg>
  );
}

export function RouteLine() {
  return (
    <svg className="route-line" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-20 112C110 112 120 28 252 39s129 100 263 73 146-89 268-55 134 90 230 39 113-25 207-9" />
      <circle cx="252" cy="39" r="8" /><circle cx="515" cy="112" r="8" /><circle cx="1013" cy="96" r="8" />
    </svg>
  );
}

