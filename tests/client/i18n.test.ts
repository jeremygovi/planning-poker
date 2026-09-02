import { describe, expect, it } from 'vitest';
import { errorTranslationKey, translate } from '../../src/client/i18n.js';

describe('i18n', () => {
  it('traduit les textes et les variables en français et en anglais', () => {
    expect(translate('fr', 'peopleOnline', { count: 3 })).toBe('3 à bord');
    expect(translate('en', 'peopleOnline', { count: 3 })).toBe('3 aboard');
  });

  it('retombe sur une erreur générique', () => {
    expect(errorTranslationKey('UNKNOWN')).toBe('errorGeneric');
    expect(errorTranslationKey('INVALID_STORY_TITLE')).toBe('errorINVALID_STORY_TITLE');
  });
});
