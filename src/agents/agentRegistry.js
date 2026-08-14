import { OriginAgent } from './originAgent.js';
import { SectorAgent } from './sectorAgent.js';
import { AnalystAgent } from './analystAgent.js';

const agents = new Map();

export function registerAgent(agent) {
  agents.set(agent.name, agent);
}

export function getAgent(name) {
  return agents.get(name) ?? null;
}

export function listAgents() {
  return [...agents.values()];
}

registerAgent(new OriginAgent());
registerAgent(new SectorAgent());
registerAgent(new AnalystAgent());
