/**
 * @fileoverview Plantillas de renderizado y utilidades visuales para el foro de Cifra.
 */

(function () {
  'use strict';

  function escapeHtml(value) {
    return window.HtmlUtils.escapeHtml(value);
  }

  function formatForumDate(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';

    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Hace un momento';
    if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `Hace ${minutes} min${minutes > 1 ? 's' : ''}`;
    }
    if (diffSeconds < 86400) {
      const hours = Math.floor(diffSeconds / 3600);
      return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    }
    if (diffSeconds < 86400 * 7) {
      const days = Math.floor(diffSeconds / 86400);
      return `Hace ${days} día${days > 1 ? 's' : ''}`;
    }

    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function initials(name) {
    if (!name) return '?';
    const clean = String(name).replace(/[^a-zA-Z0-9]/g, '');
    return clean.slice(0, 2).toUpperCase() || '?';
  }

  function displayUser(name) {
    return name || 'Inversor';
  }

  function renderComposerHtml(currentUser, currentTicker, currentCompanyName) {
    if (!currentUser) {
      return `
        <div class="forum-login-prompt">
          <div class="forum-login-prompt-copy">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <div>
              <strong>Únete al debate de ${escapeHtml(currentCompanyName || currentTicker)}</strong>
              <p>Inicia sesión o crea tu cuenta para compartir opiniones y responder a otros inversores.</p>
            </div>
          </div>
          <button type="button" class="promo-button forum-login-prompt-btn" id="forum-prompt-login-btn">Iniciar sesión</button>
        </div>
      `;
    }

    return `
      <form class="forum-form" id="forum-new-message-form">
        <div class="forum-composer-header">
          <span class="forum-avatar-mini">${initials(currentUser.username || currentUser.email)}</span>
          <span>Publicar en el foro como <strong>${escapeHtml(currentUser.username || currentUser.email.split('@')[0])}</strong></span>
        </div>
        <div class="forum-textarea-wrap">
          <textarea id="forum-message-input" rows="3" placeholder="Comparte tu análisis, preguntas o tesis sobre ${escapeHtml(currentTicker)}..." maxlength="4000" required></textarea>
        </div>
        <div class="forum-form-actions">
          <p class="forum-form-error" id="forum-form-error" hidden></p>
          <button type="submit" class="primary-button forum-submit-btn" id="forum-submit-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:5px"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            Publicar mensaje
          </button>
        </div>
      </form>
    `;
  }

  function renderReplyHtml(reply, parentThread, currentUser) {
    const isOwner = currentUser && currentUser.id === reply.user_id;
    const formattedDate = formatForumDate(reply.created_at);
    const userName = displayUser(reply.user_name);
    const userInitials = initials(userName);
    const messageText = escapeHtml(reply.message).replace(/\n/g, '<br>');

    return `
      <div class="forum-reply-card" id="forum-msg-${reply.id}" data-message-id="${reply.id}">
        <div class="forum-message-header">
          <div class="forum-avatar small">${userInitials}</div>
          <div class="forum-message-meta">
            <strong class="forum-author-name">${escapeHtml(userName)}</strong>
            <span class="forum-date" title="${escapeHtml(reply.created_at)}">${escapeHtml(formattedDate)}</span>
          </div>
          ${isOwner ? `
            <button type="button" class="forum-delete-btn" data-delete-id="${reply.id}" title="Eliminar respuesta" aria-label="Eliminar respuesta">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : ''}
        </div>
        <div class="forum-message-body">
          <p>${messageText}</p>
        </div>
        <div class="forum-message-actions">
          <button type="button" class="forum-reply-btn" data-reply-to="${parentThread.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
            Responder
          </button>
        </div>
      </div>
    `;
  }

  function renderSingleThreadHtml(msg, currentUser) {
    const isOwner = currentUser && currentUser.id === msg.user_id;
    const formattedDate = formatForumDate(msg.created_at);
    const userName = displayUser(msg.user_name);
    const userInitials = initials(userName);
    const messageText = escapeHtml(msg.message).replace(/\n/g, '<br>');
    const repliesCount = Array.isArray(msg.replies) ? msg.replies.length : 0;

    return `
      <article class="forum-thread-card" id="forum-msg-${msg.id}" data-message-id="${msg.id}">
        <div class="forum-message-header">
          <div class="forum-avatar">${userInitials}</div>
          <div class="forum-message-meta">
            <strong class="forum-author-name">${escapeHtml(userName)}</strong>
            <span class="forum-date" title="${escapeHtml(msg.created_at)}">${escapeHtml(formattedDate)}</span>
          </div>
          ${isOwner ? `
            <button type="button" class="forum-delete-btn" data-delete-id="${msg.id}" title="Eliminar mensaje" aria-label="Eliminar mensaje">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : ''}
        </div>
        <div class="forum-message-body">
          <p>${messageText}</p>
        </div>
        <div class="forum-message-actions">
          <button type="button" class="forum-reply-btn" data-reply-to="${msg.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
            Responder
          </button>
          ${repliesCount > 0 ? `<span class="forum-replies-badge">${repliesCount} ${repliesCount === 1 ? 'respuesta' : 'respuestas'}</span>` : ''}
        </div>
        <div class="forum-reply-form-wrap" id="forum-reply-form-wrap-${msg.id}" hidden>
          <form class="forum-reply-form" data-parent-id="${msg.id}">
            <div class="forum-textarea-wrap">
              <textarea rows="2" placeholder="Escribe tu respuesta a ${escapeHtml(userName)}..." maxlength="4000" required></textarea>
            </div>
            <div class="forum-reply-actions">
              <button type="button" class="link-button forum-cancel-reply-btn" data-cancel-reply="${msg.id}">Cancelar</button>
              <button type="submit" class="primary-button forum-reply-submit-btn">Responder</button>
            </div>
          </form>
        </div>
        <div class="forum-replies-container" id="forum-replies-wrap-${msg.id}">
          ${Array.isArray(msg.replies) && msg.replies.length > 0 ? `
            <div class="forum-replies-list">
              ${msg.replies.map((reply) => renderReplyHtml(reply, msg, currentUser)).join('')}
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }

  function renderMessagesHtml(threadList, currentUser) {
    return (threadList || []).map((t) => renderSingleThreadHtml(t, currentUser)).join('');
  }

  window.ForumRender = {
    escapeHtml,
    formatForumDate,
    initials,
    displayUser,
    renderComposerHtml,
    renderReplyHtml,
    renderSingleThreadHtml,
    renderMessagesHtml,
  };
})();
