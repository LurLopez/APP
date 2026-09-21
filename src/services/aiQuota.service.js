import config from '../../config/index.js';
import {
  countAiGenerationsToday,
  createAiGenerationUsage,
  deleteAiGenerationUsage,
} from '../../db/repositories/usageRepository.js';

export function isUnlimitedAi(user) {
  return Boolean(user && (user.isAdmin || user.role === 'admin'));
}

export async function getAiQuota(user) {
  const limit = config.dailyAiAnalysesLimit;
  if (!user) {
    return { limit, used: 0, remaining: 0, unlimited: false };
  }
  if (isUnlimitedAi(user)) {
    return { limit: null, used: 0, remaining: null, unlimited: true };
  }
  const used = await countAiGenerationsToday(user.id);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
  };
}

function dailyLimitError(limit) {
  const error = new Error(
    `Has alcanzado el límite de ${limit} análisis nuevos con IA por día. Vuelve mañana; mientras tanto puedes leer los análisis ya existentes.`,
  );
  error.status = 429;
  error.code = 'DAILY_LIMIT_REACHED';
  return error;
}

export async function assertAiQuotaAvailable(user) {
  const quota = await getAiQuota(user);
  if (!quota.unlimited && quota.remaining <= 0) {
    throw dailyLimitError(quota.limit);
  }
  return quota;
}

/**
 * Reserva atómica de cupo: inserta primero y comprueba después, de forma que
 * peticiones concurrentes del mismo usuario no puedan superar el límite diario
 * (la ventana entre "assert" y "consume" de la versión anterior lo permitía).
 * Si al contar se supera el límite, la fila insertada se elimina y se lanza 429.
 */
export async function reserveAiQuota(user) {
  if (isUnlimitedAi(user)) return null;
  const usage = await createAiGenerationUsage(user.id);
  const usageId = usage?.id ?? null;
  const used = await countAiGenerationsToday(user.id);
  if (used > config.dailyAiAnalysesLimit) {
    await refundAiQuota(usageId);
    throw dailyLimitError(config.dailyAiAnalysesLimit);
  }
  return usageId;
}

export async function consumeAiQuota(user) {
  if (isUnlimitedAi(user)) return null;
  const usage = await createAiGenerationUsage(user.id);
  return usage?.id ?? null;
}

export async function refundAiQuota(usageId) {
  if (!usageId) return;
  try {
    await deleteAiGenerationUsage(usageId);
  } catch (error) {
    console.error('[aiQuota:refund]', error.message);
  }
}
