import { AsyncLocalStorage } from 'node:async_hooks';

// Contexto por análisis: cada análisis usa su propia sesión de IA (no una global),
// de modo que varias personas puedan analizar informes a la vez sin interferirse.
export const aiContext = new AsyncLocalStorage();
