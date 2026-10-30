import { describe, expect, it } from 'vitest';
import { clampWin, zoomAt } from '../../ui/zoom';

describe('escala dos gráficos', () => {
  it('aproxima à volta do ponto dos dedos', () => {
    expect(zoomAt([0, 100], 0.5, 0.5)).toEqual([25, 75]);
    expect(zoomAt([0, 100], 0, 0.5)).toEqual([0, 50]);
  });
  it('nunca sai dos dados nem fica mais estreita que o mínimo', () => {
    expect(clampWin([-10, 20], 0, 100, 5)).toEqual([0, 30]);
    expect(clampWin([90, 120], 0, 100, 5)).toEqual([70, 100]);
    expect(clampWin([50, 51], 0, 100, 5)).toEqual([48, 53]);
    expect(clampWin([-50, 300], 0, 100, 5)).toEqual([0, 100]);
  });
});
