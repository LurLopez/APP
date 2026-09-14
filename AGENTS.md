# Reglas de Interacción y Autonomía del Agente

- **Permisos y autonomía total**: El usuario otorga permiso explícito y permanente para leer, crear, modificar archivos y ejecutar los comandos necesarios para resolver cualquier petición.
- **Sin preguntas ni confirmaciones previas**: No solicitar confirmación ni permiso antes de actuar, editar código o ejecutar herramientas. Proceder directamente con la implementación.
- **Resolución directa y proactiva**: Aplicar los cambios, validar la sintaxis/funcionamiento y comunicar el resultado de forma clara y concisa.
- **Versiones de las reglas**: No modificar los números de versión de los `.md` de reglas (general, sector, subsector, empresa) salvo petición explícita del usuario.
- **Commits protegidos por token**: `git commit` exige un token secreto que solo conoce el usuario (hook pre-commit instalado). Nunca intentes commitear, ni con `--no-verify` ni cambiando `core.hooksPath`. Si hay que commitear, dilo al usuario para que lo haga él.
