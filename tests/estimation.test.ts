import { describe, expect, it } from 'vitest';
import { calculateEstimation } from '../src/server/core/estimation.js';

describe('calculateEstimation', () => {
  it('detecte une unanimité avec au moins deux votes', () => {
    expect(calculateEstimation('scrum', ['5', '5', '5'])).toEqual({ suggestion: '5', unanimous: true });
    expect(calculateEstimation('scrum', ['5'])).toEqual({ suggestion: '5', unanimous: false });
  });

  it('propose la valeur la plus fréquente', () => {
    expect(calculateEstimation('fibonacci', ['3', '5', '5', '8'])).toEqual({ suggestion: '5', unanimous: false });
  });

  it('calcule la moyenne lors d’une égalité numérique', () => {
    expect(calculateEstimation('scrum', ['1', '3', '8'])).toEqual({ suggestion: '4', unanimous: false });
    expect(calculateEstimation('scrum', ['½', '1'])).toEqual({ suggestion: '0.75', unanimous: false });
    expect(calculateEstimation('powers', ['2', '2', '8', '8'])).toEqual({ suggestion: '5', unanimous: false });
  });

  it('utilise la médiane supérieure pour les tailles T-shirt', () => {
    expect(calculateEstimation('tshirt', ['XS', 'M', 'XXL'])).toEqual({ suggestion: 'M', unanimous: false });
    expect(calculateEstimation('tshirt', ['S', 'XL'])).toEqual({ suggestion: 'XL', unanimous: false });
  });

  it('ne propose rien sans vote exprimé', () => {
    expect(calculateEstimation('scrum', [])).toEqual({ suggestion: null, unanimous: false });
  });
});

