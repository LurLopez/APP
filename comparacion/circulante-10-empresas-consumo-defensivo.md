# Circulante: peso agregado histórico vs fórmula (inflación + volumen)

Comparación con datos reales de EDGAR (10 ejercicios) sobre 10 empresas de consumo defensivo.
La "fórmula utilizada" se evalúa con los valores por defecto del sector cuando no hay volumen:
inflación 3 % + volumen 0 %.

- **Reportado ΔWC**: sección "Changes in operating assets and liabilities" de la serie anual de EDGAR (mismo criterio que el histórico), en millones. Signo del estado de flujos: negativo = consumo de caja.
- **Fórmula 3 %**: `(Cuentas por pagar − Inventarios − Cuentas por cobrar) × 3 %` con el saldo de cierre.
- **Peso agregado 10a**: `ΣΔWC / Σ(CFO − ΔWC)` de los 10 ejercicios; teórico = peso × `(CFO − ΔWC)` del último ejercicio.

| Empresa | Año | Ventas | CFO | Base cierre (AP−Inv−AR) | ΔWC reportado | Base periodo (CFO−ΔWC) | Fórmula 3 % | Desvío 3 % | Peso ag. 10a | Teórico histórico | Desvío hist. | Más cerca |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| KO | 2025 | 47.941 | 7.408 | −1.814 | −7.208 | 14.616 | −54 | −7.154 | −10,2 % | −1.484 | −5.724 | histórico |
| PEP | 2025 | 93.925 | 12.087 | −5.647 | −1.407 | 13.494 | −169 | −1.238 | −3,0 % | −402 | −1.005 | histórico |
| PG | 2026 | 87.032 | 19.556 | +2.080 | +362 | 19.194 | +62 | +300 | +0,8 % | +144 | +218 | histórico |
| CL | 2025 | 20.382 | 4.198 | −1.618 | +93 | 4.105 | −48 | +142 | +0,7 % | +29 | +64 | histórico |
| KMB | 2025 | 16.447 | 2.777 | +21 | −503 | 3.280 | +1 | −504 | +3,2 % | +104 | −606 | 3 % |
| KHC | 2025 | 24.942 | 4.462 | −1.113 | −19 | 4.481 | −33 | +14 | −6,1 % | −275 | +256 | 3 % |
| GIS | 2025 | 18.425 | 2.166 | +165 | −478 | 2.645 | +5 | −483 | +3,3 % | +87 | −565 | 3 % |
| MKC | 2025 | 6.840 | 962 | −641 | −84 | 1.046 | −19 | −65 | −0,3 % | −3 | −81 | 3 % |
| CPB | 2025 | 10.253 | 1.131 | −675 | −247 | 1.378 | −20 | −227 | −4,5 % | −62 | −185 | histórico |
| TAP | 2025 | 11.141 | 1.784 | +404 | −147 | 1.931 | +12 | −159 | −2,1 % | −41 | −105 | histórico |

## Resultado

- Error absoluto medio frente al reportado: **fórmula 3 % = 1.028M** · **peso agregado = 881M**.
- El peso agregado se acerca más al reportado en **6 de 10** casos (KO, PEP, PG, CL, CPB, TAP).
- El 3 % se acerca más donde la base de circulante es mínima o positiva (KMB, GIS, KHC, MKC),
  porque el peso agregado predice una liberación que ese ejercicio no ocurrió.
- Ninguno de los dos estima bien los años con movimientos extraordinarios (KO: −7.208M reportados
  frente a −1.484M estimados); esa diferencia es precisamente el desvío que se descuenta del Cash Flow.

## Reproducir

`node --env-file=.env scripts/qa/compare-working-capital.js` (usa
`getCompanyResults` + `buildWorkingCapitalHistory`).
