/**
 * @fileoverview Controlador para los foros de debate y mensajes por empresa cotizada.
 * @module api/controllers/forum
 */

import * as forumRepository from '../../../db/repositories/forumRepository.js';

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

/**
 * Consulta los hilos de mensajes del foro asociados a una empresa.
 * @param {import('express').Request} req - Petición con params.ticker.
 * @param {import('express').Response} res - Lista de hilos y respuestas.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function getTickerForumMessagesHandler(req, res, next) {
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
}

/**
 * Publica un nuevo mensaje o respuesta en el foro de una empresa.
 * @param {import('express').Request} req - Petición con params.ticker y body (message, parentId).
 * @param {import('express').Response} res - Mensaje creado.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function postTickerForumMessageHandler(req, res, next) {
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
}

/**
 * Elimina un mensaje del foro propio del usuario autenticado.
 * @param {import('express').Request} req - Petición con params.id del mensaje.
 * @param {import('express').Response} res - Confirmación.
 * @param {import('express').NextFunction} next - Manejador de errores.
 * @returns {Promise<void>}
 */
export async function deleteForumMessageHandler(req, res, next) {
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
}
