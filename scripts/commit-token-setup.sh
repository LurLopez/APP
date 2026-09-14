#!/usr/bin/env bash
# Configura el token que protege los commits de este repositorio.
# Solo el propietario debe conocerlo: los agentes no pueden introducirlo.
#
# Uso: ./scripts/commit-token-setup.sh

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SOURCE="$PROJECT_DIR/scripts/hooks/pre-commit"
LOCK_DIR_NAME="cifra-commit-lock"

home_dir=""
if command -v getent >/dev/null 2>&1; then
  home_dir="$(getent passwd "$(id -u)" | cut -d: -f6)"
fi
[[ -n "$home_dir" ]] || home_dir="${HOME:-}"
[[ -n "$home_dir" ]] || { printf 'Error: no se pudo determinar el directorio home.\n' >&2; exit 1; }

HOOK_DIR="$home_dir/.config/$LOCK_DIR_NAME"
HASH_FILE="$HOOK_DIR/token.sha256"

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

[[ -f "$HOOK_SOURCE" ]] || die "no se encuentra $HOOK_SOURCE."
command -v git >/dev/null 2>&1 || die "git no está disponible en PATH."
[[ -r /dev/tty && -w /dev/tty ]] || die "hace falta una terminal interactiva."

read -r -s -p 'Elige el token de commit (no se mostrará): ' token </dev/tty; printf '\n'
read -r -s -p 'Repite el token: ' token2 </dev/tty; printf '\n'

[[ -n "$token" ]] || die "el token no puede estar vacío."
[[ "${#token}" -ge 8 ]] || die "usa un token de al menos 8 caracteres (recomendado 16 o más)."
[[ "$token" == "$token2" ]] || die "los tokens no coinciden."

salt="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
if command -v sha256sum >/dev/null 2>&1; then
  hash="$(printf '%s' "$salt$token" | sha256sum | cut -d' ' -f1)"
else
  hash="$(printf '%s' "$salt$token" | shasum -a 256 | cut -d' ' -f1)"
fi

mkdir -p "$HOOK_DIR"
printf '%s$%s\n' "$salt" "$hash" > "$HASH_FILE"
chmod 600 "$HASH_FILE"
install -m 755 "$HOOK_SOURCE" "$HOOK_DIR/pre-commit"

git_dir="$(git -C "$PROJECT_DIR" rev-parse --absolute-git-dir)"
install -m 755 "$HOOK_SOURCE" "$git_dir/hooks/pre-commit"
git -C "$PROJECT_DIR" config core.hooksPath "$HOOK_DIR"

if sudo -v; then
  sudo chown root:root "$HOOK_DIR" "$HOOK_DIR/pre-commit" "$HASH_FILE"
  sudo chmod 755 "$HOOK_DIR" "$HOOK_DIR/pre-commit"
  sudo chmod 644 "$HASH_FILE"
  sudo chown root:root "$git_dir/hooks" "$git_dir/hooks/pre-commit"
  sudo chmod 755 "$git_dir/hooks" "$git_dir/hooks/pre-commit"
  printf 'Protección reforzada aplicada: los archivos del bloqueo pasan a ser de root.\n'
else
  printf 'Aviso: sin sudo el bloqueo funciona, pero no queda protegido frente a ediciones.\n' >&2
fi

unset token token2 salt hash
printf 'Listo. A partir de ahora cada commit pedirá el token.\n'
