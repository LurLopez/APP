/**
 * @fileoverview Resolución de la IP real del cliente detrás de proxies (nginx, Cloudflare).
 *
 * Reglas de seguridad:
 * - Las cabeceras HTTP nunca se confían por defecto: solo se usan si el salto
 *   inmediato (socket peer) es un proxy de confianza (loopback/red interna) o una
 *   IP oficial de Cloudflare.
 * - `cf-connecting-ip` solo se acepta cuando el último salto de `x-forwarded-for`
 *   (o el propio peer) es una IP de Cloudflare, de modo que una petición directa
 *   al origen no pueda falsificar su IP.
 * - Si un atacante envía cabeceras falsas al origen directo, se usará la IP real
 *   que el proxy añade al final de `x-forwarded-for`.
 *
 * Nota: la protección definitiva contra el acceso directo al origen es cortar a
 * nivel de red (ufw/nginx) todo el tráfico que no provenga de Cloudflare.
 *
 * @module utils/clientIp
 */

import net from 'node:net';
import config from '../../config/index.js';

// Rangos oficiales de Cloudflare (https://www.cloudflare.com/ips/).
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/**
 * Normaliza una representación de IP: quita puertos, corchetes y prefijo IPv4-mapeado.
 * @param {unknown} value - IP en bruto.
 * @returns {string} IP normalizada o cadena vacía.
 */
export function normalizeIp(value) {
  let ip = String(value ?? '').trim();
  if (!ip) return '';
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    if (end !== -1) ip = ip.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  return net.isIP(ip) ? ip : '';
}

/**
 * Convierte una IPv4 a entero de 32 bits.
 * @param {string} ip - IPv4.
 * @returns {number} Entero sin signo.
 */
function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

/**
 * Comprueba si una IPv4 pertenece a un CIDR.
 * @param {string} ip - IPv4.
 * @param {string} cidr - CIDR IPv4.
 * @returns {boolean}
 */
function ipv4InCidr(ip, cidr) {
  const [network, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

/**
 * Expande una IPv6 a su forma completa (8 grupos de 16 bits).
 * @param {string} ip - IPv6.
 * @returns {number[]|null} Grupos o null si es inválida.
 */
function ipv6ToGroups(ip) {
  if (net.isIP(ip) !== 6) return null;
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail !== undefined ? tail.split(':').filter(Boolean) : [];
  const parse = (part) => parseInt(part, 16);
  const groups = [];
  for (const part of headParts) {
    if (part.includes('.')) {
      const v4 = ipv4ToInt(part);
      groups.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
    } else {
      groups.push(parse(part));
    }
  }
  const missing = 8 - headParts.length - tailParts.length;
  for (let i = 0; i < Math.max(0, missing); i += 1) groups.push(0);
  for (const part of tailParts) {
    if (part.includes('.')) {
      const v4 = ipv4ToInt(part);
      groups.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
    } else {
      groups.push(parse(part));
    }
  }
  return groups.length === 8 && groups.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff)
    ? groups
    : null;
}

/**
 * Comprueba si una IPv6 pertenece a un CIDR.
 * @param {string} ip - IPv6.
 * @param {string} cidr - CIDR IPv6.
 * @returns {boolean}
 */
function ipv6InCidr(ip, cidr) {
  const [network, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipGroups = ipv6ToGroups(ip);
  const netGroups = ipv6ToGroups(network);
  if (!ipGroups || !netGroups) return false;
  for (let i = 0; i < 8; i += 1) {
    const remaining = bits - i * 16;
    if (remaining <= 0) break;
    const mask = remaining >= 16 ? 0xffff : (0xffff << (16 - remaining)) & 0xffff;
    if ((ipGroups[i] & mask) !== (netGroups[i] & mask)) return false;
  }
  return true;
}

/**
 * Indica si una IP pertenece a los rangos oficiales de Cloudflare.
 * @param {string} ip - IP normalizada.
 * @returns {boolean}
 */
export function isCloudflareIp(ip) {
  if (!ip) return false;
  const version = net.isIP(ip);
  if (version === 4) return CLOUDFLARE_IPV4.some((cidr) => ipv4InCidr(ip, cidr));
  if (version === 6) return CLOUDFLARE_IPV6.some((cidr) => ipv6InCidr(ip, cidr));
  return false;
}

/**
 * Indica si una IP es un proxy de confianza según la configuración.
 * @param {string} ip - IP normalizada.
 * @returns {boolean}
 */
export function isTrustedProxy(ip) {
  if (!ip) return false;
  return config.trustedProxyIps.includes(ip) || isCloudflareIp(ip);
}

/**
 * Extrae la lista de IPs válidas de la cabecera `x-forwarded-for`.
 * @param {unknown} header - Valor de la cabecera.
 * @returns {string[]} IPs normalizadas y válidas, en orden.
 */
export function parseForwardedFor(header) {
  return String(header ?? '')
    .split(',')
    .map((part) => normalizeIp(part))
    .filter(Boolean);
}

/**
 * Resuelve la IP real del cliente aplicando las reglas de proxies de confianza.
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {string} IP del cliente (o 'unknown').
 */
export function resolveClientIp(req) {
  const peer = normalizeIp(req?.socket?.remoteAddress);
  const forwarded = parseForwardedFor(req?.headers?.['x-forwarded-for']);
  const lastHop = forwarded.length ? forwarded[forwarded.length - 1] : null;
  const cfIp = normalizeIp(req?.headers?.['cf-connecting-ip']);

  if (cfIp && net.isIP(cfIp)) {
    // Solo se confía en Cloudflare si el primer salto conocido es una IP suya.
    if (isCloudflareIp(peer) || (lastHop && isCloudflareIp(lastHop))) return cfIp;
  }

  if (peer && isTrustedProxy(peer)) {
    if (lastHop) return lastHop;
    // Proxy de confianza sin X-Forwarded-For: se conserva compatibilidad con
    // instalaciones que solo reenvían cf-connecting-ip.
    if (cfIp && net.isIP(cfIp)) return cfIp;
    return peer;
  }

  return peer || 'unknown';
}
