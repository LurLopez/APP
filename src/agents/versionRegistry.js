import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Registro de versiones por niveles: general.sector[.subsector][.empresa].
// Cada nivel declara su número al principio de su propio .md y la versión del
// análisis es la composición de los niveles que aplican. Cuando el prefijo
// coincide, una versión con más niveles (reglas más específicas) es más nueva.
const KNOWLEDGE_DIR = new URL('./knowledge/', import.meta.url);
const SECTOR_SLUGS = {
  defensive_consumer: 'consumo-defensivo',
  technology: 'tecnologia',
  consumer_discretionary: 'consumo-discrecional',
};
const VERSION_PATTERN = /^\s*(?:>\s*)?(?:versi[oó]n|version)\s*[:=]\s*([0-9]+(?:\.[0-9]+)*)\s*$/im;

export const DEFAULT_LEVEL_VERSION = 0;

const versionCache = new Map();

export function parseVersionMarker(content) {
  const head = String(content ?? '').slice(0, 2000);
  const match = head.match(VERSION_PATTERN);
  return match ? match[1] : null;
}

function buildPath(relativePath) {
  return fileURLToPath(new URL(relativePath, KNOWLEDGE_DIR));
}

// Lee el número de versión al principio de un .md (con caché por mtime).
async function readLevelVersion(relativePath) {
  const path = buildPath(relativePath);
  try {
    const stats = await stat(path);
    const cached = versionCache.get(path);
    if (cached && cached.mtimeMs === stats.mtimeMs) return cached.version;
    const content = await readFile(path, 'utf8');
    const version = parseVersionMarker(content);
    versionCache.set(path, { mtimeMs: stats.mtimeMs, version });
    return version;
  } catch {
    return null;
  }
}

function sectorSlugOf(sector) {
  return SECTOR_SLUGS[sector] ?? sector;
}

// Localiza las reglas propias de una empresa (agente de empresa). Se admite
// tanto `<sector>/empresas/<ticker>/empresa.md` como `<sector>/empresas/<ticker>.md`.
async function resolveEmpresaRulesVersion(sectorSlug, ticker) {
  const slug = String(ticker ?? '').trim().toLowerCase();
  if (!slug) return { version: null, path: null };
  const candidates = [
    `${sectorSlug}/empresas/${slug}/empresa.md`,
    `${sectorSlug}/empresas/${slug}.md`,
  ];
  for (const candidate of candidates) {
    const version = await readLevelVersion(candidate);
    if (version != null) return { version, path: candidate };
  }
  return { version: null, path: null };
}

// Compone la versión jerárquica y devuelve el detalle de cada nivel.
export async function resolveAnalysisVersionInfo({
  sector = 'defensive_consumer',
  subsector = null,
  ticker = null,
  formType = null,
} = {}) {
  const sectorSlug = sectorSlugOf(sector);
  const isAnnual = String(formType ?? '').toUpperCase().includes('10-K');
  const generalPath = isAnnual ? 'anual/general.md' : 'general.md';

  const generalVersion = await readLevelVersion(generalPath) ?? String(DEFAULT_LEVEL_VERSION);
  const levels = [generalVersion];

  const sectorVersion = await readLevelVersion(`${sectorSlug}/sector.md`);
  if (sectorVersion == null) {
    return {
      version: levels.join('.'),
      levels,
      generalVersion,
      sectorVersion: null,
      subsectorVersion: null,
      empresaVersion: null,
    };
  }
  levels.push(sectorVersion);

  const subsectorSlug = String(subsector ?? '').trim().toLowerCase();
  let subsectorVersion = null;
  if (subsectorSlug) {
    subsectorVersion = await readLevelVersion(`${sectorSlug}/subsectores/${subsectorSlug}/subsector.md`);
    if (subsectorVersion != null) levels.push(subsectorVersion);
  }

  const empresa = await resolveEmpresaRulesVersion(sectorSlug, ticker);
  if (empresa.version != null) levels.push(empresa.version);

  return {
    version: levels.join('.'),
    levels,
    generalVersion,
    sectorVersion,
    subsectorVersion,
    empresaVersion: empresa.version,
    empresaPath: empresa.path,
  };
}

export async function resolveAnalysisVersion(options = {}) {
  const info = await resolveAnalysisVersionInfo(options);
  return info.version;
}

// Compara versiones numéricas tipo "0.1" o "0.1.2". Cuando el prefijo coincide,
// la que tiene más niveles definidos es la más nueva (reglas más específicas).
export function compareVersions(a, b) {
  const parse = (value) => String(value ?? '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  const partsA = parse(a);
  const partsB = parse(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA > numB ? 1 : -1;
  }
  if (partsA.length !== partsB.length) return partsA.length > partsB.length ? 1 : -1;
  return 0;
}

export function isVersionNewer(candidate, reference) {
  if (!reference) return true;
  if (!candidate) return false;
  return compareVersions(candidate, reference) > 0;
}

// Un análisis se puede regenerar si la versión vigente (compuesta con los
// niveles actuales) es mayor que la versión con la que se generó.
export async function isAnalysisOutdated({
  version = null,
  sector = 'defensive_consumer',
  subsector = null,
  ticker = null,
  formType = null,
} = {}) {
  const currentVersion = await resolveAnalysisVersion({ sector, subsector, ticker, formType });
  return isVersionNewer(currentVersion, version);
}
