import { describe, expect, it } from 'vitest';
import { arrange, parseHidden, prune, type NowItem } from '../now';

const it_ = (key: string, rank: number, due?: string): NowItem => ({ key, rank, due, t: key, s: '' });

describe('Agora', () => {
  it('ordena por urgência e depois pela data', () => {
    const r = arrange([it_('compras', 6), it_('iuc', 2, '2026-11-30'), it_('luz', 1, '2026-10-30'), it_('seguro', 2, '2026-11-08')], {});
    expect(r.shown.map((i) => i.key)).toEqual(['luz', 'seguro', 'iuc', 'compras']);
  });
  it('esconde os dispensados; o mesmo aviso com outra chave volta', () => {
    const hidden = { 'dl:a:2026-11-30': '2026-10-29' };
    expect(arrange([it_('dl:a:2026-11-30', 2)], hidden).shown).toHaveLength(0);
    expect(arrange([it_('dl:a:2027-11-30', 2)], hidden).shown).toHaveLength(1);
    expect(arrange([it_('dl:a:2026-11-30', 2)], hidden).hiddenKeys).toEqual(['dl:a:2026-11-30']);
  });
  it('esquece dispensas antigas e lê com cuidado', () => {
    expect(prune({ a: '2026-07-01', b: '2026-10-20' }, '2026-10-29')).toEqual({ b: '2026-10-20' });
    expect(parseHidden('lixo')).toEqual({});
    expect(parseHidden('[1]')).toEqual({});
    expect(parseHidden(null)).toEqual({});
  });
});
