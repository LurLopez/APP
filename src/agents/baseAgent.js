export class AgentError extends Error {
  constructor(message, code = 'AGENT_ERROR') {
    super(message);
    this.name = 'AgentError';
    this.code = code;
  }
}

export class BaseAgent {
  constructor({ name, description }) {
    this.name = name;
    this.description = description;
  }

  async run(_input) {
    throw new Error(`El agente ${this.name} no implementa run().`);
  }
}
