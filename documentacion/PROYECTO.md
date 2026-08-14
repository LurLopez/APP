# Proyecto: Analizador de Resultados Financieros (10-Q / 10-K)

> Idioma de la interfaz: **Español** · Este es el resumen inyectado en el contexto de todos los agentes. La versión completa y viva está en `documentacion/PROYECTO-detalle.md`: léela cuando necesites el detalle.

## Qué es

Web que analiza con IA informes financieros de EE. UU. (10-Q trimestral, 10-K anual) y entrega un análisis estructurado en segundos. La IA criba y ahorra tiempo; el análisis profundo y el juicio final son del usuario.

## Alcance de la beta

- Solo **EE. UU.** · Solo **10-Q y 10-K** · Solo sector **consumo defensivo**.
- Lo que quede fuera se detecta y rechaza con error claro ("Este informe no es de una empresa de EE. UU." / "Este informe no corresponde al sector de consumo defensivo").

## Proceso de análisis (agentes secuenciales)

1. **Verificador de origen** — ¿empresa de EE. UU.? No → error.
2. **Verificador de sector** — ¿consumo defensivo? No → error.
3. **Analista principal** — análisis financiero e informe final.

**Regla fundamental:** las dos formas de llegar al análisis (subida manual de PDF o buscador por ticker) deben ejecutar exactamente el mismo proceso y dar el mismo resultado.

## Arquitectura exigida (esqueleto preparado desde el día uno, sin implementar aún)

- **Usuarios**: modelo de datos y flujos deben contemplar registro/login y planes (gratuito/de pago con mejores modelos y sin límites), aunque no se implementen en la beta.
- **Capa de abstracción de modelos IA**: los agentes hablan con la capa, nunca con la API de un proveedor concreto; permite cambiar de proveedor sin tocar los agentes.
- **Sistema de agentes extensible**: cada agente es independiente y registrable; nuevos países/sectores se añaden sin modificar los existentes.
- **Histórico de análisis**: guardar, listar y consultar por usuario.
- **Roadmap**: F1 subida manual → F2 buscador (ticker + histórico + ver PDF + analizar) → F3 registro/login → F4 análisis completo de empresa (multi-periodo) → F5 suscripciones y planes → F6 más países y sectores.

## Estado del roadmap

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Subida manual de PDF → análisis (beta) | 🔶 Frontend demo; backend pendiente (modelos IA, agentes, pipeline) |
| 2 | Buscador de empresas (ticker) + histórico de filings | 🔶 Buscador y cribador con datos reales de la SEC implementados; histórico de filings y botón "Analizar" pendientes |
| 3 | Registro / inicio de sesión | 🔶 Implementado (backend + frontend); planes y asociación de análisis por usuario pendientes |
| 4 | Análisis completo de empresa (multi-periodo) | ⏳ Pendiente |
| 5 | Suscripciones y planes | ⏳ Pendiente |
| 6 | Nuevos países y sectores | ⏳ Pendiente |

## Decisiones pendientes

- **Stack tecnológico** (por decidir; debe aprovechar el perfil: SQL y Java fuertes, Node/Express/MongoDB y JS/HTML/CSS conocidos, Python básico; único desarrollador, estudiante de 4.º de informática).
- **Modelo de IA** (DeepSeek vs GPT, por comparar).
- **Formato del informe final** (se definirá con los informes de referencia del usuario).

## Interacción con el usuario (importante)

El desarrollador está aprendiendo inglés: cuando escriba un **prompt en inglés**, la respuesta debe empezar con una corrección breve (frase original, versión corregida, explicación de los errores en español; si está bien, decirlo). Los prompts en español no se corrigen.

## Registro diario de cambios (obligatorio, automático)

Después de cada cambio considerable, **el agente que lo haya realizado debe registrarlo automáticamente** en el diario; no depende del agente de documentación ni hay que pedirlo.

- Considerables: nueva funcionalidad, corrección de bug, cambio de arquitectura o estructura, cambio de esquema de BD, nuevo endpoint/integración, cambio de flujo de producto, decisión técnica o de producto. No registrar cambios cosméticos.
- Ruta: `documentacion/diario/YYYY/MM/YYYY-MM-DD.md` (fecha de la petición o la actual). Si el archivo del día ya existe, añade la entrada al final sin borrar ni reescribir las anteriores.
- Formato de cada entrada:

```markdown
## HH:MM — Resumen: <título breve>

Se solicitó <descripción>.

### Resultado

<resumen de lo realizado, decidido o pendiente>
```
