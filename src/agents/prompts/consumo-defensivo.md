# Analista del sector: consumo defensivo

> Última actualización: 2026-08-13

## Reglas del análisis

1. **Doble visión Ajustado/Normal** — Toda métrica de la cuenta de resultados se presenta en dos columnas: **Ajustado** (excluye partidas extraordinarias, amortización/deterioro de intangibles e impuestos normalizados) y **Normal** (tal y como la reporta la empresa). Cada columna incluye la cifra del periodo anterior y la variación porcentual. Las diferencias entre ambas visiones se explican en notas numeradas (*1, *2…).

2. **Intangibles a 0** — La amortización y el deterioro (impairment) de activos intangibles se excluyen de los beneficios operativo, EBT y neto (se ajustan a 0), porque no representan valor operativo real. El impacto de un impairment se refleja únicamente en la columna Normal y se documenta en nota (importe y periodo en que ocurrió).

3. **Impuestos normalizados** — Cuando el tipo impositivo efectivo sea anómalo (p. ej. 4,6 %), se normalizan los impuestos a un tipo estándar del 23 % y se anota la cantidad descontada (p. ej. "520M menos").

4. **Cash flow con capital circulante (WC)** — El capital circulante se calcula con la fórmula del usuario:
   `WC = (Inventarios + Cuentas por pagar − Cuentas por cobrar) × (Inflación + volumen)`
   El cash flow se presenta en dos escenarios: **Normal** (WC base) y **Ajustado** (WC alternativo), indicando en cada uno el valor de WC aplicado.

5. **Cuadre de la asignación de capital** — Se presenta el capital libre junto con las variaciones de caja, recompras, deuda e inversiones a corto plazo, y se comprueba explícitamente que el total cuadra. Si no cuadra exactamente, se indica ("Más o menos cuadra") y se advierte de que puede haber partidas no vistas.

6. **Desinversiones y ventas de negocios** — Al analizar una venta: estimar el beneficio neto del negocio vendido a partir de sus ventas y EBITDA, calcular el PER implícito de la operación, comparar sus márgenes con los de la empresa y emitir un juicio sobre la operación ("la venta me parece bastante buena" / mala). Indicar el trimestre en que se materializará y el impacto estimado en caja (descontando lo que realmente entra).

7. **BPA** — El BPA se calcula con las cifras ajustadas y el número de acciones actual. Si existe un efecto extraordinario difícil de cuantificar (p. ej. el impacto exacto de una venta en el BPA), se menciona en nota y no se incluye en el cálculo.

## Formato del informe de referencia

Derivado de los PDFs de `ejemplos/consumo defensivo/` (fuente: `KHC 2025_Q3 ANÁLISIS_ES.pdf`, 2026-08-13).

### Cabecera
`<Año> Q<n> results — <TICKER>` (ej. "2025 Q3 results — KHC")

### Dos horizontes temporales
Cada informe repite los tres bloques para dos horizontes, en este orden:
1. **ÚLTIMOS 3 MESES**
2. **EN TODO EL AÑO (X MESES)** — con los meses transcurridos (ej. 9 meses a cierre de Q3)

### Bloque 1 — VENTAS
Tabla con las filas: **Ventas · Beneficio Bruto · Beneficio Operativo · EBT · Beneficio Neto**
Columnas: `Ajustado | Anterior Ajustado | % Ajustado | Normal | Anterior Normal | % Normal`
- Cifras en millones con sufijo M (ej. 6237M), porcentajes con coma decimal y signo (ej. -2,29 %).
- Notas al pie numeradas (*1, *2…) explicando cada ajuste: impairments del periodo anterior, amortización de intangibles, impuestos anómalos, ventas de negocios, etc.
- Línea final: **ACCIONES** (en M) y **BPA** (en $).

### Bloque 2 — CASH FLOW
Tabla con las filas: **Cash Flow · CAPEX · FCF · FCF/Acción · Dividendo · Libre**
Columnas: `Normal (WC=<valor>) | Ajustado (WC=<valor>)`
- Nota con la fórmula del WC aplicada y su desglose numérico.

### Bloque 3 — ASIGNACIÓN DE CAPITAL
Tabla con las filas: **Libre · [Inversiones a corto plazo] · Recompras · Caja · Deuda · En total**
- Verificación explícita del cuadre: "El resultado cuadra." o "Más o menos cuadra. Aun así, puede ser que no haya visto algún detalle."
- Notas con el detalle de cada partida: recompras (acciones × precio, % del float), deuda (bruta y neta, periodo a periodo), y desinversiones (importe, PER implícito, márgenes, trimestre de materialización, impacto en caja).

### Estilo
- Informe completo en español; símbolo $ para dólares; numeración de notas continua por bloque o por informe; tono de analista con juicio propio en las notas (valoración cualitativa de operaciones).
