/**
 * @fileoverview Módulo extraído de watchlists.controller.js.
 */

import { watchlistRepository } from '../../../db/repositories/watchlistRepository.js';

export async function deleteWatchlistHandler(req, res, next) {
  try {
    const watchlistId = Number(req.params.id);
    if (!Number.isInteger(watchlistId)) {
      res.status(400).json({ error: 'Lista no válida.' });
      return;
    }
    const current = await watchlistRepository.getWatchlist(req.user.id, watchlistId);
    if (!current) {
      res.status(404).json({ error: 'La lista no existe.' });
      return;
    }
    if (current.is_default) {
      res.status(400).json({ error: 'La lista de favoritos no se puede eliminar.' });
      return;
    }
    await watchlistRepository.deleteWatchlist(req.user.id, watchlistId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}
