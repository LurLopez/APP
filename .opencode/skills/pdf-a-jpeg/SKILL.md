---
name: pdf-a-jpeg
description: Exporta un PDF completo (p. ej. un 10-Q/10-K) a una imagen JPEG por página y las guarda en /home/lur/Lur/ANALISIAK/<TICKER>/<AÑO>/<TRIMESTRE>/Argazkiyak/, nombrando cada imagen como el PDF con el sufijo _1, _2, … _N según su página. Úsala cuando el usuario pida «las imágenes» o «las fotos» de un PDF, exportar un informe a JPG o convertir sus páginas a JPEG.
---

# Exportar un PDF a JPG (una imagen por página)

## Cuándo se usa

Cuando el usuario pida «las imágenes» (o las fotos) de un PDF: exportar cada página a JPEG y dejarlas guardadas en ANALISIAK.

## Destino y nombres

- Carpeta destino: `/home/lur/Lur/ANALISIAK/<TICKER>/<AÑO>/<TRIMESTRE>/Argazkiyak/` (crea las carpetas que falten con `mkdir -p`).
- Ejemplo: `PEP-2026-Q3.pdf` → `/home/lur/Lur/ANALISIAK/PEP/2026/Q3/Argazkiyak/PEP-2026-Q3_1.jpg`, `..._2.jpg`, … hasta la última página.
- El nombre de cada imagen es el del PDF (sin `.pdf`) + `_<n>`, donde `<n>` es el número de página, sin ceros a la izquierda.
- Si ya había imágenes de ese mismo PDF, se sustituyen (no se duplican).

## Datos de la ruta (ticker, año, trimestre)

- Si el usuario los indica en el mensaje, úsalos tal cual (ticker en mayúsculas).
- Si no, dedúcelos del nombre del PDF con la convención del usuario `TICKER-AÑO-TRIMESTRE.pdf`:
  - `PEP-2026-Q3.pdf` → PEP / 2026 / Q3 · `STZ-2027-Q2.pdf` → STZ / 2027 / Q2
  - Anuales: `...-10K` o `...-10-K` → se usa tal cual como «trimestre».
- Si el nombre no encaja con el patrón, pregunta solo esos datos antes de continuar.

## Comando (cópialo tal cual, cambiando solo las 4 primeras variables)

```bash
set -euo pipefail
pdf="/ruta/completa/PEP-2026-Q3.pdf"   # ruta absoluta del PDF
ticker="PEP"; year="2026"; quarter="Q3"
dest="/home/lur/Lur/ANALISIAK/$ticker/$year/$quarter/Argazkiyak"
base="$(basename "$pdf")"; base="${base%.*}"
mkdir -p "$dest"
tmp="$(mktemp -d)"
pdftoppm -jpeg -r 150 -sep _ "$pdf" "$tmp/page"
rm -f "$dest/${base}"_[0-9]*.jpg
i=1
for f in "$tmp"/page_*.jpg; do
  [ -e "$f" ] || { echo "ERROR: no se generó ninguna página"; rm -rf "$tmp"; exit 1; }
  mv -f "$f" "$dest/${base}_${i}.jpg"
  i=$((i+1))
done
rm -rf "$tmp"
ls -la "$dest"
```

## Reglas

- Una imagen por página, en orden; el PDF original no se toca.
- Resolución por defecto 150 ppp; si el usuario pide otra (p. ej. «a 200 dpi»), cambia `-r 150` por la que pida.
- Al terminar, comprueba que el número de JPG coincide con `pdfinfo "$pdf" | grep -i pages` y responde con la ruta destino y el recuento (p. ej. «12 imágenes en …/Argazkiyak/»).
- Responde en el idioma del usuario (normalmente español).
