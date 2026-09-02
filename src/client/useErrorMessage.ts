import { useMemo } from 'react';
import { ApiClientError } from './api.js';
import { errorTranslationKey, type TFunction } from './i18n.js';

export function useErrorMessage(t: TFunction) {
  return useMemo(
    () => (error: unknown) => t(errorTranslationKey(error instanceof ApiClientError ? error.code : '')),
    [t]
  );
}
