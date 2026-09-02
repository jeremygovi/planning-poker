import { DECKS, parseDeckNumber } from '../../shared/decks.js';
import type { DeckKey } from '../../shared/types.js';

export interface EstimationResult {
  suggestion: string | null;
  unanimous: boolean;
}

function formatAverage(value: number): string {
  return String(Math.round((value + Number.EPSILON) * 100) / 100);
}

export function calculateEstimation(deckKey: DeckKey, values: string[]): EstimationResult {
  if (values.length === 0) return { suggestion: null, unanimous: false };

  const frequencies = new Map<string, number>();
  for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);

  const counts = [...frequencies.entries()].sort((left, right) => right[1] - left[1]);
  const highestCount = counts[0]?.[1] ?? 0;
  const leaders = counts.filter(([, count]) => count === highestCount);
  const unanimous = values.length >= 2 && frequencies.size === 1;

  if (leaders.length === 1) {
    return { suggestion: leaders[0][0], unanimous };
  }

  const deck = DECKS[deckKey];
  if (deck.numeric) {
    const average = values.reduce((sum, value) => sum + parseDeckNumber(value), 0) / values.length;
    return { suggestion: formatAverage(average), unanimous: false };
  }

  const ordered = values
    .map((value) => deck.values.indexOf(value))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  if (ordered.length === 0) return { suggestion: null, unanimous: false };
  const medianIndex = ordered[Math.floor(ordered.length / 2)];
  return { suggestion: deck.values[medianIndex], unanimous: false };
}

