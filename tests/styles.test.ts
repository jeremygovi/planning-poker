import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('styles adaptatifs et accessibles', () => {
  const css = readFileSync(path.resolve('src/client/styles.css'), 'utf8');

  it('prévoit des focus visibles et des mises en page mobiles', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/@media \(max-width: 650px\)/);
    expect(css).toMatch(/@media \(max-width: 390px\)/);
    expect(css).toContain('.poker-table-shell');
    expect(css).toContain('.estimate-dock');
    expect(css).toContain('.voted .card-back');
    expect(css).toContain('.is-revealed .card-inner');
    expect(css).toContain('rotateY(180deg)');
  });

  it('désactive les animations quand les mouvements sont réduits', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toContain('animation-duration: .01ms');
  });
});
