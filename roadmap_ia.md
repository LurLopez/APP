# Roadmap de Inteligencia Artificial (Cifra)

> Hoja de ruta para la organización, despliegue y especialización de la IA analista financiera en Cifra mediante la arquitectura jerárquica de Skills y Conocimiento (*General → Sector → Subsector*).

---

## 1. Arquitectura de Conocimiento Jerárquico

Toda la base de conocimiento se estructura bajo `src/agents/knowledge/`:

```text
src/agents/knowledge/
├── general.md                          <-- [NIVEL 1] Reglas universales y formato de informes
│
├── <sector>/                           <-- [NIVEL 2] Reglas transversales del sector
│   ├── sector.md
│   ├── ejemplos/                       <-- PDFs e informes de referencia del sector
│   └── subsectores/                    <-- [NIVEL 3] Especialización de nicho
│       └── <subsector>/
│           ├── subsector.md            <-- Reglas específicas con Frontmatter YAML (aliases, SIC)
│           └── ejemplos/
```

### Reglas de Nomenclatura
- Todo en minúsculas, sin tildes ni caracteres especiales (`consumo-defensivo`, no `Consumo Defensivo`).
- Separación de palabras con guiones (`cuidado-personal-hogar`, no espacios).
- El archivo de sector siempre se llama `sector.md`.
- El archivo de subsector siempre se llama `subsector.md`.

---

## 2. Fases de Implementación Sectorial

### Fase 1: Consumo Defensivo (`consumo-defensivo`) — [EN CURSO / BETA]
Foco actual de la aplicación (beta 10-Q / 10-K en EE. UU.).

- [x] **`general.md`**:
  - Horizontes temporales: 3 meses y acumulado (excepción de horizonte único en Q1).
  - 3 Bloques obligatorios: Ventas, Cash Flow y Asignación de Capital.
  - Paleta multicolor coordinada para casillas ajustadas y notas al pie (`*1` amarillo, `*2` celeste, `*3` naranja, `*4` rosa, `*5` verde menta, `*6` violeta).
  - Porcentajes: verde para variaciones positivas (`#16a34a`) y rojo para negativas (`#dc2626`).
  - Deducción de Cash Flow trimestral a partir del acumulado ($\text{YTD } Q_n - \text{YTD } Q_{n-1}$).
- [x] **`consumo-defensivo/sector.md`**:
  - Intangibles a 0 (fondo de comercio e intangibles fuera del beneficio operativo).
  - Doble visión obligatoria: Ajustado vs Normal.
  - Fórmula de Working Capital (WC) con inflación y volumen.
  - Impuestos normalizados al 23 % en caso de anomalías.
  - Criterios para desinversiones y ventas de negocios (cálculo de PER implícito e impacto en caja).
- **Subsectores de Consumo Defensivo**:
  - [x] **`cerveceras/`**: Desglose de crecimiento en volumen (hectolitros / hl), precio/mix y divisa (FX); sensibilidad al coste de latas de aluminio, cebada cervecera y fletes; estacionalidad en Q2-Q3.
  - [ ] **`tabaco/`**: Desglose de volumen de cigarrillos tradicionales (combustibles) vs nuevas categorías libres de humo (bolsas de nicotina oral / ZYN, vapeo); impacto de impuestos especiales (*excise taxes*); cobertura del dividendo sobre FCF.
  - [ ] **`alimentacion/`**: Poder de fijación de precios (*pricing power*) en marcas consolidadas; sensibilidad a costes agrícolas (trigo, azúcar, cacao); margen bruto unitario.
  - [ ] **`cuidado-personal-hogar/`**: Marcas globales (P&G, Colgate, Kimberly-Clark); correlación con materias primas (pulpa, plásticos) y fletes globales; intensidad publicitaria sobre ventas.
  - [ ] **`supermercados-retail/`**: Márgenes operativos finos (2 % - 4 %); rotación de inventarios; cuota de marca blanca vs marcas de fabricante.

---

### Fase 2: Expansión Prioritaria — Inmobiliario y Consumo Cíclico

#### 1. Inmobiliario / REITs (`reits`)
La contabilidad de los REITs descarta el beneficio neto tradicional debido a la depreciación de inmuebles.
- [ ] **`reits/sector.md`**:
  - Métricas obligatorias: **FFO** (*Funds From Operations*), **AFFO** (*Adjusted FFO*), **NOI** (*Net Operating Income*).
  - Valor Neto de los Activos (**NAV**) y ratios de ocupación (*Occupancy Rate*).
  - Estructura de deuda: coste medio de la deuda, tipos fijos vs variables y vencimientos.
- **Subsectores previstos**:
  - `reits/subsectores/residencial/` (Apartamentos y viviendas de alquiler).
  - `reits/subsectores/logistica-industrial/` (Centros de distribución logística, almacenes).
  - `reits/subsectores/comercial/` (Centros comerciales, locales a pie de calle, *triple net lease*).
  - `reits/subsectores/data-centers/` (Centros de datos e infraestructura digital).
  - `reits/subsectores/salud/` (Hospitales, residencias de mayores y consultorios médicos).

#### 2. Consumo Cíclico / Discrecional (`consumo-ciclico`)
Empresas cuyos ingresos y márgenes dependen de la confianza del consumidor y el ciclo macroeconómico.
- [ ] **`consumo-ciclico/sector.md`**:
  - Apalancamiento operativo en caídas y expansiones de ventas.
  - Control de inventarios para evitar rebajas agresivas que destruyan el margen bruto.
- **Subsectores previstos**:
  - `consumo-ciclico/subsectores/automocion/` (Fabricantes de vehículos, concesionarios, transición a VE).
  - `consumo-ciclico/subsectores/restaurantes/` (Crecimiento de ventas mismas tiendas / *Same-Store Sales*, franquicias vs locales propios).
  - `consumo-ciclico/subsectores/lujo-textil/` (Poder de fijación de precios, penetración en mercados clave como Asia).
  - `consumo-ciclico/subsectores/viajes-hoteles/` (RevPAR en hoteles, ocupación, deuda post-expansión).

---

### Fase 3: Cobertura Completa del Mercado (GICS)

Planificación para el resto de sectores de Wall Street:

| Sector | Carpeta | Subsectores Previstos | Criterios y Métricas Específicas |
| :--- | :--- | :--- | :--- |
| **Tecnología** | `tecnologia/` | `software-saas`, `semiconductores`, `hardware` | ARR, NRR, Churn, regla del 40 %, dilución por SBC (acciones a empleados) descontada del FCF real, ciclos de capex en fundiciones de silicio. |
| **Salud y Farma** | `salud/` | `farmaceuticas`, `biotecnologia`, `dispositivos-medicos` | Vencimiento de patentes (*patent cliff*), gasto en I+D como % de ventas, pipeline en fase clínica III, aprobación FDA. |
| **Industriales** | `industriales/` | `aeroespacial-defensa`, `maquinaria`, `ferrocarriles` | Cartera de pedidos (*backlog*), ratio *book-to-bill*, intensidad de capex de renovación. |
| **Energía** | `energia/` | `petroleo-gas-upstream`, `refino-downstream`, `midstream` | Sensibilidad al barril WTI/Brent, coste de extracción por barril (break-even), contratos a largo plazo en oleoductos. |
| **Financiero** | `financiero/` | `banca-comercial`, `seguros`, `gestoras-fondos` | Balance como motor de negocio: RoTE, NIM (margen de intereses), CET1 ratio, mora; *Combined Ratio* en aseguradoras. |
| **Materiales Básicos** | `materiales/` | `quimicas`, `mineria`, `acero-metales` | Ciclos de precios de materias primas (cobre, oro, litio), coste de cash por tonelada (*all-in sustaining costs*). |
| **Utilities** | `utilities/` | `electricas`, `gas-agua`, `renovables` | Negocio regulado con Base de Activos Regulados (RAB), cobertura de dividendo y perfil de vencimiento de deuda. |
| **Telecomunicaciones** | `telecomunicaciones/` | `operadoras-telco`, `medios-entretenimiento` | ARPU, coste de captación, subastas de espectro 5G, amortización de contenidos en streaming. |

---

## 3. Estado de Herramientas y Agentes

- [x] **Agente `definir-analista`**: Especializado en discernir si las instrucciones dictadas por el usuario corresponden a `general.md`, `sector.md` o `subsector.md`, creando proactivamente las carpetas y archivos con metadatos YAML.
- [x] **Cargador Jerárquico Dinámico (`loadKnowledgeRules`)**: Concatena automáticamente las capas de conocimiento en memoria antes de la llamada a la IA analista.
- [x] **Visualización y PDF**: Sincronización completa de colores, negritas, paleta de notas y porcentajes (verde/rojo) entre web y PDF generado.
