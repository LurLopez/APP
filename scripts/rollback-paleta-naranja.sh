#!/usr/bin/env bash
# Rollback a la paleta naranja (tipo TIKR, anterior al 2026-09-10)
# Uso: bash scripts/rollback-paleta-naranja.sh
set -e
cd "$(dirname "$0")/.."
BACKUP="backup/paleta-naranja-2026-09-10"

for f in styles.css empresa.js portfolio.js index.html empresa.html; do
  cp "$BACKUP/$f" "public/$f"
done

# Restaurar versiones de cache-busting anteriores a la nueva identidad
sed -i 's|/styles.css?v=90|/styles.css?v=89|g' public/index.html public/empresa.html
sed -i 's|/empresa.js?v=56|/empresa.js?v=55|g' public/index.html public/empresa.html
sed -i 's|/portfolio.js?v=62|/portfolio.js?v=61|g' public/index.html public/empresa.html

echo "OK: restaurada la paleta naranja desde $BACKUP"
echo "Recuerda: recarga con Ctrl+F5 en el navegador."
