# Pendientes — Consumo discrecional

> Estado del sector `consumer_discretionary`: **habilitado para análisis trimestrales (10-Q) y anuales (10-K)**.
> Este documento recoge lo que queda pendiente por desarrollar, en especial la especialización por subsector (Nivel 3).

---

## 1. Estado actual (operativo)

| Pieza | Dónde | Estado |
|---|---|---|
| Clasificación por ticker (161 empresas) | `src/agents/sectorAgent.js` → `KNOWN_CONSUMER_DISCRETIONARY_TICKERS` | ✅ |
| Clasificación por SIC | `src/agents/sectorAgent.js` → `CONSUMER_DISCRETIONARY_SIC_RANGES` | ✅ |
| Clasificación con IA (fallback) | Prompt del verificador de sector | ✅ |
| Política de ajustes (idéntica a consumo defensivo) | `src/agents/analyst/sectorPolicy.js` → `CONSUMER_ADD_BACK_POLICY` | ✅ |
| Reglas de sector (Nivel 2) 10-Q y 10-K | `src/agents/knowledge/consumo-discrecional/sector.md` | ✅ |
| Versionado del análisis | `src/agents/versionRegistry.js` | ✅ |
| Paridad de cálculos con consumo defensivo | `tests/unit/sectorCalculationParity.test.js` | ✅ |
| Pregeneración en lote | `npm run analyze:discretionary` (worker, 10-Q y 10-K) | ✅ |

---

## 2. Subsectores admitidos y su Nivel 3 pendiente

Para cada subsector falta crear `src/agents/knowledge/consumo-discrecional/subsectores/<slug>/subsector.md`
(Nivel 3, empezando por `> Versión: 1`) y su carpeta `ejemplos/`, siguiendo la estructura de
`consumo-defensivo/subsectores/cerveceras`.

1. **Mejora del hogar y distribución de materiales** — HD, LOW, TSCO, FND, BLDR, BECN, GMS, POOL, GPC, LKQ.
   Pendiente: pro sales (contratista vs DIY), big-ticket y sensibilidad a tipos hipotecarios, comps de ticket vs transacciones, distribución B2B.
2. **Grandes almacenes, descuento y off-price** — M, JWN, KSS, DDS, TJX, ROST, BURL, FIVE, OLLI.
   Pendiente: modelo off-price (compras oportunistas, inventario por rotación), comparables con/sin e-commerce, promociones y markdowns, estacionalidad navideña.
3. **Ropa, calzado y complementos** — NKE, LULU, VFC, PVH, RL, TPR, CPRI, LEVI, DECK, CROX, SKX, UAA.
   Pendiente: wholesale vs DTC, márgenes por canal, inventario en semanas, descuentos, vida útil de la marca.
4. **Hogar, muebles, electrodomésticos y ocio** — RH, WSM, LZB, WHR, HAS, MAT, GRMN, YETI.
   Pendiente: ciclicidad de la vivienda, bienes duraderos, niveles de inventario, exposición arancelaria.
5. **Retail especializado** — BBY, GME, DKS, ASO, ULTA, ORLY, AZO, AAP.
   Pendiente: ticket medio, servicios y recambios (autopartes aftermarket), categorías discretionales vs recurrentes.
6. **Comercio electrónico** — AMZN, EBAY, ETSY, W, CHWY, RVLV, FIGS.
   Pendiente: deferred revenue (tarjetas regalo, suscripciones, pedidos no entregados), take rate, fulfillment vs margen, estacionalidad del Q4.
7. **Concesionarios de automóviles y vehículos usados** — KMX, CVNA, AN, PAG, LAD, ABG, GPI, SAH, CRMT.
   Pendiente: unidad/vehículo, margen por unidad, financiación cautiva (F&I), inventario usado y precios, ciclo de tipos.
8. **Restaurantes** — MCD, SBUX, YUM, CMG, DRI, WEN, TXRH, DPZ, PZZA, CAVA, SHAK, WING, EAT, DINE, CAKE.
   Pendiente: comps desglosados en tráfico y ticket, mix de canales (delivery, digital), franquicias vs compañía propias, food/paper cost y labor cost, aperturas netas.
9. **Vivienda y materiales de construcción** — DHI, LEN, NVR, PHM, TOL, KBH, MTH, TREX, AZEK, MAS, AWI, JELD, LESL.
   Pendiente: backlogs, tipos hipotecarios, incentivos de venta, rotación de inventario de terrenos, ciclicidad.
10. **Autopartes** — APTV, BWA, LEA, DAN, GNTX, SMP, DORM, XPEL, FOXF.
    Pendiente: contenido por vehículo, mix OEM vs aftermarket, plataformas/ciclo de producción, coste de materias primas.

---

## 3. Puntos transversales pendientes (los detectados en el diseño del sector)

- **Ventas comparables (comps)**: tráfico y ticket, aperturas netas vs tiendas maduras, online vs tienda física. Hoy `volumeGrowth` transporta comps o ventas totales como dato contextual; si algún cálculo pasa a depender de esto, extraerlo de forma determinista.
- **Arrendamientos operativos**: no forman parte de la Deuda Balance; comentar vencimientos y compromisos si son materiales (retail y restaurantes).
- **Sale-leaseback**: explicar como entrada puntual de caja y no como desinversión operativa recurrente.
- **Inventario**: vigilar inventario por tienda vs ventas y riesgo de rebajas; impacta al margen bruto.
- **Estacionalidad**: comparar siempre contra el mismo trimestre del año anterior (no contra el trimestre inmediatamente anterior).
- **E-commerce**: ingresos diferidos por tarjetas regalo, suscripciones y pedidos no entregados dentro del WC.
- **Reglas anuales específicas (opcional)**: `src/agents/knowledge/anual/consumo-discrecional/sector.md`. Hoy el 10-K usa `anual/general.md` + el `sector.md` trimestral, que ya funciona.
- **Universo del worker con capitalización**: hoy `npm run analyze:discretionary` pregenera la lista curada de `KNOWN_CONSUMER_DISCRETIONARY_TICKERS` (161 empresas); no hay modos `large/all` porque falta el dataset de market caps (como `scripts/data/consumer-staples.js`).
- **Portada/SEO**: la web sigue anunciando solo consumo defensivo (y tecnología en algunas guías); actualizar los textos cuando se quiera comunicar la cobertura completa.
