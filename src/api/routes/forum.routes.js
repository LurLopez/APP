import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as forumRepository from '../../../db/repositories/forumRepository.js';

const router = Router();
const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

router.get('/:ticker', async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }

    const { threads, raw } = await forumRepository.getMessagesByTicker(ticker);
    res.json({ ok: true, ticker, threads, total: raw.length });
  } catch (error) {
    next(error);
  }
});

router.post('/:ticker', requireAuth, async (req, res, next) => {
  try {
    const ticker = String(req.params.ticker ?? '').trim().toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) {
      res.status(400).json({ error: 'Ticker no válido.' });
      return;
    }

    const text = String(req.body?.message ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
      return;
    }

    if (text.length > 4000) {
      res.status(400).json({ error: 'El mensaje no puede superar los 4000 caracteres.' });
      return;
    }

    let parentId = null;
    if (req.body?.parentId !== undefined && req.body?.parentId !== null && req.body?.parentId !== '') {
      const parsed = Number(req.body.parentId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'Identificador de mensaje a responder no válido.' });
        return;
      }
      parentId = parsed;
    }

    const created = await forumRepository.createMessage({
      ticker,
      userId: req.user.id,
      message: text,
      parentId,
    });

    res.status(201).json({ ok: true, message: created });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.delete('/message/:id', requireAuth, async (req, res, next) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      res.status(400).json({ error: 'Identificador de mensaje no válido.' });
      return;
    }

    const deleted = await forumRepository.deleteMessage(req.user.id, messageId);
    if (!deleted) {
      res.status(404).json({ error: 'El mensaje no existe o no tienes permiso para eliminarlo.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
