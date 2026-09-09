/**
 * Módulo de Foros por Empresa para Cifra Terminal
 */
const Forum = (() => {
  let currentTicker = null;
  let currentCompanyName = null;
  let currentUser = null;
  let messages = [];
  let isLoading = false;
  let activeReplyFormParentId = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
    const clean = String(name).replace(/[^a-zA-Z0-9]/g, '') || String(name);
    return clean.slice(0, 2).toUpperCase();
  }

  function displayUser(name) {
    if (!name) return 'Inversor';
    return name;
  }

  function showToastMessage(msg) {
    if (typeof showToast === 'function') {
      showToast(msg);
    }
  }

  async function checkAuthSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        currentUser = data?.user ?? null;
      } else {
        currentUser = null;
      }
    } catch {
      currentUser = null;
    }
  }

  async function loadMessages(ticker) {
    if (!ticker) return;
    isLoading = true;
    renderState();

    try {
      const res = await fetch(`/api/forum/${encodeURIComponent(ticker)}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        messages = data.threads || [];
      } else {
        messages = [];
        showError(data.error || 'No se pudieron cargar los mensajes.');
      }
    } catch {
      messages = [];
      showError('Error de conexión al cargar el foro.');
    } finally {
      isLoading = false;
      renderState();
    }
  }

  function showError(msg) {
    const errorEl = document.querySelector('#forum-error');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    }
  }

  function renderState() {
    const loadingEl = document.querySelector('#forum-loading');
    const emptyEl = document.querySelector('#forum-empty');
    const listEl = document.querySelector('#forum-messages-list');
    const titleEl = document.querySelector('#forum-company-name');
    const composerUserBadge = document.querySelector('#forum-composer-user-badge');
    const errorEl = document.querySelector('#forum-error');

    if (titleEl && currentCompanyName) {
      titleEl.textContent = `${currentCompanyName} (${currentTicker})`;
    }

    if (errorEl && !isLoading) {
      // Dejar visible solo si hay contenido
    }

    if (loadingEl) {
      loadingEl.hidden = !isLoading;
    }

    if (composerUserBadge) {
      if (currentUser) {
        composerUserBadge.innerHTML = `
          <span class="forum-avatar-mini">${initials(currentUser.email)}</span>
          <span>Publicando como <strong>${escapeHtml(currentUser.email)}</strong></span>
        `;
      } else {
        composerUserBadge.innerHTML = `
          <span>💬 Debates de la comunidad</span>
        `;
      }
    }

    if (isLoading) {
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    const hasMessages = messages && messages.length > 0;
    if (emptyEl) emptyEl.hidden = hasMessages;
    if (listEl) {
      listEl.innerHTML = hasMessages ? renderMessagesHtml(messages) : '';
      attachMessageEvents();
    }

    renderComposerState();
  }

  function renderComposerState() {
    const composerWrap = document.querySelector('#forum-composer-wrap');
    if (!composerWrap) return;

    if (!currentUser) {
      composerWrap.innerHTML = `
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
      const btn = composerWrap.querySelector('#forum-prompt-login-btn');
      btn?.addEventListener('click', () => {
        if (typeof window.openModal === 'function') {
          window.openModal('login');
        }
      });
    } else {
      composerWrap.innerHTML = `
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

      const form = composerWrap.querySelector('#forum-new-message-form');
      form?.addEventListener('submit', handleNewRootMessage);
    }
  }

  function renderMessagesHtml(threadList) {
    return threadList.map((thread) => renderSingleThreadHtml(thread)).join('');
  }

  function renderSingleThreadHtml(msg) {
    const isOwner = currentUser && currentUser.id === msg.user_id;
    const formattedDate = formatForumDate(msg.created_at);
    const userName = displayUser(msg.user_name);
    const userInitials = initials(userName);
    const messageText = escapeHtml(msg.message).replace(/\n/g, '<br>');
    const repliesCount = Array.isArray(msg.replies) ? msg.replies.length : 0;

    return `
      <article class="forum-thread-card" id="forum-msg-${msg.id}" data-message-id="${msg.id}">
        <!-- Mensaje Principal -->
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

        <!-- Formulario inline para responder (oculto por defecto) -->
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

        <!-- Respuestas anidadas directamente debajo -->
        <div class="forum-replies-container" id="forum-replies-wrap-${msg.id}">
          ${Array.isArray(msg.replies) && msg.replies.length > 0 ? `
            <div class="forum-replies-list">
              ${msg.replies.map((reply) => renderReplyHtml(reply, msg)).join('')}
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }

  function renderReplyHtml(reply, parentThread) {
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

  function attachMessageEvents() {
    const listEl = document.querySelector('#forum-messages-list');
    if (!listEl) return;

    // Botones de responder
    listEl.querySelectorAll('.forum-reply-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) {
          if (typeof window.openModal === 'function') {
            window.openModal('login');
          }
          return;
        }

        const parentId = btn.getAttribute('data-reply-to');
        toggleReplyForm(parentId);
      });
    });

    // Botones de cancelar respuesta
    listEl.querySelectorAll('.forum-cancel-reply-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentId = btn.getAttribute('data-cancel-reply');
        hideReplyForm(parentId);
      });
    });

    // Envío de formulario de respuesta
    listEl.querySelectorAll('.forum-reply-form').forEach((form) => {
      form.addEventListener('submit', (e) => handleReplySubmit(e, form));
    });

    // Botones de eliminar
    listEl.querySelectorAll('.forum-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const messageId = btn.getAttribute('data-delete-id');
        handleDeleteMessage(messageId);
      });
    });
  }

  function toggleReplyForm(parentId) {
    const formWrap = document.querySelector(`#forum-reply-form-wrap-${parentId}`);
    if (!formWrap) return;

    const isHidden = formWrap.hidden;
    // Cerrar cualquier otro abierto para mantener orden
    document.querySelectorAll('.forum-reply-form-wrap').forEach((wrap) => {
      wrap.hidden = true;
    });

    if (isHidden) {
      formWrap.hidden = false;
      const textarea = formWrap.querySelector('textarea');
      if (textarea) {
        textarea.value = '';
        textarea.focus();
      }
      activeReplyFormParentId = parentId;
    } else {
      activeReplyFormParentId = null;
    }
  }

  function hideReplyForm(parentId) {
    const formWrap = document.querySelector(`#forum-reply-form-wrap-${parentId}`);
    if (formWrap) {
      formWrap.hidden = true;
      const textarea = formWrap.querySelector('textarea');
      if (textarea) textarea.value = '';
    }
    if (activeReplyFormParentId === parentId) {
      activeReplyFormParentId = null;
    }
  }

  async function handleNewRootMessage(event) {
    event.preventDefault();
    if (!currentUser) {
      if (typeof window.openModal === 'function') {
        window.openModal('login');
      }
      return;
    }

    const form = event.currentTarget;
    const input = form.querySelector('#forum-message-input');
    const submitBtn = form.querySelector('#forum-submit-btn');
    const errorEl = form.querySelector('#forum-form-error');

    const messageText = input?.value.trim() ?? '';
    if (!messageText) return;

    if (errorEl) errorEl.hidden = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publicando...';
    }

    try {
      const res = await fetch(`/api/forum/${encodeURIComponent(currentTicker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo publicar el mensaje.');
      }

      input.value = '';
      showToastMessage('Mensaje publicado en el foro.');

      // Recargar lista y colocar en la lista
      await loadMessages(currentTicker);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:5px"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          Publicar mensaje
        `;
      }
    }
  }

  async function handleReplySubmit(event, form) {
    event.preventDefault();
    if (!currentUser) {
      if (typeof window.openModal === 'function') {
        window.openModal('login');
      }
      return;
    }

    const parentId = form.getAttribute('data-parent-id');
    const textarea = form.querySelector('textarea');
    const submitBtn = form.querySelector('.forum-reply-submit-btn');
    const replyText = textarea?.value.trim() ?? '';

    if (!replyText || !parentId) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      const res = await fetch(`/api/forum/${encodeURIComponent(currentTicker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText,
          parentId: Number(parentId),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo enviar la respuesta.');
      }

      hideReplyForm(parentId);
      showToastMessage('Respuesta añadida.');
      await loadMessages(currentTicker);
    } catch (err) {
      alert(err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Responder';
      }
    }
  }

  async function handleDeleteMessage(messageId) {
    if (!confirm('¿Seguro que deseas eliminar este mensaje?')) return;

    try {
      const res = await fetch(`/api/forum/message/${encodeURIComponent(messageId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'No se pudo eliminar el mensaje.');
      }

      showToastMessage('Mensaje eliminado.');
      await loadMessages(currentTicker);
    } catch (err) {
      alert(err.message);
    }
  }

  // Escuchar cambios de autenticación globales
  window.addEventListener('auth:change', (event) => {
    currentUser = event.detail?.user ?? null;
    renderComposerState();
    // Re-render para mostrar/ocultar botones de eliminar según el usuario actual
    if (!isLoading && messages.length > 0) {
      const listEl = document.querySelector('#forum-messages-list');
      if (listEl) {
        listEl.innerHTML = renderMessagesHtml(messages);
        attachMessageEvents();
      }
    }
  });

  return {
    init: async (ticker, companyName) => {
      currentTicker = ticker;
      currentCompanyName = companyName || ticker;
      await checkAuthSession();
      await loadMessages(ticker);
    },
    load: async (ticker, companyName) => {
      if (ticker) currentTicker = ticker;
      if (companyName) currentCompanyName = companyName;
      await checkAuthSession();
      await loadMessages(currentTicker);
    },
    updateCompany: (ticker, companyName) => {
      currentTicker = ticker;
      currentCompanyName = companyName || ticker;
      const titleEl = document.querySelector('#forum-company-name');
      if (titleEl) {
        titleEl.textContent = `${currentCompanyName} (${currentTicker})`;
      }
    },
  };
})();

window.Forum = Forum;
