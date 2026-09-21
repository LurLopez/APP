# Sector: Consumo Discrecional (Consumer Discretionary)

> Nivel 2 — Reglas transversales aplicables a las empresas de consumo discrecional admitidas: retail y distribución, restaurantes, ropa/calzado/complementos, hogar y ocio, comercio electrónico, concesionarios, vivienda y materiales, y autopartes.
> Versión: 1

---

## 0. Alcance del sector (subsectores admitidos)

Solo se admiten estos subsectores; cualquier otro negocio de consumo discrecional se rechaza:

1. **Mejora del hogar y distribución de materiales**: retail de ferretería, jardinería y materiales de construcción, y su distribución.
2. **Grandes almacenes, descuento y off-price**: department stores, tiendas de descuento y outlet.
3. **Ropa, calzado y complementos**: retail y marcas de confección, calzado, joyería y complementos.
4. **Hogar, muebles, electrodomésticos y ocio**: muebles y decoración, electrodomésticos, juguetes, material deportivo y electrónica de consumo.
5. **Retail especializado**: electrónica, deporte y recambios de automoción.
6. **Comercio electrónico**: retail online y venta por catálogo.
7. **Concesionarios de automóviles y vehículos usados**.
8. **Restaurantes**: restaurantes, comida rápida y casual dining.
9. **Vivienda y materiales de construcción**: promotoras de vivienda, casas prefabricadas y fabricantes de productos para el hogar.
10. **Autopartes**: fabricantes de componentes de automoción.

**Fuera del sector (se rechaza):** fabricantes de automóviles (GM, Ford, Tesla…), hoteles, cruceros, casinos, parques de ocio y agencias de viaje, educación y servicios de consumo, y cualquier negocio de consumo discrecional no incluido en la lista anterior.

---

## 1. Reglas de Ajuste Contable

1. **Doble visión Ajustado/Normal**: Toda métrica de la cuenta de resultados se presenta en dos columnas:
   - **Ajustado**: excluye partidas extraordinarias, amortización y deterioro de intangibles e impuestos normalizados.
   - **Normal**: cifras tal y como las reporta la empresa bajo US-GAAP.
   - Las diferencias entre ambas columnas se justifican en notas al pie (*1, *2...).

2. **Intangibles a 0 (Beneficio Operativo)**: La amortización y el deterioro (*impairment*) de activos intangibles y fondos de comercio se excluyen del resultado operativo (se ajustan a 0) por no representar consumo de caja ni valor operativo recurrente. Aplica igual al periodo actual y a la columna **Anterior Ajustado**.
   - **Casilla exclusiva de resalte**: El color de resalte y la llamada de nota (`*1`) se aplican **ÚNICAMENTE a la casilla de Beneficio Operativo**.
   - **Líneas derivadas**: EBT y Beneficio Neto recalculan su importe en la columna Ajustado arrastrando el nuevo beneficio operativo, pero **no se colorean ni llevan asterisco por este concepto**.

3. **Impuestos Normalizados (Beneficio Neto)**: Se compara el impuesto reportado con el **23 % del EBT ajustado**. Si la desviación relativa supera `-20 %` o `+20 %`, se normalizan los impuestos al 23 %: Beneficio Neto Ajustado = EBT Ajustado × 0,77. Si queda dentro de ±20 %, se conserva el impuesto reportado o el tipo efectivo aplicable.
   - **Casilla exclusiva de resalte**: El color de resalte y la llamada de nota (`*2`) se aplican **ÚNICAMENTE a la casilla de Beneficio Neto**.

4. **Cash Flow con Capital Circulante (WC)**: El capital circulante teórico se estima con el **peso agregado histórico** del circulante sobre el flujo operativo sin circulante de los últimos 10 ejercicios (método único, común a todos los sectores admitidos):
   $$\text{WC}_{\text{teórico}} = \left( \frac{\sum \Delta WC}{\sum (\text{CFO} - \Delta WC)} \right)_{\text{últimos 10 ejercicios}} \times (\text{CFO} - \Delta WC)_{\text{periodo}}$$
   - En retail el circulante suele ser **negativo** (las cuentas por pagar a proveedores financian el inventario): una necesidad teórica negativa es normal y no un error.
   - **Estacionalidad**: el inventario y la caja se concentran en el trimestre clave (navidad en retail generalista, verano en ocio). Comparar siempre trimestre actual contra el mismo trimestre del año anterior, no contra el trimestre inmediatamente anterior.
   - **E-commerce**: vigilar los ingresos diferidos (*deferred revenue*) por tarjetas regalo, suscripciones y pedidos no entregados, y explicar su efecto en la caja operativa.
   - En la cabecera de la tabla se presentan los dos escenarios con sus valores numéricos: **`Normal (WC=valorBase)`** y **`Ajustado*1 (WC=valorAjustado)`**. El ajuste se aplica con la fórmula general y las notas reinician en `*1` en este bloque.

5. **Métricas operativas: ventas comparables (comps)**: A diferencia de consumo defensivo, aquí no se reporta volumen físico de unidades. La métrica clave es el **crecimiento de ventas comparables** (*comparable sales*, *same-store sales*, *comps*), desglosando si existe:
   - Crecimiento **orgánico de tiendas maduras** (comps) frente a la **apertura neta** de nuevos establecimientos.
   - Tráfico y ticket medio cuando el informe los publique (restaurantes: *traffic* y *check*; retail: *transactions* y *average ticket*).
   - Crecimiento online vs. tienda física cuando se desglose.
   - En la extracción, `volumeGrowth` debe reflejar el crecimiento de ventas comparables del periodo (o, si no se publica, el crecimiento de ventas total); es un dato contextual de respaldo, el WC teórico se calcula con el peso agregado histórico.

6. **Arrendamientos operativos**: Los pasivos por arrendamiento operativo (*operating lease liabilities*) **no forman parte de la Deuda Balance** de la tabla (no son deuda financiera). Si su importe es material (retail y restaurantes), se comenta su peso y los vencimientos en las notas o en el comentario, junto a las obligaciones de compra y compromisos contractuales. Las rentas pagadas figuran en el flujo operativo y no se suman de vuelta.

7. **BPA Ajustado**: El BPA se calcula exclusivamente con el Beneficio Neto Ajustado y el número de acciones diluidas del periodo. Si una operación corporativa tiene un efecto incierto en el BPA, no se especula en el cálculo y se explica en nota.

8. **Ajuste Obligatorio de Deterioros / Impairments del Ejercicio Anterior (Bloque 1)**: Si en el ejercicio anterior comparable hubo deterioros extraordinarios (impairments de goodwill, marcas o intangibles), sumar de vuelta obligatoriamente dicho deterioro en la columna "Anterior Ajustado" para Beneficio Operativo, EBT y Beneficio Neto, con su nota explicativa.

9. **Asignación de Capital (Bloque 3)**:
   - **Fórmulas**: Deuda Balance = deuda a largo plazo + deuda a corto plazo / vencimientos corrientes (excluye cuentas a pagar a proveedores); Deuda Neta = Deuda Balance − (Efectivo y equivalentes + Inversiones a corto plazo). Deuda y Caja se miden por la variación de saldos del balance (nunca por el cambio neto de efectivo del estado de flujos).
   - **Compras de negocio vs. inversiones financieras**: la fila **Adquisiciones** recoge los pagos de la línea de inversión del estado de flujos ("Acquisitions, net of cash acquired, non-marketable investments, and other"). En comercio electrónico y empresas con cartera de inversiones esa línea puede incluir compras de participaciones o acciones preferentes de otras compañías (p. ej. Anthropic, OpenAI): son inversiones, **no adquisiciones de negocio**, y la nota debe identificarlas como tales. Una inversión financiera **nunca genera la fila `Deuda asumida (no-cash)`**.
   - **Deuda asumida (no-cash)**: solo se registra si consta una compra de negocio identificada en la nota y deuda preexistente de la empresa adquirida traspasada con la operación. El aumento de deuda del balance se contrasta siempre con las emisiones y amortizaciones del estado de flujos; si estas lo explican (o casi), no hay deuda asumida que restar.
   - **Revalorizaciones no realizadas de inversiones**: las ganancias por cambios de precio observable (*upward adjustments*) de participaciones (Anthropic, OpenAI) no son resultado recurrente ni entrada de caja: se explican en nota, no se mezclan con el margen operativo y no se presentan como beneficio recurrente del negocio.
   - **Operaciones con marcas y enseñas**: al comprar o vender marcas, cadenas o carteras de tiendas, identificar siempre la enseña o negocio concreto y su encaje estratégico, con el importe y el trimestre previsto de liquidación. Los **sale-leaseback** (venta de inmuebles y posterior alquiler) se explican en la nota: entrada puntual de caja que no debe confundirse con desinversión operativa recurrente.
   - **Recompras**: valorar si reducen realmente las acciones en circulación o solo compensan la dilución por remuneración en acciones.
   - **Inventario**: si el inventario por tienda crece muy por encima de las ventas, advertir del riesgo de rebajas promocionales (*promotions*) y deterioro de stock en la nota de margen.
   - **Filtro de significatividad y unicidad de filas**: se aplican las reglas generales (partidas ≥ 50M, cada fila exactamente una vez).

10. **Análisis anual (10-K)**: Además de las adquisiciones y desinversiones, explicar las operaciones corporativas (fusiones, spin-offs, reestructuraciones) que representen ≥ 5 % de los ingresos consolidados, con hechos, fechas, importes e impacto esperado; y la evolución de comps, aperturas y cierres de tiendas del ejercicio.
