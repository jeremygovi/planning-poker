// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrainArt } from '../../src/client/components/TrainArt.js';

describe('TrainArt', () => {
  it('reste décoratif pour les lecteurs d’écran', () => {
    const { container } = render(<><TrainArt value="8" /><span>Carte 8</span></>);
    expect(screen.getByText('Carte 8')).toBeVisible();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
