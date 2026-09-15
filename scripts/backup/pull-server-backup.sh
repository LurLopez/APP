#!/usr/bin/env bash
# Copia incremental y cifrada de los snapshots del VPS al equipo local.
# Arquitectura:
#   1. restic conserva el histórico cifrado y deduplicado (~/Lur/backups/cifra-repo).
#   2. Para cada snapshot nuevo del VPS: se restaura desde restic el snapshot
#      anterior como referencia y se hace rsync --link-dest, de modo que por la
#      red solo viaja lo que cambió.
#   3. La retención local es independiente de la del VPS (restic forget).
#   4. En disco no queda copia en claro: staging y restore se borran al terminar.
# Se ejecuta con el timer de usuario cifra-backup-pull.timer.
set -euo pipefail

SSH_TARGET="${CIFRA_VPS_SSH:-cifra-vps}"
REMOTE_ROOT="${CIFRA_VPS_BACKUP_DIR:-/home/deploy/backups/snapshots}"
BASE_DIR="${CIFRA_LOCAL_BACKUP_DIR:-$HOME/Lur/backups/cifra}"
REPO="${CIFRA_RESTIC_REPO:-$HOME/Lur/backups/cifra-repo}"
PASSWORD_FILE="${CIFRA_RESTIC_PASSWORD_FILE:-$HOME/.config/cifra-backup/restic-password}"
RESTIC_BIN="${CIFRA_RESTIC_BIN:-$HOME/.local/bin/restic}"
STAGING="${BASE_DIR}/staging"
RESTORE="${BASE_DIR}/restore"
STATE="${BASE_DIR}/state/backed-up.txt"
LOG="${BASE_DIR}/pull.log"
KEEP_DAILY="${CIFRA_KEEP_DAILY:-30}"
KEEP_WEEKLY="${CIFRA_KEEP_WEEKLY:-12}"
KEEP_MONTHLY="${CIFRA_KEEP_MONTHLY:-12}"
MAX_LOG_LINES=1000
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)

export RESTIC_REPOSITORY="${REPO}"
export RESTIC_PASSWORD_FILE="${PASSWORD_FILE}"

mkdir -p "${STAGING}" "${STATE%/*}" "${REPO}"
chmod 700 "${BASE_DIR}" "${REPO}"
exec 9>"${BASE_DIR}/.pull.lock"
flock -n 9 || { echo "ya hay una copia en curso"; exit 0; }

log() { echo "[$(date '+%F %T')] $*" >> "${LOG}"; }

[ -x "${RESTIC_BIN}" ] || { log "ERROR: no se encuentra restic en ${RESTIC_BIN}"; exit 1; }
[ -f "${PASSWORD_FILE}" ] || { log "ERROR: falta el fichero de contraseña ${PASSWORD_FILE}"; exit 1; }

if ! "${RESTIC_BIN}" snapshots >/dev/null 2>&1; then
  log "inicializando repositorio restic en ${REPO}"
  "${RESTIC_BIN}" init >> "${LOG}" 2>&1
fi
"${RESTIC_BIN}" unlock >> "${LOG}" 2>&1 || true
touch "${STATE}"

log "=== inicio de la copia (${SSH_TARGET}:${REMOTE_ROOT}) ==="

if ! REMOTE_LIST=$(ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "ls -1 '${REMOTE_ROOT}' 2>/dev/null" 2>>"${LOG}"); then
  log "ERROR: no se puede listar ${REMOTE_ROOT} en ${SSH_TARGET}"
  exit 1
fi
mapfile -t REMOTE_DATES < <(printf '%s\n' "${REMOTE_LIST}" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort)

PENDING=()
for date in "${REMOTE_DATES[@]}"; do
  grep -qxF "${date}" "${STATE}" || PENDING+=("${date}")
done

if [ ${#PENDING[@]} -eq 0 ]; then
  log "no hay snapshots nuevos"
else
  PREV_REF=""
  if [ -s "${STATE}" ]; then
    LAST=$(sort "${STATE}" | tail -n1)
    log "restaurando la referencia ${LAST} desde restic"
    rm -rf "${RESTORE}"
    mkdir -p "${RESTORE}"
    if "${RESTIC_BIN}" restore latest --target "${RESTORE}" >> "${LOG}" 2>&1; then
      PREV_REF="${RESTORE}/${LAST}"
    else
      log "AVISO: no se pudo restaurar la referencia; se descargará completo"
    fi
  fi

  for date in "${PENDING[@]}"; do
    if ! ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "test -f '${REMOTE_ROOT}/${date}/.completed'"; then
      log "AVISO: el snapshot ${date} no está completo (.completed), se omite"
      continue
    fi
    log "descargando snapshot ${date}"
    LINK_DEST=()
    [ -n "${PREV_REF}" ] && [ -d "${PREV_REF}" ] && LINK_DEST=(--link-dest="${PREV_REF}")
    rm -rf "${STAGING:?}/${date}"
    rsync -aH --delete "${LINK_DEST[@]}" --info=stats2 \
      -e "ssh ${SSH_OPTS[*]}" \
      "${SSH_TARGET}:${REMOTE_ROOT}/${date}/" "${STAGING}/${date}/" >> "${LOG}" 2>&1
    log "guardando snapshot ${date} cifrado en restic"
    ( cd "${STAGING}" && "${RESTIC_BIN}" backup --tag "date=${date}" --time "${date} 03:30:00" "${date}" ) >> "${LOG}" 2>&1
    PREV_REF="${STAGING}/${date}"
    echo "${date}" >> "${STATE}"
    sort -u -o "${STATE}" "${STATE}"
  done
fi

log "verificando integridad del repositorio"
"${RESTIC_BIN}" check --retry-lock 10m --read-data-subset=1/20 >> "${LOG}" 2>&1 || log "AVISO: restic check ha fallado"

log "aplicando retención local: ${KEEP_DAILY} diarios / ${KEEP_WEEKLY} semanales / ${KEEP_MONTHLY} mensuales"
"${RESTIC_BIN}" forget --retry-lock 10m --keep-daily "${KEEP_DAILY}" --keep-weekly "${KEEP_WEEKLY}" --keep-monthly "${KEEP_MONTHLY}" --prune >> "${LOG}" 2>&1 || log "AVISO: la retención local ha fallado"

"${RESTIC_BIN}" snapshots >> "${LOG}" 2>&1 || true
rm -rf "${STAGING}"/* "${RESTORE}"

REPO_MB=$(du -sm "${REPO}" 2>/dev/null | cut -f1)
FREE_MB=$(df -Pm "${BASE_DIR}" | awk 'NR==2 {print $4}')
log "tamaño del repositorio: ${REPO_MB:-?} MB; espacio libre en disco: ${FREE_MB:-?} MB"
if [ -n "${FREE_MB}" ] && [ "${FREE_MB}" -lt "${CIFRA_MIN_FREE_MB:-5120}" ]; then
  log "AVISO: quedan menos de $(( ${CIFRA_MIN_FREE_MB:-5120} / 1024 )) GB libres en el disco"
fi
log "=== fin de la copia ==="

tail -n "${MAX_LOG_LINES}" "${LOG}" > "${LOG}.tmp" && mv "${LOG}.tmp" "${LOG}"
