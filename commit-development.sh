#!/usr/bin/env bash
#Uso:
#cd /home/lur/Lur/APP
#./commit-development.sh


set -Eeuo pipefail

readonly REMOTE_URL="https://github.com/LurLopez/APP.git"
readonly BRANCH="development"
readonly PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || die "Git no está instalado o no está disponible en PATH."

cd -- "$PROJECT_DIR"

if [[ ! -e .git ]]; then
  printf 'Inicializando el repositorio Git local...\n'
  git init -q
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git switch "$BRANCH"
  else
    git switch -c "$BRANCH"
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  printf '\nArchivos modificados que se incluirán:\n'
  git status --short

  printf '\nMensaje del commit: '
  if ! IFS= read -r commit_message; then
    die "No se recibió ningún mensaje de commit."
  fi
  if [[ -z "${commit_message//[[:space:]]/}" ]]; then
    die "El mensaje del commit no puede estar vacío."
  fi

  git add -A
  git diff --cached --quiet && die "No hay cambios para confirmar."
  git commit -m "$commit_message"
else
  printf '\nNo hay archivos modificados para confirmar.\n'
fi

git rev-parse --verify HEAD >/dev/null 2>&1 || die "No existe ningún commit local para subir."

printf '\nToken de GitHub (no se guardará): '
if ! IFS= read -r -s GITHUB_TOKEN; then
  printf '\n'
  die "No se recibió ningún token."
fi
printf '\n'
[[ -n "$GITHUB_TOKEN" ]] || die "El token no puede estar vacío."
export GITHUB_TOKEN

askpass_file="$(mktemp "${TMPDIR:-/tmp}/github-askpass.XXXXXX")"
cleanup() {
  rm -f -- "$askpass_file"
  unset GITHUB_TOKEN
}
trap cleanup EXIT

chmod 700 "$askpass_file"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'case "$1" in' \
  '  *Username*|*username*) printf "%s\\n" "x-access-token" ;;' \
  '  *) printf "%s\\n" "$GITHUB_TOKEN" ;;' \
  'esac' > "$askpass_file"

printf 'Subiendo a la rama %s...\n' "$BRANCH"
GIT_ASKPASS="$askpass_file" \
GIT_TERMINAL_PROMPT=0 \
git -c credential.helper= push --set-upstream origin "$BRANCH"

printf 'Cambios subidos correctamente a %s.\n' "$BRANCH"
