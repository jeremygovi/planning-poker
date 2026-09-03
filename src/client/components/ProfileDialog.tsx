import { useState } from 'react';
import type { AvatarKey, UserProfile } from '../../shared/types.js';
import { ApiClientError } from '../api.js';
import { errorTranslationKey, type TFunction } from '../i18n.js';
import { avatarImageFromFile } from '../profile.js';
import { Avatar } from './Avatar.js';
import { AVATAR_OPTIONS } from './avatar-options.js';

export function ProfileDialog({ initial, required = false, t, onSave, onClose }: {
  initial: UserProfile | null;
  required?: boolean;
  t: TFunction;
  onSave: (profile: UserProfile) => Promise<void>;
  onClose?: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [avatar, setAvatar] = useState<AvatarKey>(initial?.avatar ?? 'train');
  const [avatarImage, setAvatarImage] = useState<string | null>(initial?.avatarImage ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="modal-backdrop profile-backdrop" role="presentation" onMouseDown={(event) => {
      if (!required && event.target === event.currentTarget) onClose?.();
    }}>
      <section className="modal-card profile-card" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-heading"><div><p className="eyebrow">{t('profileEyebrow')}</p><h2 id="profile-title">{initial ? t('editProfile') : t('profileTitle')}</h2></div>{!required && <button className="icon-button" onClick={onClose} aria-label={t('close')} type="button">×</button>}</div>
        <p className="profile-intro">{t('profileIntro')}</p>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave({ displayName: displayName.trim(), avatar, avatarImage });
          } catch (reason) {
            setError(t(errorTranslationKey(reason instanceof ApiClientError ? reason.code : '')));
          } finally {
            setBusy(false);
          }
        }}>
          <label>{t('displayName')}<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required /></label>
          <fieldset className="avatar-choice profile-avatar-choice"><legend>{t('avatar')}</legend><div>{AVATAR_OPTIONS.map((option) => <label className={!avatarImage && avatar === option.key ? 'selected' : ''} key={option.key} title={option.label}><input type="radio" name="profile-avatar" value={option.key} checked={!avatarImage && avatar === option.key} onChange={() => { setAvatar(option.key); setAvatarImage(null); }} /><Avatar avatar={option.key} size="large" /><span className="sr-only">{option.label}</span></label>)}</div></fieldset>
          <div className={`custom-avatar-picker ${avatarImage ? 'selected' : ''}`}>
            <Avatar avatar={avatar} avatarImage={avatarImage} size="large" />
            <div><strong>{t('profilePhoto')}</strong><small>{t('profilePhotoHelp')}</small></div>
            <label className="button button-ghost" htmlFor="profile-photo">{t('uploadPhoto')}<input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setError('');
              try { setAvatarImage(await avatarImageFromFile(file)); }
              catch { setError(t('errorAvatarFile')); }
              finally { input.value = ''; }
            }} /></label>
            {avatarImage && <button className="button button-ghost" type="button" onClick={() => setAvatarImage(null)}>{t('removePhoto')}</button>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">{!required && <button className="button button-ghost" type="button" onClick={onClose}>{t('cancel')}</button>}<button className="button button-primary" disabled={busy} type="submit">{t('saveProfile')}</button></div>
        </form>
      </section>
    </div>
  );
}
