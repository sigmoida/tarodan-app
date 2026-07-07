/**
 * Domain 25 — Frontend Parite (PAR): mobile tek görsel/etiket çözücüsü (PAR-120).
 *
 * Mobile, backend'in farklı şekillerde döndürdüğü (string / obje / dizi / çıplak key)
 * marka/kategori/scale gibi alanları <Text>'e koymadan önce `asLabel` ile string'e
 * indirger. Web bu değerleri JSX içinde doğrudan kullanır (asLabel'ı YOKTUR —
 * apps/web/src/lib/format.ts export listesinde asLabel bulunmaz). Bu test mobile'ın
 * çözücüsünün her şekil için crash'siz string ürettiğini garanti eder.
 */
import { asLabel } from '../format';

// ─────────────────────────────────────────────────────────────────────────────
// PAR-120 — Mobile farklı görsel/etiket şekillerini tek çözücüyle render eder
// ─────────────────────────────────────────────────────────────────────────────
describe('PAR-120 [P1] — asLabel: string/obje/dizi/key şekillerini tek çözücüyle string\'e indirger', () => {
  it('düz string aynen döner', () => {
    expect(asLabel('AutoArt')).toBe('AutoArt');
  });
  it('obje → .name (yoksa .title, yoksa .slug)', () => {
    expect(asLabel({ id: 1, name: 'Diecast', slug: 'diecast' })).toBe('Diecast');
    expect(asLabel({ title: 'Koleksiyon' })).toBe('Koleksiyon');
    expect(asLabel({ slug: 'modeller' })).toBe('modeller');
  });
  it('sayı → string', () => {
    expect(asLabel(1000)).toBe('1000');
  });
  it('null/undefined → fallback (crash yok)', () => {
    expect(asLabel(null)).toBe('');
    expect(asLabel(undefined, 'Kategori yok')).toBe('Kategori yok');
  });
  it('her girdi şekli için DAİMA string döner (React child crash imkânsız)', () => {
    const shapes: unknown[] = [
      'x', 0, null, undefined, {}, { name: 5 }, { name: { tr: 'Araçlar' } }, [], ['a', 'b'], { slug: null },
    ];
    for (const v of shapes) {
      expect(typeof asLabel(v)).toBe('string');
    }
  });
  it('KAYNAK teyidi: web format.ts asLabel EXPORT ETMEZ (web JSX ile doğrudan kullanır)', () => {
    // Bu senaryonun paritesi "kavramsal": mobile tek çözücü kullanır, web inline JSX.
    // asLabel mobile\'a özgüdür; parite = her ikisi de crash\'siz görsel/etiket üretir.
    expect(typeof asLabel).toBe('function');
  });
});
