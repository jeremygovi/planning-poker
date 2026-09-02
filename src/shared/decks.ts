import type { DeckDefinition, DeckKey } from './types.js';

export const ABSTAIN_VALUE = 'abstain';

export const DECKS: Record<DeckKey, DeckDefinition> = {
  fibonacci: {
    key: 'fibonacci',
    values: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89'],
    numeric: true
  },
  scrum: {
    key: 'scrum',
    values: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100'],
    numeric: true
  },
  powers: {
    key: 'powers',
    values: ['0', '1', '2', '4', '8', '16', '32', '64'],
    numeric: true
  },
  tshirt: {
    key: 'tshirt',
    values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    numeric: false
  }
};

export function isDeckKey(value: unknown): value is DeckKey {
  return typeof value === 'string' && value in DECKS;
}

export function parseDeckNumber(value: string): number {
  return value === '½' ? 0.5 : Number(value);
}

