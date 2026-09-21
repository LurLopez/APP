/**
 * @fileoverview Comprobaciones deterministas del informe del analista para el agente auditor de QA.
 * @module agents/auditor/deterministicChecks
 */

const SALES_ROWS = ['ventas', 'beneficio bruto', 'beneficio operativo', 'ebt', 'beneficio neto'];
const CASH_ROWS = ['cash flow', 'capex', 'fcf', 'fcf/acción', 'dividendo', 'libre'];

export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const input = String(value).trim();
  if (!input || input === '—' || input === '-') return null;
  const match = input.replace(/\s/g, '').match(/-?\d[\d.,]*/);
  if (!match) return null;
  let raw = match[0];
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    raw = lastComma > lastDot ? raw.replaceAll('.', '').replace(',', '.') : raw.replaceAll(',', '');
  } else if (lastComma !== -1) {
    const decimals = raw.length - lastComma - 1;
    raw = decimals === 3 ? raw.replace(',', '') : raw.replace(',', '.');
  } else if (lastDot !== -1) {
    const decimals = raw.length - lastDot - 1;
    if (decimals === 3) raw = raw.replace('.', '');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(text) {
  return String(text ?? '').trim().toLowerCase();
}

function rowByName(rows, name) {
  return (rows ?? []).find((row) => normalize(row.name).startsWith(name));
}

function pctDiff(shown, computed) {
  if (shown === null || computed === null) return null;
  return Math.abs(shown - computed);
}

function push(findings, level, check, detail) {
  findings.push({ level, check, detail });
}

function checkSales(horizon, findings) {
  const rows = horizon?.sales?.rows ?? [];
  const names = rows.map((row) => normalize(row.name));
  SALES_ROWS.forEach((name, index) => {
    if (!names[index] || !names[index].startsWith(name)) {
      push(findings, 'fail', `ventas.fila_${index + 1}`, `Se esperaba «${name}» en la posición ${index + 1} y aparece «${rows[index]?.name ?? 'nada'}».`);
    }
  });
  if (rows.length !== SALES_ROWS.length) {
    push(findings, 'warn', 'ventas.num_filas', `La tabla de ventas tiene ${rows.length} filas (se esperan ${SALES_ROWS.length}).`);
  }
  for (const row of rows) {
    const normal = parseNumber(row.normal);
    const prevNormal = parseNumber(row.prevNormal);
    const adjusted = parseNumber(row.adjusted);
    const prevAdjusted = parseNumber(row.prevAdjusted);
    if (normal !== null && prevNormal !== null && prevNormal !== 0) {
      const computed = ((normal - prevNormal) / Math.abs(prevNormal)) * 100;
      const shownN = parseNumber(row.pctNormal);
      if (shownN !== null && pctDiff(shownN, computed) > 0.12) {
        push(findings, 'fail', 'ventas.pctNormal', `${row.name}: % Normal mostrado ${row.pctNormal} pero calculado ${computed.toFixed(2)} %.`);
      }
    }
    if (row.prevNormal && row.prevNormal !== '—' && !row.prevAdjusted) {
      push(findings, 'warn', 'ventas.prevAdjusted', `${row.name}: falta «Anterior Ajustado» habiendo comparativo previo.`);
    }
    if (adjusted !== null && prevAdjusted !== null && prevAdjusted !== 0 && row.isAdjusted) {
      const computed = ((adjusted - prevAdjusted) / Math.abs(prevAdjusted)) * 100;
      const shownA = parseNumber(row.pctAdjusted);
      if (shownA !== null && pctDiff(shownA, computed) > 0.12) {
        push(findings, 'fail', 'ventas.pctAdjusted', `${row.name}: % Ajustado mostrado ${row.pctAdjusted} pero calculado ${computed.toFixed(2)} %.`);
      }
    }
    if (row.isAdjusted === false && adjusted !== null && normal !== null && Math.abs(adjusted - normal) > 0.01) {
      const nameLower = normalize(row.name);
      const isCarryOver = nameLower.includes('ebt') || nameLower.includes('neto') || nameLower.includes('net income');
      if (!isCarryOver) {
        push(findings, 'warn', 'ventas.no_ajustada', `${row.name}: isAdjusted=false pero Ajustado (${row.adjusted}) ≠ Normal (${row.normal}).`);
      }
    }
    if (row.isAdjusted === true && !row.adjustedNote) {
      push(findings, 'fail', 'ventas.nota_ajuste', `${row.name}: isAdjusted=true sin adjustedNote.`);
    }
  }
  const notes = (horizon?.sales?.notes ?? []).join(' ');
  for (const row of rows) {
    if (row.adjustedNote && !notes.includes(row.adjustedNote.replace(/[()]/g, '').trim())) {
      push(findings, 'warn', 'ventas.nota_huerfana', `${row.name}: la nota ${row.adjustedNote} no aparece en sales.notes.`);
    }
  }
  const eps = parseNumber(horizon?.sales?.eps);
  const shares = parseNumber(horizon?.sales?.shares);
  const netRow = rowByName(rows, 'beneficio neto');
  const net = parseNumber(netRow?.adjusted) ?? parseNumber(netRow?.normal);
  if (eps !== null && shares !== null && net !== null && net !== 0) {
    const implied = eps * shares;
    const deviation = Math.abs(implied - net) / Math.abs(net);
    if (deviation > 0.25) {
      push(findings, 'info', 'ventas.eps_vs_neto', `EPS × acciones (${implied.toFixed(1)}M) difiere del Beneficio Neto (${net}M) en ${(deviation * 100).toFixed(0)} %; puede ser normal (BPA ajustado vs promedio ponderado) pero conviene revisarlo.`);
    }
  }
  if (!horizon?.sales?.shares) push(findings, 'fail', 'ventas.shares', 'Falta «shares».');
  if (!horizon?.sales?.eps) push(findings, 'fail', 'ventas.eps', 'Falta «eps».');
}

function checkCashFlow(horizon, findings) {
  const rows = horizon?.cashFlow?.rows ?? [];
  const names = rows.map((row) => normalize(row.name));
  CASH_ROWS.forEach((name, index) => {
    if (!names[index] || !names[index].startsWith(name)) {
      push(findings, 'fail', `cashflow.fila_${index + 1}`, `Se esperaba «${name}» en la posición ${index + 1} y aparece «${rows[index]?.name ?? 'nada'}».`);
    }
  });
  for (const row of rows) {
    const values = row.values ?? [];
    if (values.length !== 2) {
      push(findings, 'fail', 'cashflow.valores', `${row.name}: se esperan exactamente 2 valores y hay ${values.length}.`);
    }
  }
  const byName = {};
  for (const row of rows) byName[normalize(row.name)] = (row.values ?? []).map(parseNumber);
  const cf = byName['cash flow'];
  const capex = byName['capex'];
  const fcf = byName['fcf'];
  const perShare = byName['fcf/acción'];
  const dividend = byName['dividendo'];
  const libre = byName['libre'];
  const shares = parseNumber(horizon?.sales?.shares);
  for (let i = 0; i < 2; i += 1) {
    if (cf?.[i] != null && capex?.[i] != null && fcf?.[i] != null && Math.abs(cf[i] - capex[i] - fcf[i]) > 1.5) {
      push(findings, 'fail', 'cashflow.fcf', `FCF columna ${i + 1}: ${cf[i]} - ${capex[i]} ≠ ${fcf[i]}.`);
    }
    if (fcf?.[i] != null && dividend?.[i] != null && libre?.[i] != null && Math.abs(fcf[i] - dividend[i] - libre[i]) > 1.5) {
      push(findings, 'fail', 'cashflow.libre', `Libre columna ${i + 1}: ${fcf[i]} - ${dividend[i]} ≠ ${libre[i]}.`);
    }
    if (fcf?.[i] != null && perShare?.[i] != null && shares) {
      const computed = fcf[i] / shares;
      if (Math.abs(computed - perShare[i]) > Math.max(0.03, Math.abs(computed) * 0.05)) {
        push(findings, 'warn', 'cashflow.fcf_accion', `FCF/Acción columna ${i + 1}: ${perShare[i]} $ vs calculado ${computed.toFixed(2)} $.`);
      }
    }
  }
  const scenarios = horizon?.cashFlow?.scenarios ?? [];
  if (scenarios.length !== 2) {
    push(findings, 'fail', 'cashflow.escenarios', `Se esperan 2 escenarios y hay ${scenarios.length}.`);
  }
  if (scenarios[1] && !/WC=/i.test(scenarios[1])) {
    push(findings, 'warn', 'cashflow.wc_ajustado', `El escenario ajustado no declara WC=valor: «${scenarios[1]}».`);
  }
  const notes = (horizon?.cashFlow?.notes ?? []).join(' ');
  if (!/W[KC]\s*=/i.test(notes)) {
    push(findings, 'warn', 'cashflow.nota_wk', 'No se encuentra la fórmula WC en las notas de Cash Flow.');
  }
  if (cf && cf[0] != null && cf[1] != null && Math.abs(cf[0] - cf[1]) < 0.01 && scenarios[1] && !/WC=0\b/i.test(scenarios[1])) {
    push(findings, 'info', 'cashflow.sin_ajuste', 'Cash Flow Normal y Ajustado idénticos; verificar que no hubiera ajuste de circulante/impuestos aplicable.');
  }
}

function checkCapital(horizon, findings) {
  const rows = horizon?.capital?.rows ?? [];
  if (!rows.length) {
    push(findings, 'fail', 'capital.vacia', 'La tabla de Asignación de Capital está vacía.');
    return;
  }
  const first = normalize(rows[0]?.name);
  const last = normalize(rows[rows.length - 1]?.name);
  if (!first.startsWith('libre')) push(findings, 'fail', 'capital.primera_fila', `La primera fila debería ser «Libre» y es «${rows[0]?.name}».`);
  if (!last.startsWith('en total')) push(findings, 'fail', 'capital.ultima_fila', `La última fila debería ser «En total» y es «${rows[rows.length - 1]?.name}».`);
  const values = rows.map((row) => parseNumber(row.value));
  const sum = values.slice(0, -1).reduce((acc, value) => acc + (value ?? 0), 0);
  const total = values[values.length - 1];
  const libre = values[0];
  if (total != null && Math.abs(sum - total) > 1.5) {
    push(findings, 'fail', 'capital.suma', `La suma algebraica de las filas da ${sum.toFixed(1)} y «En total» muestra ${total}.`);
  }
  const gross = values.slice(0, -1).reduce((acc, value) => acc + Math.abs(value ?? 0), 0);
  const threshold = Math.max(50, Math.abs(libre ?? 0) * 0.2, gross * 0.1);
  const within = total != null && Math.abs(total) <= threshold;
  const verification = String(horizon?.capital?.verification ?? '');
  const saysNoCuadra = /no cuadra/i.test(verification);
  if (total != null && within && saysNoCuadra) {
    push(findings, 'fail', 'capital.verificacion', `Descuadre ${total} dentro del umbral (${threshold.toFixed(1)}) pero la verificación dice «No cuadra».`);
  }
  if (total != null && !within && !saysNoCuadra) {
    push(findings, 'fail', 'capital.verificacion', `Descuadre ${total} supera el umbral (${threshold.toFixed(1)}) pero la verificación no lo señala como descuadre.`);
  }
  if (!within && total != null && !/\d/.test(verification)) {
    push(findings, 'fail', 'capital.verificacion_cifra', 'La verificación de un descuadre no incluye el importe exacto.');
  }
  const cashLibre = (horizon?.cashFlow?.rows ?? []).find((row) => normalize(row.name).startsWith('libre'))?.values?.[0];
  const cashLibreNum = parseNumber(cashLibre);
  if (libre != null && cashLibreNum != null && Math.abs(libre - cashLibreNum) > 1.5) {
    push(findings, 'fail', 'capital.libre_vs_cashflow', `Libre de capital (${libre}) no coincide con el Libre Normal del Cash Flow (${cashLibreNum}).`);
  }
  for (const row of rows) {
    if (row.value === '0' || row.value === '—' || row.value === '-') {
      push(findings, 'fail', 'capital.fila_vacia', `Fila «${row.name}» con valor no material (${row.value}); no debería pintarse.`);
    }
  }
  const notes = (horizon?.capital?.notes ?? []).join(' ');
  if (!/Deuda balance/i.test(notes)) push(findings, 'warn', 'capital.nota_deuda', 'Falta la nota obligatoria «Deuda balance: ... -> ...» en Asignación de Capital.');
  if (!/Deuda neta/i.test(notes)) push(findings, 'warn', 'capital.nota_deuda_neta', 'Falta «Deuda neta: ... -> ...» en la nota de deuda.');
  if (!/Caja balance/i.test(notes)) push(findings, 'warn', 'capital.nota_caja', 'Falta «Caja balance: ... -> ...» en la nota de asignación de capital.');
  for (const row of rows) {
    const matches = String(row.name).match(/\*(\d+)/);
    if (matches && !notes.includes(`*${matches[1]}`)) {
      push(findings, 'warn', 'capital.nota_huerfana', `La fila «${row.name}» referencia la nota *${matches[1]} que no existe en capital.notes.`);
    }
  }
}

function checkAnnual(report, findings) {
  if (!report?.isAnnual) return;
  const horizons = report.horizons ?? [];
  if (horizons.length !== 1 || !/12\s*MESES/i.test(horizons[0]?.label ?? '')) {
    push(findings, 'fail', 'anual.horizonte', `Un 10-K debe tener un único horizonte «EN TODO EL AÑO (12 MESES)»; tiene ${horizons.length}: ${horizons.map((h) => h.label).join(' | ')}.`);
  }
  if (report.rating) {
    const score = Number(report.rating.score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      push(findings, 'fail', 'anual.rating', `rating.score fuera de rango: ${report.rating.score}.`);
    }
    if (String(report.rating.label ?? '').trim() !== `NOTA DE RESULTADOS: ${report.rating.score}`) {
      push(findings, 'warn', 'anual.rating_label', `rating.label «${report.rating.label}» no coincide con «NOTA DE RESULTADOS: ${report.rating.score}».`);
    }
  }
  const conclusion = report.conclusion ?? {};
  for (const section of ['debt', 'outlook', 'acquisitions', 'dividends', 'watchlist', 'repurchases', 'executiveChanges']) {
    if (conclusion[section] === undefined) continue;
    const value = conclusion[section];
    if (section === 'outlook' && value && !value.secSnippet) {
      push(findings, 'warn', 'anual.outlook_snippet', 'El outlook anual no incluye la tabla oficial de guidance (secSnippet).');
    }
  }
}

function checkNoteConsistency(horizon, findings) {
  const salesRows = horizon?.sales?.rows ?? [];
  const netRow = salesRows.find((row) => normalize(row.name) === 'beneficio neto');
  const netAdjusted = parseNumber(netRow?.adjusted);
  for (const note of horizon?.sales?.notes ?? []) {
    const sentence = String(note).match(/Beneficio\s+Neto\s+Ajustado([^.\n]*)(?:\.|$)/i);
    if (sentence && netAdjusted !== null) {
      const numbers = [...sentence[0].matchAll(/=\s*(-?[\d.,]+)\s*M/gi)];
      const noteValue = numbers.length ? parseNumber(numbers[numbers.length - 1][1]) : null;
      if (noteValue !== null && Math.abs(noteValue - netAdjusted) > 0.6) {
        push(findings, 'fail', 'notas.beneficio_neto', `La nota calcula Beneficio Neto Ajustado = ${numbers[numbers.length - 1][1]}M pero la tabla muestra ${netRow.adjusted}.`);
      }
    }
  }

  const cfAdjusted = parseNumber((horizon?.cashFlow?.rows ?? []).find((row) => normalize(row.name) === 'cash flow')?.values?.[1]);
  const cfNotes = horizon?.cashFlow?.notes ?? [];
  const lastEqualityValue = (text) => {
    const matches = [...String(text).matchAll(/=\s*(-?[\d.,]+)\s*M/gi)];
    return matches.length ? parseNumber(matches[matches.length - 1][1]) : null;
  };
  if (cfAdjusted !== null && cfNotes.length) {
    const hasTaxNote = cfNotes.some((note) => /impuesto|tax/i.test(String(note)));
    const chainCloses = cfNotes.some((note) => {
      const value = lastEqualityValue(note);
      return value !== null && Math.abs(value - cfAdjusted) <= 0.6;
    });
    if (hasTaxNote && !chainCloses) {
      push(findings, 'fail', 'notas.cashflow', `Hay ajuste fiscal pero ninguna nota cierra la cadena con el Cash Flow Ajustado de la tabla (${cfAdjusted}).`);
    }
    if (!hasTaxNote) {
      const wcNote = cfNotes.find((note) => /WC|circulante|working capital|Cuentas por pagar/i.test(String(note)));
      const value = wcNote ? lastEqualityValue(wcNote) : null;
      if (value !== null && Math.abs(value - cfAdjusted) > 0.6) {
        push(findings, 'fail', 'notas.cashflow', `La nota *1 presenta ${value}M como Cash Flow Ajustado pero la tabla muestra ${cfAdjusted}.`);
      }
    }
  }
  const hasTaxAdjust = cfNotes.some((note) => /impuesto/i.test(note));
  if (hasTaxAdjust && cfNotes.length >= 2) {
    const closure = cfNotes.find((note) => /combina\s+los\s+dos\s+ajustes|circulante\s*\)\s*[-+]|\(impuestos\)/i.test(note));
    if (!closure) push(findings, 'warn', 'notas.cashflow_cadena', 'Hay ajuste de circulante y de impuestos pero ninguna nota cierra la cadena completa Normal -> circulante -> impuestos -> Ajustado.');
  }

  const rows = horizon?.capital?.rows ?? [];
  const noteText = (horizon?.capital?.notes ?? []).join(' ');
  const debtRow = rows.find((row) => /^deuda/i.test(normalize(row.name)));
  const debtMatch = noteText.match(/Deuda\s+balance:\s*(-?[\d.,]+)\s*M\s*->\s*(-?[\d.,]+)\s*M\s*\(([^)]*)\)/i);
  if (debtRow && debtMatch) {
    const variation = parseNumber(debtMatch[3]);
    const rowValue = parseNumber(debtRow.value);
    if (variation !== null && rowValue !== null && Math.abs(variation - rowValue) > 1.5) {
      push(findings, 'fail', 'notas.deuda', `La nota de deuda indica variación ${debtMatch[3]}M pero la fila «${debtRow.name}» muestra ${debtRow.value}.`);
    }
  }
  const cashRow = rows.find((row) => /^caja/i.test(normalize(row.name)));
  const cashMatch = noteText.match(/fila\s+Caja\s*=\s*(-?[\d.,]+)\s*M/i);
  if (cashRow && cashMatch) {
    const noteValue = parseNumber(cashMatch[1]);
    const rowValue = parseNumber(cashRow.value);
    if (noteValue !== null && rowValue !== null && Math.abs(noteValue - rowValue) > 1.5) {
      push(findings, 'fail', 'notas.caja', `La nota dice «fila Caja = ${cashMatch[1]}M» pero la fila muestra ${cashRow.value}.`);
    }
  }
  const netDebtMatch = noteText.match(/Deuda\s+neta:\s*(-?[\d.,]+)\s*M\s*->\s*(-?[\d.,]+)\s*M\s*\(([^)]*)\)/i);
  if (netDebtMatch) {
    const from = parseNumber(netDebtMatch[1]);
    const to = parseNumber(netDebtMatch[2]);
    const variation = parseNumber(netDebtMatch[3]);
    if (from !== null && to !== null && variation !== null && Math.abs((to - from) - variation) > 1.5) {
      push(findings, 'fail', 'notas.deuda_neta', `La variación de deuda neta de la nota (${netDebtMatch[3]}M) no cuadra con sus saldos (${netDebtMatch[1]} -> ${netDebtMatch[2]}).`);
    }
  }
}

export function runDeterministicChecks(report) {
  const findings = [];
  const horizons = report?.horizons ?? [];
  if (!horizons.length) push(findings, 'fail', 'estructura.horizontes', 'El informe no tiene horizontes.');
  horizons.forEach((horizon, index) => {
    const label = horizon?.label ?? `horizonte ${index + 1}`;
    const before = findings.length;
    checkSales(horizon, findings);
    checkCashFlow(horizon, findings);
    checkCapital(horizon, findings);
    checkNoteConsistency(horizon, findings);
    for (let i = before; i < findings.length; i += 1) findings[i].horizon = label;
  });
  checkAnnual(report, findings);
  const counts = findings.reduce((acc, item) => {
    acc[item.level] = (acc[item.level] ?? 0) + 1;
    return acc;
  }, {});
  return { findings, counts, total: findings.length };
}
