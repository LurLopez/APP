/**
 * @fileoverview Guarda anti-SSRF para peticiones salientes del servidor.
 *
 * Valida que una URL sea http/https, no apunte a localhost, dominios internos,
 * rangos de red privados ni direcciones de metadatos de cloud. Se resuelve el DNS
 * y se comprueba TODAS las direcciones antes de permitir la petición.
 *
 * Uso:
 *   await assertPublicUrl(url); // lanza UnsafeUrlError si no es segura
 *
 * @module utils/ssrfGuard
 */

import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = /(^localhost$|\.localhost$|\.local$|\.internal$|\.home\.arpa$|^metadata\.google\.internal$|^instance-data$)/i;

const DNS_CACHE_TTL_MS = 5 * 60 * 1000;
const dnsCache = new Map();

/**
 * Error de URL no permitida para peticiones del servidor.
 */
export class UnsafeUrlError extends Error {
  constructor(message = 'URL no permitida.') {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = 'UNSAFE_URL';
  }
}

/**
 * Normaliza el prefijo IPv4-mapeado de una IPv6.
 * @param {string} ip - IP.
 * @returns {string} IP normalizada.
 */
function undoMappedIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return lower.slice(7);
  return lower;
}

/**
 * Convierte IPv4 a entero.
 * @param {string} ip - IPv4.
 * @returns {number}
 */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

/**
 * Comprueba si una IPv4 es privada, loopback, link-local o reservada.
 * @param {string} ip - IPv4.
 * @returns {boolean}
 */
function isPrivateIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

/**
 * Comprueba si una IPv6 es loopback, link-local, única local o no especificada.
 * @param {string} ip - IPv6.
 * @returns {boolean}
 */
function isPrivateIpv6(ip) {
  const lower = undoMappedIpv6(ip);
  if (net.isIP(lower) === 4) return isPrivateIpv4(lower);
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  return false;
}

/**
 * Indica si una IP es privada/reservada.
 * @param {string} ip - IP normalizada.
 * @returns {boolean}
 */
export function isPrivateAddress(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

/**
 * Resuelve un hostname a sus direcciones con caché breve.
 * @param {string} hostname - Nombre a resolver.
 * @returns {Promise<string[]>} Direcciones IP.
 */
async function resolveHost(hostname) {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.at < DNS_CACHE_TTL_MS) return cached.addresses;
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  dnsCache.set(hostname, { addresses, at: Date.now() });
  return addresses;
}

/**
 * Valida una URL para peticiones salientes del servidor.
 * @param {unknown} rawUrl - URL candidata.
 * @returns {Promise<URL>} URL validada.
 * @throws {UnsafeUrlError} Si el protocolo, host o dirección no son públicos.
 */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl ?? ''));
  } catch {
    throw new UnsafeUrlError('URL no válida.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UnsafeUrlError('Protocolo no permitido.');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Las URL con credenciales no están permitidas.');
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.test(hostname)) {
    throw new UnsafeUrlError('Destino interno no permitido.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new UnsafeUrlError('Dirección de red privada no permitida.');
    return url;
  }

  let addresses;
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new UnsafeUrlError('No se pudo resolver el destino.');
  }
  if (!addresses.length) throw new UnsafeUrlError('El destino no tiene direcciones.');
  if (addresses.some((address) => isPrivateAddress(undoMappedIpv6(address)))) {
    throw new UnsafeUrlError('El destino resuelve a una red privada.');
  }

  return url;
}
