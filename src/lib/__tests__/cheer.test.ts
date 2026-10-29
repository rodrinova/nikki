import { describe, expect, it } from 'vitest';
import { CHEERS, DONE, greeting, ofDay, pickCheer, type CheerMemory } from '../cheer';

describe('mensagem de boas-vindas', () => {
  it('no mesmo dia, a mesma; noutro dia, outra', () => {
    const a = pickCheer('2026-10-29', null);
    expect(pickCheer('2026-10-29', a)).toEqual(a);
    expect(pickCheer('2026-11-01', a).idx).not.toBe(a.idx);
  });
  it('não repete até usar todas, e não repete a de ontem ao recomeçar', () => {
    let m: CheerMemory | null = null;
    const seen = new Set<number>();
    for (let d = 1; d <= CHEERS.length; d++) { m = pickCheer(`2027-01-${String(d).padStart(2, '0')}`, m); seen.add(m.idx); }
    expect(seen.size).toBe(CHEERS.length);
    const next = pickCheer('2027-02-15', m);
    expect(next.idx).not.toBe(m!.idx);
    expect(next.used.length).toBe(2);
  });
  it('sem palavras com género e na 3.ª pessoa (sem «tu»)', () => {
    for (const c of [...CHEERS, ...DONE]) {
      expect(c).not.toMatch(/\b(obrigada|cansad[ao]|sozinh[ao]|bem-vind[ao]|dedicad[ao]|incansável|tê-l[ao]|vê-l[ao])\b/i);
      expect(c).not.toMatch(/\b(tu|ti|te|teu|tua|teus|tuas|contigo|fazes|estás|passas|precisares|tens)\b|-te\b/i);
    }
  });
  it('saudação pela hora', () => {
    expect([greeting(8), greeting(15), greeting(22)]).toEqual(['Bom dia', 'Boa tarde', 'Boa noite']);
  });
});

describe('escrito por gente', () => {
  it('sem travessões nem frases feitas de máquina', () => {
    for (const c of [...CHEERS, ...DONE]) expect(c).not.toMatch(/—|–|brilhar|incrível jornada|não hesite|estamos aqui para/i);
  });
  it('a mensagem de «tudo feito» muda de dia para dia', () => {
    expect(new Set(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((d) => ofDay(DONE, d))).size).toBeGreaterThan(1);
  });
});
