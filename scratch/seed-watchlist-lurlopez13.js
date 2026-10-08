/**
 * @fileoverview Script puntual: llena la lista de seguimiento por defecto de
 * lurlopez13@gmail.com (local) con las empresas de los tres sectores admitidos
 * (consumo defensivo, tecnología y consumo discrecional) definidas en sectorAgent.
 */
import { readFileSync } from 'node:fs';
import { query, pool } from '../db/pool.js';
import { watchlistRepository } from '../db/repositories/watchlistRepository.js';
import { getTickerMap } from '../src/services/edgar/secClient.js';

const USER_EMAIL = 'lurlopez13@gmail.com';

const source = readFileSync(new URL('../src/agents/sectorAgent.js', import.meta.url), 'utf8');

function extractSet(name) {
  const match = source.match(new RegExp(`export const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`No se encontró ${name} en sectorAgent.js`);
  return [...match[1].matchAll(/'([A-Z0-9.-]+)'/gi)].map((m) => m[1].toUpperCase());
}

const defensive = extractSet('KNOWN_DEFENSIVE_CONSUMER_TICKERS');
const technology = extractSet('KNOWN_TECHNOLOGY_TICKERS');
const discretionary = extractSet('KNOWN_CONSUMER_DISCRETIONARY_TICKERS');

const DUPLICATE_SHARE_CLASSES = new Set(['BF.B', 'GOOG', 'UA']);
const tickers = [];
const seen = new Set();
for (const ticker of [...defensive, ...technology, ...discretionary]) {
  if (DUPLICATE_SHARE_CLASSES.has(ticker) || seen.has(ticker)) continue;
  seen.add(ticker);
  tickers.push(ticker);
}

const { rows: userRows } = await query('SELECT id, email FROM users WHERE email = $1', [USER_EMAIL]);
if (!userRows.length) throw new Error(`Usuario ${USER_EMAIL} no encontrado`);
const userId = userRows[0].id;

await watchlistRepository.ensureDefaultWatchlist(userId);
const lists = await watchlistRepository.listWatchlists(userId);
const target = lists.find((list) => list.isDefault) ?? lists[0];
if (!target) throw new Error('El usuario no tiene listas de seguimiento');

let tickerMap = new Map();
try {
  tickerMap = await getTickerMap();
} catch (error) {
  console.warn(`Aviso: no se pudo consultar la SEC (${error.message}); se usará el ticker como nombre.`);
}

const missing = [];
for (const ticker of tickers) {
  const name = tickerMap.get(ticker)?.name || null;
  if (!name) missing.push(ticker);
  await watchlistRepository.addItem(userId, target.id, ticker, name || ticker);
}

const finalItems = await watchlistRepository.listWatchlistItems(userId, target.id);
console.log(`Usuario ${userRows[0].email} (id ${userId}) · lista "${target.name}" (id ${target.id})`);
console.log(`Añadidas/actualizadas ${tickers.length} empresas — ${defensive.length} defensivo + ${technology.length} tecnológico + ${discretionary.length} discrecional (duplicados de clase fuera)`);
if (missing.length) console.log(`Sin nombre oficial en SEC (se guardó el ticker): ${missing.join(', ')}`);
console.log(`Total de empresas en la lista: ${finalItems.length}`);

await pool.end();
