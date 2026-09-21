/**
 * @fileoverview Política sectorial de ajustes contables del bloque de Ventas.
 * Determina si la amortización recurrente de intangibles, el deterioro de
 * intangibles y el deterioro de fondo de comercio se suman de vuelta en la
 * columna Ajustado según el sector.
 * @module agents/analyst/sectorPolicy
 */

export const DEFAULT_SECTOR_POLICY = {
  intangibleAmortizationAddBack: true,
  goodwillImpairmentAddBack: true,
  intangibleImpairmentAddBack: true,
};

// Los dos sectores de consumo (defensivo y discrecional) comparten EXACTAMENTE la
// misma política: el cálculo determinista de la columna Ajustado es idéntico en ambos.
const CONSUMER_ADD_BACK_POLICY = {
  intangibleAmortizationAddBack: true,
  goodwillImpairmentAddBack: true,
  intangibleImpairmentAddBack: true,
};

export const SECTOR_POLICIES = {
  defensive_consumer: CONSUMER_ADD_BACK_POLICY,
  consumer_discretionary: CONSUMER_ADD_BACK_POLICY,
  technology: {
    // La amortización recurrente de intangibles de vida finita (tecnología
    // desarrollada, relaciones con clientes, software comprado) es el desgaste
    // anual real del activo que sostiene el producto: permanece como coste,
    // igual que el SBC. No se suma de vuelta.
    intangibleAmortizationAddBack: false,
    // El deterioro de fondo de comercio es puntual (una compra sobrepagada),
    // no desgaste anual: se suma de vuelta con nota.
    goodwillImpairmentAddBack: true,
    // El deterioro de intangibles, marcas u otros activos (no fondo de comercio)
    // es el desgaste real del producto intangible en este sector: permanece
    // como coste y no se revierte, igual que su amortización recurrente.
    intangibleImpairmentAddBack: false,
  },
};

export function getSectorPolicy(sector) {
  return SECTOR_POLICIES[sector] ?? DEFAULT_SECTOR_POLICY;
}

// Política de inferencia de la fila "Deuda asumida (no-cash)" de Asignación de Capital.
// Por defecto se mantiene el comportamiento clásico (una adquisición material con divergencia
// entre la variación de deuda del balance y el flujo de deuda del estado de flujos). En consumo
// discrecional se exige además evidencia de compra de negocio y una divergencia moderada: en
// retail y comercio electrónico la línea de "adquisiciones" incluye a menudo inversiones en
// valores no negociables o participaciones (p. ej. Anthropic y OpenAI en AMZN 2026-Q2) que no
// conllevan deuda asumida y generaban una fila inventada de 50.758M que rompía el cuadre.
const DEFAULT_ASSUMED_DEBT_POLICY = {
  requireBusinessAcquisitionEvidence: false,
  preferSystemDebtCash: false,
  maxDebtDeltaRatio: 0.85,
};

const ASSUMED_DEBT_POLICIES = {
  consumer_discretionary: {
    requireBusinessAcquisitionEvidence: true,
    preferSystemDebtCash: true,
    maxDebtDeltaRatio: 0.5,
  },
};

export function getAssumedDebtPolicy(sector) {
  return ASSUMED_DEBT_POLICIES[sector] ?? DEFAULT_ASSUMED_DEBT_POLICY;
}

// Una descripción que solo habla de valores, preferentes o participaciones financieras no
// identifica una empresa adquirida: sin compra de negocio no puede haber deuda asumida.
const INVESTMENT_DESCRIPTION_PATTERN = /marketable|non-?marketable|valores negociables|no negociables|preferred stock|acciones preferentes|participaciones preferentes|equity securities|convertible notes|notas convertibles/i;

export function isBusinessAcquisitionDescription(description) {
  const text = String(description ?? '').trim();
  if (!text) return false;
  return !INVESTMENT_DESCRIPTION_PATTERN.test(text);
}

export function shouldAddBackIntangibleAmortization(sector) {
  return getSectorPolicy(sector).intangibleAmortizationAddBack;
}

export function shouldAddBackGoodwillImpairment(sector) {
  return getSectorPolicy(sector).goodwillImpairmentAddBack;
}

export function shouldAddBackIntangibleImpairment(sector) {
  return getSectorPolicy(sector).intangibleImpairmentAddBack;
}

function factNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Lee el desglose de deterioros (goodwill + intangibles) de la extracción.
 * Devuelve null cuando la extracción no trae el desglose y solo hay total agregado.
 * @param {object} facts - Bloque "facts" de la extracción.
 * @param {string} suffix - 'Quarter' | 'PrevQuarter' | 'Ytd' | 'PrevYtd'.
 * @returns {{goodwill: number, intangible: number}|null}
 */
export function readImpairmentSplit(facts, suffix) {
  const source = facts ?? {};
  const goodwill = factNumber(source[`goodwillImpairment${suffix}`]);
  const intangible = factNumber(source[`intangibleImpairment${suffix}`]);
  if (goodwill == null && intangible == null) return null;
  return { goodwill: goodwill ?? 0, intangible: intangible ?? 0 };
}

/**
 * Importe de deterioro que se suma de vuelta en la columna Ajustado según la
 * política del sector. Con desglose aplica solo las partes ajustables; con el
 * total agregado "impairments*" solo se ajusta si el sector suma ambas partes.
 * @param {object} facts - Bloque "facts" de la extracción.
 * @param {string} suffix - 'Quarter' | 'PrevQuarter' | 'Ytd' | 'PrevYtd'.
 * @param {object} policy - Política sectorial.
 * @returns {number}
 */
export function resolveImpairmentAddBack(facts, suffix, policy) {
  const split = readImpairmentSplit(facts, suffix);
  if (split) {
    return (policy.goodwillImpairmentAddBack ? split.goodwill : 0)
      + (policy.intangibleImpairmentAddBack ? split.intangible : 0);
  }
  const total = factNumber(facts?.[`impairments${suffix}`]);
  if (total == null) return 0;
  if (policy.goodwillImpairmentAddBack && policy.intangibleImpairmentAddBack) return total;
  // Sin desglose y con una sola parte ajustable no puede atribuirse el total con
  // certeza: no se ajusta (criterio conservador). El extractor separa goodwill e
  // intangibles en "goodwillImpairment*" / "intangibleImpairment*".
  return 0;
}

/**
 * Importe de deterioro de intangibles que la política sectorial mantiene como
 * coste (no revertido). Solo puede cuantificarse cuando la extracción trae el
 * desglose.
 * @param {object} facts - Bloque "facts" de la extracción.
 * @param {string} suffix - 'Quarter' | 'PrevQuarter' | 'Ytd' | 'PrevYtd'.
 * @param {object} policy - Política sectorial.
 * @returns {number}
 */
export function resolveExcludedIntangibleImpairment(facts, suffix, policy) {
  if (policy.intangibleImpairmentAddBack) return 0;
  return readImpairmentSplit(facts, suffix)?.intangible ?? 0;
}

/**
 * Importe del total agregado "impairments*" que no se suma de vuelta cuando la
 * extracción no trae desglose y la política solo ajusta una parte. Se usa para
 * revertir de la columna Ajustado un deterioro que el modelo hubiera sumado.
 * @param {object} facts - Bloque "facts" de la extracción.
 * @param {string} suffix - 'Quarter' | 'PrevQuarter' | 'Ytd' | 'PrevYtd'.
 * @param {object} policy - Política sectorial.
 * @returns {number}
 */
export function resolveDiscardedImpairment(facts, suffix, policy) {
  if (readImpairmentSplit(facts, suffix)) return 0;
  const total = factNumber(facts?.[`impairments${suffix}`]);
  if (total == null) return 0;
  if (policy.goodwillImpairmentAddBack && policy.intangibleImpairmentAddBack) return 0;
  return Math.abs(total);
}

/**
 * Construye la directiva de política sectorial que se inyecta en el prompt del
 * analista para que aplique los ajustes del bloque de Ventas según el sector.
 * @param {string} sector - Identificador del sector.
 * @returns {string}
 */
export function buildSectorPolicyDirective(sector) {
  const policy = getSectorPolicy(sector);
  const lines = [
    `POLÍTICA SECTORIAL DE AJUSTES DEL BLOQUE 1 (VENTAS) — sector "${sector}":`,
  ];

  if (policy.intangibleAmortizationAddBack) {
    lines.push('- Amortización recurrente de intangibles: SÍ se suma de vuelta en la columna Ajustado (Beneficio Operativo), con su nota al pie.');
  } else {
    lines.push('- Amortización recurrente de intangibles (tecnología desarrollada, relaciones con clientes, software comprado, patentes): NO se suma de vuelta en la columna Ajustado. Permanece como coste, porque refleja el desgaste anual real del activo, igual que el SBC. Queda prohibido añadir la partida "intangiblesAmortization*" de la extracción a la columna Ajustado (sin otros ajustes, el Beneficio Operativo Ajustado coincide con el Normal).');
  }

  if (policy.goodwillImpairmentAddBack) {
    lines.push('- Deterioro de fondo de comercio ("goodwillImpairment*"): SÍ se suma de vuelta en la columna Ajustado (periodo actual y "Anterior Ajustado"), con su nota al pie (*1).');
  } else {
    lines.push('- Deterioro de fondo de comercio ("goodwillImpairment*"): NO se suma de vuelta; se refleja como coste del periodo.');
  }

  if (policy.intangibleImpairmentAddBack) {
    lines.push('- Deterioro de intangibles de vida definida/indefinida, marcas u otros activos ("intangibleImpairment*", excluye fondo de comercio): SÍ se suma de vuelta en la columna Ajustado (periodo actual y "Anterior Ajustado").');
  } else {
    lines.push('- Deterioro de intangibles de vida definida/indefinida, marcas u otros activos ("intangibleImpairment*", excluye fondo de comercio): NO se suma de vuelta. Permanece como coste en la columna Ajustado porque el desgaste del producto intangible es real en este sector, igual que su amortización recurrente. Queda prohibido revertirlo, ajustarlo a 0 o restarlo; no genera resalte ni llamada de nota propia (puede explicarse en una nota informativa que se mantiene como coste).');
  }

  if (!policy.goodwillImpairmentAddBack && !policy.intangibleImpairmentAddBack) {
    lines.push('- La partida agregada "impairments*" (si viniera sin desglosar) no se suma de vuelta.');
  } else if (!(policy.goodwillImpairmentAddBack && policy.intangibleImpairmentAddBack)) {
    lines.push('- La partida agregada "impairments*" (si viniera sin desglosar) es informativa: solo se ajusta la parte correspondiente a las categorías que la política suma de vuelta, y el extractor entrega ese desglose en "goodwillImpairment*" / "intangibleImpairment*".');
  }

  return lines.join('\n');
}
