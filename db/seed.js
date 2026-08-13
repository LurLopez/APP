import { pool } from './pool.js';
import { createAnalysis, updateAnalysis } from './repositories/analysisRepository.js';
import { findUserByEmail } from './repositories/userRepository.js';

const DEMO_ANALYSES = [
  {
    filename: 'tap-q2-2025.pdf',
    status: 'done',
    origin: 'US',
    sector: 'defensive_consumer',
    report: {
      company: 'Molson Coors',
      ticker: 'TAP',
      period: 'Q2 2025',
      signal: 'positive',
      metrics: {
        revenue_yoy: '+4,8%',
        operating_margin: '18,2%',
        net_debt_ebitda: '2,1x',
      },
      summary: 'Mejora moderada de ingresos con margen operativo estable.',
    },
    model_used: 'demo',
  },
  {
    filename: 'ko-10q-2025.pdf',
    status: 'done',
    origin: 'US',
    sector: 'defensive_consumer',
    report: {
      company: 'Coca-Cola',
      ticker: 'KO',
      period: 'Q1 2025',
      signal: 'positive',
      metrics: {
        revenue_yoy: '+2,1%',
        operating_margin: '22,4%',
        net_debt_ebitda: '1,6x',
      },
      summary: 'Crecimiento sólido en volumen y margen estable.',
    },
    model_used: 'demo',
  },
  {
    filename: 'pep-10k-2024.pdf',
    status: 'done',
    origin: 'US',
    sector: 'defensive_consumer',
    report: {
      company: 'PepsiCo',
      ticker: 'PEP',
      period: 'FY 2024',
      signal: 'warning',
      metrics: {
        revenue_yoy: '-1,2%',
        operating_margin: '14,9%',
        net_debt_ebitda: '2,6x',
      },
      summary: 'Caída ligera de ingresos; vigilar deuda neta sobre EBITDA.',
    },
    model_used: 'demo',
  },
];

async function seed() {
  let demoUser = await findUserByEmail('demo@cifra.local');

  if (!demoUser) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, plan)
       VALUES ('demo@cifra.local', 'no-login-demo', 'free')
       RETURNING id, email, plan`,
    );
    demoUser = rows[0];
    console.log(`Usuario demo creado: ${demoUser.email}`);
  } else {
    console.log(`Usuario demo ya existía: ${demoUser.email}`);
  }

  const { rows: existing } = await pool.query('SELECT COUNT(*)::int AS count FROM analyses');
  if (existing[0].count > 0) {
    console.log('Ya hay análisis en la tabla; no se inserta el seed.');
    return;
  }

  for (const analysis of DEMO_ANALYSES) {
    const created = await createAnalysis({
      userId: demoUser.id,
      filename: analysis.filename,
      status: analysis.status,
    });

    await updateAnalysis(created.id, {
      status: analysis.status,
      origin: analysis.origin,
      sector: analysis.sector,
      report: analysis.report,
      model_used: analysis.model_used,
    });
    console.log(`Análisis demo: ${analysis.filename}`);
  }

  console.log('Seed completado.');
}

try {
  await seed();
} catch (error) {
  console.error('No se pudo ejecutar el seed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
