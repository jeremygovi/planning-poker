import type { AvatarKey } from '../../shared/types.js';
import { AVATAR_SOURCES } from '../avatar-assets.js';

type AvatarSize = 'small' | 'medium' | 'large';

export function Avatar({ avatar, avatarImage, size = 'medium' }: {
  avatar: AvatarKey;
  avatarImage?: string | null;
  size?: AvatarSize;
}) {
  const source = avatarImage ?? AVATAR_SOURCES[avatar] ?? AVATAR_SOURCES.train;
  return (
    <span className={`avatar-art avatar-${size}${avatarImage ? ' avatar-custom' : ''}`} aria-hidden="true">
      <img src={source} alt="" draggable={false} />
    </span>
  );
}
