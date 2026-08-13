# Proyecto: Analizador de Resultados Financieros (10-Q / 10-K)

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

1. **Agente verificador de origen** — Lee el PDF y determina si los resultados son de una empresa de **Estados Unidos**. Si no lo son → error.
2. **Agente verificador de sector** — Lee el PDF y determina si la empresa es de **consumo defensivo**. Si no lo es → error.
3. **Agente analista principal** — Realiza el análisis financiero del informe y genera el resultado final.

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
│    (análisis del informe)    │
└──────────────────────────────┘
        │
        ▼
   Informe final para el usuario
```

> En el futuro se añadirán agentes para más países (verificación por país) y más sectores (verificación y análisis por sector).

## 6. Requisitos de arquitectura

La arquitectura debe estar preparada desde el principio para:

### 6.1. Registro / Inicio de sesión
- Los usuarios podrán **registrarse e iniciar sesión**.
- La app se usará localmente al principio, pero el modelo de datos y los flujos deben contemplar usuarios desde el día uno.

### 6.2. Suscripciones (plan gratuito / de pago)
- Una vez registrado, existirá la opción de **suscribirse a la web** con ventajas como:
  - Análisis con **modelos de IA mejores**.
  - **Sin límite de análisis** (el plan gratuito tendrá límites).
- Esta funcionalidad **no se implementa en la beta**, pero la arquitectura debe soportarla: gestión de usuarios, roles/planes, límites de uso y selección de modelo por plan.

### 6.3. Capa de abstracción de modelos IA
- El modelo de IA a usar **aún no está decidido** (candidatos: DeepSeek, GPT — requiere comparar).
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
- Requiere el histórico de filings (relacionado con la Forma 2 del buscador).

### 7.2. Más países y sectores
- Extensión de los agentes verificadores y analistas a nuevos países y sectores.

### 7.3. Suscripciones y planes
- Monetización con plan gratuito limitado y plan de pago con mejores modelos y análisis ilimitados.

## 8. Roadmap

| Fase | Contenido | Estado |
|---|---|---|
| **0** | Documento de visión y requisitos (este documento) | ✅ En curso |
| **1** | Subida manual de PDF → análisis (beta, EE. UU. + consumo defensivo) | ⏳ Pendiente |
| **2** | Buscador de empresas (ticker) + histórico de filings + ver PDF + analizar | ⏳ Pendiente |
| **3** | Registro / inicio de sesión | ⏳ Pendiente |
| **4** | Análisis completo de empresa (multi-periodo) | ⏳ Pendiente |
| **5** | Suscripciones y planes (modelos según plan, límites) | ⏳ Pendiente |
| **6** | Nuevos países y sectores (más agentes) | ⏳ Pendiente |

## 9. Decisiones pendientes

| Decisión | Detalle | Estado |
|---|---|---|
| **Stack tecnológico** | Framework de frontend/backend, base de datos, hosting. Se elegirá teniendo en cuenta el perfil del desarrollador (sección 10) | 🔴 Por decidir |
| **Modelo de IA** | Candidatos: DeepSeek, GPT — requiere comparación de modelos | 🔴 Por decidir |
| **Formato del informe final** | El usuario ya tiene varios informes hechos que servirán de referencia. Se definirá en detalle con ejemplos reales | 🔴 Por definir |

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

*Documento de visión vivo: se actualizará a medida que se tomen decisiones (stack, modelo, formato del informe).*
