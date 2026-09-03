import type { AvatarKey, UserProfile } from '../shared/types.js';

export const PROFILE_STORAGE_KEY = 'poker-express-profile';
const MEMBERSHIP_STORAGE_PREFIX = 'poker-express-membership:';
const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024;
const AVATAR_KEYS = new Set<AvatarKey>([
  'train', 'rocket', 'robot', 'fox', 'owl', 'cat', 'cactus', 'comet', 'frog', 'panda', 'alien', 'pirate'
]);

export function readStoredProfile(): UserProfile | null {
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<UserProfile>;
    if (
      typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.trim().length > 40 ||
      typeof value.avatar !== 'string' || !AVATAR_KEYS.has(value.avatar as AvatarKey) ||
      !(value.avatarImage === null || value.avatarImage === undefined || isSupportedAvatarImage(value.avatarImage))
    ) return null;
    return {
      displayName: value.displayName.trim(),
      avatar: value.avatar as AvatarKey,
      avatarImage: value.avatarImage ?? null
    };
  } catch {
    return null;
  }
}

export function storeProfile(profile: UserProfile): void {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function storedMemberships(): { key: string; slug: string; token: string }[] {
  const memberships: { key: string; slug: string; token: string }[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(MEMBERSHIP_STORAGE_PREFIX)) continue;
    const token = window.localStorage.getItem(key);
    if (token) memberships.push({ key, slug: key.slice(MEMBERSHIP_STORAGE_PREFIX.length), token });
  }
  return memberships;
}

export function profileMatches(
  profile: UserProfile,
  participant: { displayName: string; avatar: AvatarKey; avatarImage: string | null }
): boolean {
  return profile.displayName === participant.displayName &&
    profile.avatar === participant.avatar &&
    profile.avatarImage === participant.avatarImage;
}

export async function avatarImageFromFile(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('INVALID_AVATAR_FILE');
  }
  const image = await loadImage(await readFileAsDataUrl(file));
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('INVALID_AVATAR_FILE');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  if (dataUrl.length > 48_000) throw new Error('INVALID_AVATAR_FILE');
  return dataUrl;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('INVALID_AVATAR_FILE'));
    reader.onerror = () => reject(new Error('INVALID_AVATAR_FILE'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('INVALID_AVATAR_FILE'));
    image.src = source;
  });
}

function isSupportedAvatarImage(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 48_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
