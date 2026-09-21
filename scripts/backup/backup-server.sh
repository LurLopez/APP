#!/usr/bin/env bash
# Snapshot diario incremental del servidor (VPS).
# Se instala como /home/deploy/backup-server.sh y lo ejecuta cron a las 03:30.
# Cada día crea backups/snapshots/YYYY-MM-DD con hardlinks a los ficheros que no
# han cambiado (rsync --link-dest), así que solo lo modificado ocupa espacio nuevo.
set -euo pipefail

BACKUP_ROOT="${CIFRA_BACKUP_ROOT:-/home/deploy/backups}"
SNAPSHOT_ROOT="${BACKUP_ROOT}/snapshots"
RETENTION_DAYS="${CIFRA_BACKUP_RETENTION_DAYS:-180}"
TODAY="${CIFRA_BACKUP_DATE:-$(date +%F)}"
DEST="${SNAPSHOT_ROOT}/${TODAY}"
LOCK_FILE="${BACKUP_ROOT}/.backup-server.lock"

log() { echo "[backup-server $(date '+%F %T')] $*"; }

mkdir -p "${SNAPSHOT_ROOT}"
exec 9>"${LOCK_FILE}"
flock -n 9 || { log "ya hay una copia en curso, se omite"; exit 0; }

PREV=""
while IFS= read -r dir; do
  if [ "${dir}" != "${TODAY}" ]; then
    PREV="${SNAPSHOT_ROOT}/${dir}"
    break
  fi
done < <(find "${SNAPSHOT_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)

LINK_DEST=()
if [ -n "${PREV}" ] && [ -d "${PREV}/var-www" ]; then
  LINK_DEST=(--link-dest="${PREV}/var-www")
  log "snapshot anterior: ${PREV}"
fi

mkdir -p "${DEST}/var-www"

SOURCE_DIRS=()
for ENV in prod dev; do
  [ -d "/var/www/cifra-${ENV}" ] && SOURCE_DIRS+=("/var/www/cifra-${ENV}")
done
if [ ${#SOURCE_DIRS[@]} -gt 0 ]; then
  log "sincronizando ${SOURCE_DIRS[*]}"
  rsync -a --delete "${LINK_DEST[@]}" \
    --exclude 'node_modules/' \
    --exclude '.git/' \
    --exclude 'logs/' \
    "${SOURCE_DIRS[@]}" "${DEST}/var-www/"
fi

log "copiando configuración del sistema"
mkdir -p "${DEST}/etc/nginx" "${DEST}/etc/systemd" "${DEST}/home-deploy"
[ -f /etc/nginx/sites-available/cifra ] && cp -a /etc/nginx/sites-available/cifra "${DEST}/etc/nginx/"
[ -f /etc/nginx/snippets/cifra-security-headers.conf ] && cp -a /etc/nginx/snippets/cifra-security-headers.conf "${DEST}/etc/nginx/"
for unit in /etc/systemd/system/cifra-*.service; do
  [ -e "${unit}" ] && cp -a "${unit}" "${DEST}/etc/systemd/"
done
cp -a /home/deploy/*.sh "${DEST}/home-deploy/" 2>/dev/null || true
crontab -l > "${DEST}/home-deploy/crontab-deploy.txt" 2>/dev/null || true

log "incluyendo dumps de base de datos de hoy"
mkdir -p "${DEST}/db-dumps"
DUMPS=""
for ENV in prod dev; do
  DUMP=$(find "${BACKUP_ROOT}" -maxdepth 1 -type f -name "cifra_${ENV}_${TODAY}_*.sql.gz" -print | sort | tail -n1)
  [ -n "${DUMP}" ] || continue
  if gzip -t "${DUMP}" 2>/dev/null; then
    cp -l "${DUMP}" "${DEST}/db-dumps/"
    DUMPS="${DUMPS} $(basename "${DUMP}")"
  else
    log "AVISO: dump corrupto, se omite: ${DUMP}"
  fi
done
[ -n "${DUMPS}" ] || log "AVISO: no se encontraron dumps de hoy (¿falló backup-db.sh?)"

{
  echo "snapshot: ${TODAY}"
  echo "host: $(hostname)"
  echo "created: $(date '+%F %T %z')"
  echo "dumps:${DUMPS:- ninguno}"
} > "${DEST}/.completed"

log "aplicando retención de ${RETENTION_DAYS} días"
find "${SNAPSHOT_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -print -exec rm -rf {} +

log "hecho: ${DEST} ($(du -sh "${DEST}" 2>/dev/null | cut -f1)); total snapshots: $(du -sh "${SNAPSHOT_ROOT}" 2>/dev/null | cut -f1)"
