#!/usr/bin/env bash
# ==============================================================================
# Script de commit y subida segura a la rama DEVELOPMENT
#
# Flujo:
# 1. Valida que el entorno esté en la rama 'development' (protección estricta contra producción).
# 2. Muestra con detalle todos los archivos que se han tocado (modificados, nuevos, eliminados).
# 3. Solicita el mensaje del commit al usuario.
# 4. Agrega los cambios y ejecuta 'git commit', el cual solicita interactivamente el token de seguridad.
# 5. Sube ÚNICA y EXCLUSIVAMENTE a la rama 'origin/development'.
#
# Uso:
#   ./commit-development.sh
#   npm run commit
# ==============================================================================

set -Eeuo pipefail

# Colores para la salida en terminal
readonly CLR_RESET="\033[0m"
readonly CLR_BOLD="\033[1m"
readonly CLR_GREEN="\033[32m"
readonly CLR_YELLOW="\033[33m"
readonly CLR_RED="\033[31m"
readonly CLR_CYAN="\033[36m"
readonly CLR_MAGENTA="\033[35m"
readonly CLR_WHITE="\033[37m"

readonly TARGET_BRANCH="development"
readonly TARGET_REMOTE="origin"
readonly FORBIDDEN_BRANCHES=("production" "main" "master")

# Directorio raíz del proyecto
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$PROJECT_DIR"

die() {
  echo -e "\n${CLR_RED}${CLR_BOLD}[ERROR] $1${CLR_RESET}" >&2
  exit 1
}

# 1. Comprobar herramientas necesarias
command -v git >/dev/null 2>&1 || die "Git no está instalado o no se encuentra en el PATH."

echo -e "${CLR_BOLD}================================================================${CLR_RESET}"
echo -e "${CLR_CYAN}${CLR_BOLD}   CIFRA - COMMIT Y SUBIDA A LA RAMA [DEVELOPMENT]   ${CLR_RESET}"
echo -e "${CLR_BOLD}================================================================${CLR_RESET}"

# 2. Verificación estricta de ramas: NUNCA en producción
current_branch="$(git branch --show-current 2>/dev/null || echo '')"

if [[ -z "$current_branch" ]]; then
  die "No se pudo determinar la rama actual de Git (¿repositorio vacío o HEAD desvinculado?)."
fi

# Comprobar si está en una rama prohibida (producción)
for forbidden in "${FORBIDDEN_BRANCHES[@]}"; do
  if [[ "$current_branch" == "$forbidden" ]]; then
    echo -e "${CLR_RED}${CLR_BOLD}[ALERTA DE SEGURIDAD] Te encuentras en la rama prohibida: '$current_branch'.${CLR_RESET}"
    echo -e "Este script tiene estrictamente prohibido tocar o subir a producción."
    echo -e "Cambiando automáticamente a la rama segura '${TARGET_BRANCH}'..."
    if ! git switch "$TARGET_BRANCH" 2>/dev/null; then
      if ! git checkout "$TARGET_BRANCH" 2>/dev/null; then
        die "No se pudo cambiar a la rama '${TARGET_BRANCH}'. Operación abortada por seguridad."
      fi
    fi
    current_branch="$(git branch --show-current 2>/dev/null || echo '')"
    break
  fi
done

# Si está en otra rama distinta a development, cambiar a development
if [[ "$current_branch" != "$TARGET_BRANCH" ]]; then
  echo -e "${CLR_YELLOW}Rama actual: '$current_branch'. Cambiando a '${TARGET_BRANCH}'...${CLR_RESET}"
  if git show-ref --verify --quiet "refs/heads/$TARGET_BRANCH"; then
    git checkout "$TARGET_BRANCH" || die "No se pudo cambiar a la rama '$TARGET_BRANCH'."
  else
    git checkout -b "$TARGET_BRANCH" || die "No se pudo crear ni cambiar a la rama '$TARGET_BRANCH'."
  fi
  current_branch="$(git branch --show-current)"
fi

# Doble comprobación: asegurar 100% que estamos en development
if [[ "$current_branch" != "$TARGET_BRANCH" ]]; then
  die "Error crítico de seguridad: La rama activa es '$current_branch', se requiere '${TARGET_BRANCH}'."
fi

# 3. Mostrar archivos tocados / modificados
raw_status="$(git status --porcelain=v1)"

if [[ -z "$raw_status" ]]; then
  echo -e "\n${CLR_GREEN}✔ No hay archivos modificados ni cambios pendientes para commitear en '${TARGET_BRANCH}'.${CLR_RESET}\n"
  exit 0
fi

echo -e "\n${CLR_BOLD}Archivos que se han tocado y se incluirán en el commit:${CLR_RESET}"
echo -e "----------------------------------------------------------------"

total_files=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  total_files=$((total_files + 1))
  code="${line:0:2}"
  filepath="${line:3}"

  case "$code" in
    "??")
      echo -e "  ${CLR_GREEN}[NUEVO]${CLR_RESET}        $filepath"
      ;;
    "M " | " M" | "MM")
      echo -e "  ${CLR_YELLOW}[MODIFICADO]${CLR_RESET}   $filepath"
      ;;
    "A " | " A")
      echo -e "  ${CLR_CYAN}[AÑADIDO]${CLR_RESET}      $filepath"
      ;;
    "D " | " D")
      echo -e "  ${CLR_RED}[ELIMINADO]${CLR_RESET}    $filepath"
      ;;
    "R " | " R")
      echo -e "  ${CLR_MAGENTA}[RENOMBRADO]${CLR_RESET}   $filepath"
      ;;
    *)
      echo -e "  ${CLR_WHITE}[$code]${CLR_RESET}          $filepath"
      ;;
  esac
done <<< "$raw_status"

echo -e "----------------------------------------------------------------"
echo -e "Total de archivos afectados: ${CLR_BOLD}${total_files}${CLR_RESET}\n"

# 4. Pedir el mensaje del commit
read_interactive() {
  local prompt_text="$1"
  local var_name="$2"
  local val=""
  if [[ -r /dev/tty ]]; then
    printf '%b' "$prompt_text" >/dev/tty
    if ! IFS= read -r val </dev/tty; then
      echo -e "\nOperación cancelada por el usuario." >/dev/tty
      exit 0
    fi
  else
    printf '%b' "$prompt_text"
    if ! IFS= read -r val; then
      echo -e "\nOperación cancelada por el usuario."
      exit 0
    fi
  fi
  printf -v "$var_name" '%s' "$val"
}

commit_message=""
while [[ -z "${commit_message//[[:space:]]/}" ]]; do
  read_interactive "${CLR_BOLD}Introduce el mensaje del commit: ${CLR_RESET}" commit_message
  if [[ -z "${commit_message//[[:space:]]/}" ]]; then
    echo -e "${CLR_RED}El mensaje del commit no puede estar vacío. Inténtalo de nuevo.${CLR_RESET}"
  fi
done

# 5. Comprobar si el token de seguridad está inicializado
real_home() {
  local home=""
  if command -v getent >/dev/null 2>&1; then
    home="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)"
  fi
  [[ -n "$home" ]] || home="${HOME:-}"
  printf '%s' "$home"
}

HASH_FILE="$(real_home)/.config/cifra-commit-lock/token.sha256"

if [[ ! -f "$HASH_FILE" ]]; then
  echo -e "\n${CLR_YELLOW}${CLR_BOLD}[AVISO] No se ha encontrado el token de seguridad configurado.${CLR_RESET}"
  echo -e "Iniciando configuración inicial del token secreto..."
  if [[ -x "$PROJECT_DIR/scripts/commit-token-setup.sh" ]]; then
    "$PROJECT_DIR/scripts/commit-token-setup.sh" || die "Falló la configuración del token."
  else
    die "No se encontró el script '$PROJECT_DIR/scripts/commit-token-setup.sh'."
  fi
fi

# 6. Preparar commit (git add -A)
echo -e "\n${CLR_CYAN}Preparando archivos para el commit...${CLR_RESET}"
git add -A

if git diff --cached --quiet; then
  echo -e "${CLR_YELLOW}No hay diferencias tras preparar los archivos. Nada que commitear.${CLR_RESET}"
  exit 0
fi

# 7. Ejecutar commit (el hook pre-commit solicitará el token)
echo -e "\n${CLR_BOLD}Confirmando cambios en '${TARGET_BRANCH}'...${CLR_RESET}"
echo -e "${CLR_CYAN}A continuación, el sistema solicitará tu token secreto de commit:${CLR_RESET}"

if ! git commit -m "$commit_message"; then
  echo -e "\n${CLR_RED}${CLR_BOLD}[ERROR] El commit fue cancelado o el token es incorrecto.${CLR_RESET}" >&2
  echo -e "${CLR_RED}NO se ha realizado ninguna subida a '${TARGET_BRANCH}'.${CLR_RESET}" >&2
  exit 1
fi

echo -e "\n${CLR_GREEN}✔ Commit creado exitosamente en la rama '${TARGET_BRANCH}'.${CLR_RESET}"

# 8. Subir a la rama DEVELOPMENT (SI O SI A DEVELOPMENT, NUNCA A PRODUCCIÓN)
echo -e "\n${CLR_CYAN}${CLR_BOLD}Subiendo cambios ÚNICA Y EXCLUSIVAMENTE a '${TARGET_REMOTE}/${TARGET_BRANCH}'...${CLR_RESET}"

# Verificación de seguridad final antes del push
final_branch="$(git branch --show-current 2>/dev/null || echo '')"
if [[ "$final_branch" != "$TARGET_BRANCH" ]]; then
  die "VIOLACIÓN DE SEGURIDAD: La rama actual ($final_branch) no es '$TARGET_BRANCH'. Se aborta el push."
fi

# Manejar autenticación remota si fuera HTTPS
remote_url="$(git remote get-url "$TARGET_REMOTE" 2>/dev/null || echo '')"

if [[ "$remote_url" =~ ^https:// ]]; then
  # Si el remoto es HTTPS, solicitar token de GitHub para push
  read_secret() {
    local prompt_text="$1"
    local var_name="$2"
    local val=""
    if [[ -r /dev/tty ]]; then
      printf '%b' "$prompt_text" >/dev/tty
      if ! IFS= read -r -s val </dev/tty; then
        printf '\nOperación cancelada por el usuario.\n' >/dev/tty
        exit 0
      fi
      printf '\n' >/dev/tty
    else
      printf '%b' "$prompt_text"
      if ! IFS= read -r -s val; then
        printf '\nOperación cancelada por el usuario.\n'
        exit 0
      fi
      printf '\n'
    fi
    printf -v "$var_name" '%s' "$val"
  }
  
  github_token=""
  read_secret "${CLR_BOLD}Token de acceso de GitHub (para subir por HTTPS): ${CLR_RESET}" github_token
  [[ -n "$github_token" ]] || die "El token de GitHub no puede estar vacío."
  
  askpass_file="$(mktemp "${TMPDIR:-/tmp}/github-askpass.XXXXXX")"
  cleanup() {
    rm -f -- "$askpass_file"
    unset github_token
  }
  trap cleanup EXIT
  
  chmod 700 "$askpass_file"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'case "$1" in' \
    '  *Username*|*username*) printf "%s\\n" "x-access-token" ;;' \
    '  *) printf "%s\\n" "'"$github_token"'" ;;' \
    'esac' > "$askpass_file"
    
  GIT_ASKPASS="$askpass_file" \
  GIT_TERMINAL_PROMPT=0 \
  git -c credential.helper= push --set-upstream "$TARGET_REMOTE" "$TARGET_BRANCH" || {
    die "Falló el push a '$TARGET_REMOTE/$TARGET_BRANCH'."
  }
else
  # Remoto SSH (predeterminado y seguro)
  if ! git push --set-upstream "$TARGET_REMOTE" "$TARGET_BRANCH"; then
    echo -e "\n${CLR_RED}${CLR_BOLD}[ERROR] Falló la subida a '$TARGET_REMOTE/$TARGET_BRANCH'.${CLR_RESET}" >&2
    echo -e "Revisa tu conexión o si necesitas sincronizar cambios previos con 'git pull --rebase $TARGET_REMOTE $TARGET_BRANCH'." >&2
    exit 1
  fi
fi

echo -e "\n${CLR_BOLD}================================================================${CLR_RESET}"
echo -e "${CLR_GREEN}${CLR_BOLD}✔ ¡OPERACIÓN COMPLETADA CON ÉXITO!${CLR_RESET}"
echo -e "  - Rama confirmada: ${CLR_BOLD}${TARGET_BRANCH}${CLR_RESET}"
echo -e "  - Rama remota:     ${CLR_BOLD}${TARGET_REMOTE}/${TARGET_BRANCH}${CLR_RESET}"
echo -e "  - Rama producción: ${CLR_GREEN}PROTEGIDA (INTACTA)${CLR_RESET}"
echo -e "${CLR_BOLD}================================================================${CLR_RESET}\n"
