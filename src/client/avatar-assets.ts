import type { AvatarKey } from '../shared/types.js';

const avatarModules = import.meta.glob('./assets/avatars/*.png', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>;

export const AVATAR_SOURCES: Readonly<Record<AvatarKey, string>> = Object.freeze(Object.fromEntries(
  Object.entries(avatarModules).map(([path, source]) => {
    const filename = path.split('/').at(-1);
    if (!filename) throw new Error(`Invalid avatar asset path: ${path}`);
    return [filename.replace(/\.png$/, ''), source];
  })
));

export const AVAILABLE_AVATAR_KEYS: readonly AvatarKey[] = Object.freeze(Object.keys(AVATAR_SOURCES).sort());

if (!AVATAR_SOURCES.train) throw new Error('The fallback avatar train.png is missing');
