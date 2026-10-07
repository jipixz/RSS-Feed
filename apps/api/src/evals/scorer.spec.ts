// Tests del verificador de evaluación. Son los que corren en CI: el LLM no
// participa aquí, se prueban las reglas con textos escritos a mano.

import { aggregate, countWords, hasSourcing, hasUncertainty, preservesAttribution, scoreOne } from './scorer';

describe('detección de marcadores', () => {
  it('reconoce atribución a una fuente', () => {
    expect(hasSourcing('Según un reporte, los agentes atacaron RubyGems.')).toBe(true);
    expect(hasSourcing('OpenAI investiga si sus agentes participaron.')).toBe(true);
    expect(hasSourcing('Agencias de EE. UU. acusan a varias firmas.')).toBe(true);
  });

  it('reconoce incertidumbre sobre el hecho', () => {
    expect(hasUncertainty('El presunto responsable sigue libre.')).toBe(true);
    expect(hasUncertainty('Los agentes podrían haber robado claves.')).toBe(true);
    expect(hasUncertainty('Al parecer el ataque vino de dentro.')).toBe(true);
  });

  it('NO confunde capacidad técnica con duda', () => {
    // "podría permitir" describe lo que hace la falla, no pone en duda el hecho
    const s = 'Una vulnerabilidad crítica de vCenter podría permitir la ejecución remota de código.';
    expect(hasUncertainty(s)).toBe(false);
  });

  it('una afirmación rotunda no tiene ningún marcador', () => {
    expect(preservesAttribution('Agentes de IA de OpenAI atacaron RubyGems.')).toBe(false);
  });

  // Regresión: con \b de JavaScript, /\breportó\b/ NO casa con "reportó"
  // porque la "ó" no cuenta como carácter de palabra.
  it('detecta verbos acentuados en pretérito', () => {
    expect(hasSourcing('Una agencia japonesa reportó una brecha de datos.')).toBe(true);
    expect(hasSourcing('La fiscalía acusó a dos personas.')).toBe(true);
    expect(hasSourcing('El informe atribuyó el ataque a un grupo estatal.')).toBe(true);
    expect(hasSourcing('El estudio sugirió que el Sol engulló un planeta.')).toBe(true);
  });

  it('detecta verbos de atribución indirecta', () => {
    expect(hasSourcing('Investigadores sugieren que los agentes atacaron RubyGems.')).toBe(true);
    expect(hasSourcing('Los datos indican que el fallo ya se explota.')).toBe(true);
  });

  it('no casa con palabras que solo contienen el marcador', () => {
    expect(hasSourcing('El reportero publicó la nota.')).toBe(false);
    expect(hasUncertainty('La supuestamente no existe aquí')).toBe(true); // control positivo
  });
});

describe('scoreOne', () => {
  it('aprueba un caso atribuido que conserva la atribución', () => {
    const r = scoreOne('Investigadores reportan que los agentes podrían haber atacado RubyGems.', 'attributed');
    expect(r.pass).toBe(true);
    expect(r.attribution).toBe(true);
  });

  it('reprueba un caso atribuido afirmado como hecho', () => {
    const r = scoreOne('Agentes de OpenAI orquestaron un ataque a RubyGems.', 'attributed');
    expect(r.pass).toBe(false);
    expect(r.attribution).toBe(false);
  });

  it('aprueba un hecho confirmado afirmado sin rodeos', () => {
    const r = scoreOne('Cisco publicó parches para un zero-day ya explotado en ataques.', 'factual');
    expect(r.pass).toBe(true);
    expect(r.falseHedge).toBe(false);
  });

  it('reprueba un hecho confirmado al que se le meten matices', () => {
    const r = scoreOne('Cisco presuntamente habría publicado parches para un supuesto fallo.', 'factual');
    expect(r.pass).toBe(false);
    expect(r.falseHedge).toBe(true);
  });

  it('atribuir a una fuente NO penaliza un hecho confirmado', () => {
    // el prompt permite "según CISA" cuando el hecho sí está confirmado
    const r = scoreOne('Según CISA, bandas de ransomware ya explotan la falla de VMware.', 'factual');
    expect(r.pass).toBe(true);
  });

  it('mide longitud y detecta preámbulo', () => {
    expect(countWords('una dos tres')).toBe(3);
    expect(scoreOne('Aquí está el resumen: Cisco parchó el fallo.', 'factual').preamble).toBe(true);
    expect(scoreOne('Cisco parchó el fallo.', 'factual').preamble).toBe(false);
    expect(scoreOne(`${'palabra '.repeat(50)}`, 'factual').withinLimit).toBe(false);
  });
});

describe('aggregate', () => {
  it('calcula las tasas por grupo', () => {
    const agg = aggregate([
      { label: 'attributed', score: scoreOne('Según un reporte, hubo un ataque.', 'attributed') },
      { label: 'attributed', score: scoreOne('Hubo un ataque.', 'attributed') },
      { label: 'factual', score: scoreOne('Apple publicó 200 parches.', 'factual') },
      { label: 'factual', score: scoreOne('Apple supuestamente publicó parches.', 'factual') },
    ]);
    expect(agg.n).toBe(4);
    expect(agg.attributionRate).toBe(0.5); // 1 de 2
    expect(agg.falseHedgeRate).toBe(0.5); // 1 de 2
    expect(agg.lengthCompliance).toBe(1);
  });

  it('no divide entre cero si falta un grupo', () => {
    const agg = aggregate([{ label: 'factual', score: scoreOne('Java 27 ya está disponible.', 'factual') }]);
    expect(agg.attributionRate).toBe(1);
    expect(agg.nAttributed).toBe(0);
  });
});
