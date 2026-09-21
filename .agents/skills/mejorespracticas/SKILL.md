---
name: mejorespracticas
description: >-
  Aplica principios de Clean Code, refactorización y buenas prácticas de ingeniería de software en JavaScript/Node.js. Úsalo cuando el usuario pida refactorizar código, reducir el tamaño de funciones, aplicar responsabilidad única (SRP), eliminar duplicación, mejorar nombres o elevar la calidad del código.
---

# Skill: Mejores Prácticas de Código y Refactorización (Clean Code)

Esta skill proporciona las directrices y reglas obligatorias para escribir y refactorizar código en JavaScript / Node.js siguiendo los principios de Clean Code (Robert C. Martin) adaptados a JavaScript y patrones de arquitectura limpia.

Las referencias completas y ejemplos detallados se encuentran en:
- Versión en español: [README_es.md](./references/README_es.md)
- Versión original en inglés: [README.md](./references/README.md)

---

## 1. Principio de Responsabilidad Única (SRP) en Métodos y Módulos
* **Una función debe hacer solo una cosa**: Si una función valida datos, consulta una base de datos y formatea la respuesta, debe dividirse en 3 funciones independientes.
* **Un único nivel de abstracción por función**: Una función de alto nivel coordina; las funciones de bajo nivel implementan los detalles (queries, llamadas a APIs, manipulación de buffers).
* **Tamaño reducido**: Las funciones deben ser lo más concisas y directas posible (generalmente menos de 20-30 líneas).

## 2. Argumentos de Funciones
* **Máximo 2 o 3 argumentos**: Si una función necesita más de 2 o 3 parámetros, agrúpalos en un objeto con desestructuración (`{ user, options, callback }`).
* **No usar banderas booleanas (flags) como parámetros**: Si una función recibe `doSomething(data, isPremium)`, crea dos funciones: `doSomethingNormal(data)` y `doSomethingPremium(data)`.

## 3. Nombres Claros e Intención Reveladora
* **Nombres que describan el propósito**: Usa nombres que no requieran comentarios para entender qué hacen.
* **Variables pronunciables y buscables**: Evita abreviaturas crípticas (`acc`, `u`, `tmp`).
* **Verbos para funciones**: Las funciones representan acciones (`calculateTotal`, `fetchReportSummary`, `validateInput`).

## 4. Evitar Efectos Secundarios (Side Effects)
* **Funciones puras cuando sea posible**: No mutes objetos pasados por referencia sin una razón de peso; retorna nuevas copias o resultados derivados.
* **No escribir ni contaminar variables globales**.

## 5. Control de Flujo Limpio
* **Retornos tempranos (Early Returns / Guard Clauses)**: Comprueba las condiciones de error o salida al inicio de la función y retorna inmediatamente para evitar niveles profundos de anidación (`if` dentro de `if`).
* **Encapsular condicionales complejas**: Extrae condiciones largas a funciones booleanas expresivas:
  ```javascript
  // Evitar:
  if (user.status === 'active' && user.subscription.valid && !user.isBlocked) { ... }

  // Preferir:
  if (canUserAccessService(user)) { ... }
  ```

## 6. Manejo de Errores y Asincronía
* **Async/Await limpio**: Evita callbacks anidados y cadenas infinitas de `.then()`.
* **Manejo centralizado de errores**: Evita envolver cada línea en un `try/catch` vacío o que solo hace `console.log`. Lanza excepciones personalizadas o deja que el middleware de errores las procese.

## 7. Protocolo de Refactorización Segura
1. **Identificar los malos olores (*Code Smells*)**: Funciones gigantes, duplicación (violación DRY), condicionales anidadas, nombres confusos.
2. **Extraer funciones pequeñas (Extract Function)**: Extraer cada bloque lógico a un helper privado o servicio especializado.
3. **Mantener compatibilidad**: Asegurarse de no romper las firmas públicas o contratos de API existentes.
4. **Validar funcionamiento**: Comprobar sintaxis y ejecución antes de dar por terminada la tarea.
