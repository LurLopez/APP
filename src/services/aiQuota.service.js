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

export async function assertAiQuotaAvailable(user) {
  const quota = await getAiQuota(user);
  if (!quota.unlimited && quota.remaining <= 0) {
    const error = new Error(
      `Has alcanzado el límite de ${quota.limit} análisis nuevos con IA por día. Vuelve mañana; mientras tanto puedes leer los análisis ya existentes.`,
    );
    error.status = 429;
    error.code = 'DAILY_LIMIT_REACHED';
    throw error;
  }
  return quota;
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
