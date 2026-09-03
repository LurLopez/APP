import { checkAndDispatchAlerts } from '../src/services/alertScanner.service.js';

console.log('Iniciando escaneo de alertas...');
const result = await checkAndDispatchAlerts();
console.log('Resultado del escaneo:', result);
process.exit(result.ok ? 0 : 1);
