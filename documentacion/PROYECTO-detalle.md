# Proyecto: Analizador de Resultados Financieros (10-Q / 10-K)

> Esta es la **versión completa** del documento de visión. La versión resumida que se inyecta automáticamente en el contexto de los agentes es `documentacion/PROYECTO.md`. **Mantén ambos sincronizados** cuando actualices requisitos.

> Versión: 1.0 (beta) · Documento de visión y requisitos · Idioma de la interfaz: **Español**

---

## 1. Visión general

Aplicación web cuyo objetivo es **analizar los resultados financieros** (informes 10-Q trimestrales y 10-K anuales) de las empresas de Estados Unidos, usando IA.

La aplicación no sustituye el análisis financiero del usuario: **le ahorra tiempo** entregándole un análisis estructurado de un informe en segundos, para que él decida después si profundiza por su cuenta.

## 2. Filosofía de la aplicación

La app debe ser útil especialmente en estos 2 ámbitos:

1. **Ya conocemos la empresa al detalle** → queremos hacer el seguimiento de sus nuevos resultados (cuando publica un nuevo 10-Q o 10-K).
2. **No conocemos la empresa de nada** → queremos hacer un filtro rápido para decidir si merece la pena analizarla más a fondo o no.

La IA es una herramienta de cribado y ahorro de tiempo. El análisis profundo, la decisión final y el juicio de valor siguen siendo del usuario.

## 3. Formas de analizar los resultados

Existen **2 formas de llegar al mismo análisis**, y ambas deben ejecutar **exactamente el mismo proceso** de análisis:

### Forma 1 — Subida manual (Fase 1, la primera en implementarse)

- El usuario descarga el PDF del informe (10-Q / 10-K) desde la fuente que quiera.
- Arrastra o selecciona el archivo en la web.
- La IA analiza ese PDF y devuelve el informe.

### Forma 2 — Buscador por empresa (Fase 2, más adelante)

- El usuario busca la empresa por nombre o ticker (ej.: Molson Coors → **TAP**).
- Aparece el **histórico de resultados publicados** de la empresa: todos sus 10-Q y 10-K.
- El usuario puede **ver el PDF original** de cualquiera de esos resultados.
- Si pulsa **"Analizar"** sobre un resultado (ej.: Q2 2025 de TAP), se ejecuta **el mismo análisis exacto** que con la subida manual.

> **Regla fundamental:** cargar el Q2 2025 de TAP manualmente, o buscarlo y pulsar analizar, debe producir **el mismo resultado**.

> **Estado actual (2026-08-15):** las dos formas están **completas y verificadas**: búsqueda por ticker/nombre (`/api/screener/search`), página de empresa `/empresa/:ticker` con perfil y gráfico, cribador con series anuales/trimestrales sin huecos (`/api/screener/company/:ticker`), histórico de filings con vista previa por páginas, descarga del PDF y botón "Analizar con IA" (`POST .../filings/:accession/analyze`) que ejecuta exactamente el mismo pipeline que la subida manual. Detalle en `documentacion/backend/funcionalidades/screener/` y `documentacion/frontend/funcionalidades/screener/`.

## 4. Alcance de la beta

La primera versión estará limitada a:

| Ámbito | Alcance |
|---|---|
| **País** | Solo Estados Unidos |
| **Informes** | Solo 10-Q y 10-K |
| **Sector** | Solo **consumo defensivo** (uno de los sectores más regulares y sencillos de analizar) |

Todo lo que quede fuera de este alcance debe detectarse y rechazarse con un mensaje de error claro (ej.: "Este informe no es de una empresa de EE. UU." / "Este informe no corresponde al sector de consumo defensivo").

## 5. Arquitectura de agentes IA

Sistema de **agentes extensible**: cada agente hace una tarea concreta. En beta habrá 3 agentes, pero el diseño debe permitir añadir más agentes por **país** y por **sector** sin reescribir la lógica base.

### Agentes de la beta

1. **Agente verificador de origen** — Lee el PDF y determina si los resultados son de una empresa de **Estados Unidos**. Si no lo es → error.
2. **Agente verificador de sector** — Lee el PDF y determina si la empresa es de **consumo defensivo**. Si no lo es → error.
3. **Agente analista principal** — Realiza el análisis financiero del informe (2 fases: extracción de cifras + estructuración con las reglas del sector) y genera el informe final con su PDF.

> Los 3 agentes están implementados y registrados (`agentRegistry`); las reglas del sector viven en `src/agents/prompts/consumo-defensivo.md`. La subida manual y el botón "Analizar" de un filing ejecutan el mismo pipeline (`analysis.service.js`).

### Flujo del proceso de análisis

```
PDF recibido (vía subida manual o vía buscador)
        │
        ▼
┌──────────────────────────────┐
│ 1. Agente verificador de     │
│    origen (¿Es de EE. UU.?)  │ ──No──▶ Error: no es de EE. UU.
└──────────────────────────────┘
        │ Sí
        ▼
┌──────────────────────────────┐
│ 2. Agente verificador de     │
│    sector (¿Consumo          │ ──No──▶ Error: no es consumo defensivo
│    defensivo?)               │
└──────────────────────────────┘
        │ Sí
        ▼
┌──────────────────────────────┐
│ 3. Agente analista principal │
│    (2 fases: extracción +    │
│    estructuración + PDF)     │
└──────────────────────────────┘
        │
        ▼
   Informe final + PDF para el usuario
   (guardado en analyses si hay sesión)
```

> En el futuro se añadirán agentes para más países (verificación por país) y más sectores (verificación y análisis por sector).

## 6. Requisitos de arquitectura

La arquitectura debe estar preparada desde el principio para:

### 6.1. Registro / Inicio de sesión
- Los usuarios podrán **registrarse e iniciar sesión**.
- Al registrarse se envía un **código de verificación de 6 dígitos por correo** (SMTP configurable; sin SMTP, en desarrollo se imprime por consola) que el usuario debe introducir para validar su cuenta. Hasta entonces no puede iniciar sesión (error `EMAIL_NOT_VERIFIED` y el frontend le lleva al paso de verificación). Código válido 15 min, máx. 5 intentos, reenviable (`POST /api/auth/resend-code`).
- **Recuperación de contraseña** implementada: "olvidé mi contraseña" envía otro código al correo y permite cambiarla (`POST /api/auth/forgot-password` y `POST /api/auth/reset-password`).
- La app se usará localmente al principio, pero el modelo de datos y los flujos contemplan usuarios desde el día uno.
- **Extras ligados a la sesión ya implementados**: histórico de análisis por usuario (`GET /api/analyses`), listas de seguimiento multi-lista (`/api/watchlists`) y cartera de inversión (`/api/portfolio`).

### 6.2. Suscripciones (plan gratuito / de pago)
- Una vez registrado, existirá la opción de **suscribirse a la web** con ventajas como:
  - Análisis con **modelos de IA mejores**.
  - **Sin límite de análisis** (el plan gratuito tendrá límites).
- Esta funcionalidad **no se implementa en la beta**, pero la arquitectura debe soportarla: gestión de usuarios, roles/planes, límites de uso y selección de modelo por plan.

### 6.3. Capa de abstracción de modelos IA
- El modelo de IA en uso es **DeepSeek directo** (`AI_PROVIDER=deepseek`, 22–23 s por análisis, fiable); OpenCode Go probado pero intermitente. Confirmar a medio plazo.
- Se debe construir una **capa abstracta de modelos** para poder cambiar de proveedor (o usar uno u otro según el plan del usuario) **sin tocar el código de los agentes**.
- Los agentes deben hablar con la capa de abstracción, nunca con la API de un proveedor concreto.

### 6.4. Sistema de agentes extensible
- Cada agente debe ser una unidad independiente y registrable.
- Se añadirán agentes nuevos por país y por sector sin modificar los existentes.

### 6.5. Almacenamiento de resultados
- Los análisis realizados se deben poder guardar, listar y consultar por usuario (histórico de análisis).

## 7. Funcionalidades futuras (fuera de la beta)

### 7.1. Análisis completo de la empresa
- Botón **"Analizar empresa completa"**: leerá los resultados de los últimos trimestres/años y generará un **informe completo** de la empresa, no de un único periodo.
- Requiere el histórico de filings (ya implementado en la página de empresa: `/empresa/:ticker` → Informes trimestrales).

### 7.2. Más países y sectores
- Extensión de los agentes verificadores y analistas a nuevos países y sectores.

### 7.3. Suscripciones y planes
- Monetización con plan gratuito limitado y plan de pago con mejores modelos y análisis ilimitados.

### 7.4. Ya implementado como extras (más allá del roadmap original)
- **Histórico de análisis por usuario** con filtros (empresa, fecha de resultados/análisis) y apertura del PDF.
- **Listas de seguimiento multi-lista** (sustituyen a los favoritos; lista por defecto "Favoritos").
- **Cartera de inversión**: compras/ventas con FIFO, precio medio, dividendos estimados por fecha real de pago, rentabilidad con y sin dividendos y distribución por empresa/sector.

## 8. Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **0** | Documento de visión y requisitos (este documento) | ✅ Completado |
| **1** | Subida manual de PDF → análisis (beta, EE. UU. + consumo defensivo) | ✅ Pipeline completo: 3 agentes + informe (2 horizontes, 3 bloques) + PDF + guardado por usuario |
| **2** | Buscador de empresas (ticker) + histórico de filings + ver PDF + analizar | ✅ Buscador, cribador sin huecos, perfil y gráfico, filings con vista previa/descarga y botón "Analizar" |
| **3** | Registro / inicio de sesión | ✅ Implementado (verificación por correo + recuperación de contraseña); asociación de análisis por usuario ✅ |
| **4** | Análisis completo de empresa (multi-periodo) | ⏳ Pendiente |
| **5** | Suscripciones y planes (modelos según plan, límites) | ⏳ Pendiente |
| **6** | Nuevos países y sectores (más agentes) | ⏳ Pendiente |

> El detalle de todo lo implementado hasta la fecha está en `documentacion/IMPLEMENTACION.md`.

## 9. Decisiones pendientes

| Decisión | Detalle | Estado |
|---|---|---|
| **Stack tecnológico** | Framework de frontend/backend, base de datos, hosting. Se eligió teniendo en cuenta el perfil del desarrollador (sección 10) | ✅ Decidido: Node.js + Express + PostgreSQL + frontend puro (ver `ARQUITECTURA.md`) |
| **Despliegue (dónde alojarlo)** | VPS único vs PaaS (Render/Railway/Neon) con BD gestionada | 🔴 No bloquea; decidir cuando toque publicar |
| **Modelo de IA** | Comparados: DeepSeek directo vs OpenCode Go | 🔶 En uso: **DeepSeek directo** (`AI_PROVIDER=deepseek`, 22–23 s, fiable; OpenCode Go intermitente). Confirmar a medio plazo |
| **Formato del informe final** | Los informes de referencia del usuario guían el prompt (`src/agents/prompts/consumo-defensivo.md`); se refinará con más referencias | 🔶 Formato base en producción (2 horizontes + Ventas/Cash Flow/Asignación de Capital) |

## 10. Contexto del desarrollador

Información importante sobre quién construye el proyecto. Cualquier decisión de stack debe tenerlo en cuenta:

### Perfil
- **Estudiante de informática (4.º año)**, con base sólida en fundamentos de programación y arquitectura de datos.
- Tiene un nivel de finanzas que le permite definir cómo debe analizar la IA los resultados (el análisis lo define él, no la IA).

### Habilidades técnicas

| Área | Conocimientos | Nivel |
|---|---|---|
| **Base de datos** | SQL | Controla bastante |
| **Backend** | Java | Controla bastante |
| **Backend web** | Node.js + Express + MongoDB | Dado en clase (sistemas web) |
| **Frontend** | JavaScript, HTML, CSS (un poco de XHTML) | Dado en clase (sistemas web) |
| **Python** | Nociones | Un poco |

### Implicaciones para la arquitectura
- El stack elegido debería **aprovechar sus fortalezas** (SQL, Java) y lo que ya domina del ecosistema web (Node.js/Express/MongoDB), evitando curvas de aprendizaje innecesarias en la beta.
- La **capa de abstracción de modelos IA** y el **sistema de agentes** deben mantenerse sencillos de entender y extender por una única persona.
- Es el **único desarrollador** del proyecto: la complejidad debe ser proporcional a su tiempo disponible (4.º año de carrera).

## 11. Guía para la implementación (Fase 1)

Orden de trabajo sugerido para la primera implementación:

1. Definir el stack (decisión pendiente).
2. Crear la **capa de abstracción de modelos IA** (interfaz común, sin proveedor concreto fijado).
3. Crear el **sistema de agentes** con el registro de los 3 agentes de la beta.
4. Crear la **subida manual de PDF** y el flujo completo de análisis (agentes 1 → 2 → 3).
5. Definir el **formato del informe** con los informes de referencia del usuario.
6. Guardar el histórico de análisis por usuario.
7. Dejar preparado el esqueleto de: autenticación, planes/suscripciones y buscador (sin implementar la lógica).

---

## 12. Preferencia de interacción: aprendizaje de inglés

El desarrollador está aprendiendo inglés. Cuando escriba un prompt en inglés, la respuesta debe comenzar con una corrección breve de los errores que haya cometido antes de atender su petición.

- Mostrar la frase original y una versión corregida.
- Explicar brevemente los errores en español.
- Si el inglés es correcto, indicarlo brevemente.
- Después de la corrección, responder normalmente a la petición.
- No corregir los prompts escritos completamente en español.

*Documento de visión vivo: se actualizará a medida que se tomen decisiones (stack, modelo, formato del informe).*

---

## 13. Registro diario de cambios (obligatorio)

Todo agente de opencode que realice un **cambio considerable** debe registrarlo automáticamente en el diario, inmediatamente después del cambio y sin depender del agente de documentación ni esperar instrucciones.

Se considera considerable, como mínimo:

- Nueva funcionalidad.
- Corrección de un bug.
- Cambio de arquitectura o estructura de carpetas.
- Cambio de esquema de base de datos.
- Nuevo endpoint o integración.
- Cambio importante en el flujo del producto.
- Decisión técnica o de producto que afecte al proyecto.

No se registran cambios puramente cosméticos, erratas menores o ajustes sin impacto, salvo que el usuario lo pida expresamente.

### Estructura y formato

```text
documentacion/
└── diario/
    └── YYYY/
        └── MM/
            └── YYYY-MM-DD.md
```

Usa la fecha de la petición; si no está disponible, la fecha local actual. Si el archivo del día no existe, créalo. Si ya existe, añade la nueva entrada **al final** sin borrar ni reescribir las anteriores. Cada entrada:

```markdown
## HH:MM — Resumen: <título breve>

Se solicitó <descripción clara de la petición>.

### Resultado

<resumen de lo realizado, decidido o pendiente>
```

No mezcles entradas de días distintos en el mismo archivo ni crees un archivo diario separado para cada cambio del mismo día.
