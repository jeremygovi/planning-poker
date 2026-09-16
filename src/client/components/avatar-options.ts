import type { AvatarKey } from '../../shared/types.js';
import { AVAILABLE_AVATAR_KEYS } from '../avatar-assets.js';

const SUBJECT_LABELS: Readonly<Record<string, string>> = {
  train: 'Express',
  rocket: 'Turbo',
  robot: 'Boulon',
  fox: 'Renard',
  owl: 'Hibou',
  cat: 'Moustache',
  cactus: 'Picot',
  comet: 'Comète',
  frog: 'Grenouille',
  panda: 'Panda',
  alien: 'Cosmo',
  pirate: 'Pirate'
};

const STYLES = [
  { key: 'toybox', label: 'Toybox 3D', suffix: '' },
  { key: 'punk', label: 'Punk Zine', suffix: '_punk' },
  { key: 'pixel', label: 'Pixel Arcade', suffix: '_pixel' }
] as const;

function subjectFor(key: AvatarKey): string {
  return key.replace(/_(punk|pixel)$/, '');
}

function labelFor(key: AvatarKey): string {
  const subject = subjectFor(key);
  return SUBJECT_LABELS[subject] ?? subject.replaceAll('_', ' ');
}

const subjectOrder = new Map(Object.keys(SUBJECT_LABELS).map((subject, index) => [subject, index]));

export const AVATAR_GROUPS: readonly {
  key: string;
  label: string;
  options: readonly { key: AvatarKey; label: string }[];
}[] = STYLES.map((style) => ({
  key: style.key,
  label: style.label,
  options: AVAILABLE_AVATAR_KEYS
    .filter((key) => style.suffix ? key.endsWith(style.suffix) : !/_(punk|pixel)$/.test(key))
    .sort((left, right) => (subjectOrder.get(subjectFor(left)) ?? 999) - (subjectOrder.get(subjectFor(right)) ?? 999))
    .map((key) => ({ key, label: labelFor(key) }))
})).filter((group) => group.options.length > 0);
