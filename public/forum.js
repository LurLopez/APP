/**
 * @fileoverview Módulo de Foros por Empresa para Cifra.
 * Gestiona hilos de debate, respuestas en cascada y autenticación del foro.
 */

const Forum = (() => {
  let currentTicker = null;
  let currentCompanyName = null;
  let currentUser = null;
  let messages = [];
  let isLoading = false;
  let activeReplyFormParentId = null;

  const render = window.ForumRender || {};

  function showToastMessage(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }

  function showError(msg) {
    const errorEl = document.querySelector('#forum-error');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.hidden = !msg;
    }
  }

  async function checkAuthSession() {
    try {
      const res = await fetch('/api/auth/me');
      currentUser = res.ok ? (await res.json())?.user ?? null : null;
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

  function renderComposerState() {
    const composerWrap = document.querySelector('#forum-composer-wrap');
    if (!composerWrap) return;
    composerWrap.innerHTML = render.renderComposerHtml?.(currentUser, currentTicker, currentCompanyName) || '';

    const loginBtn = composerWrap.querySelector('#forum-prompt-login-btn');
    loginBtn?.addEventListener('click', () => {
      if (typeof window.openModal === 'function') window.openModal('login');
    });

    const form = composerWrap.querySelector('#forum-new-message-form');
    form?.addEventListener('submit', handleNewRootMessage);
  }

  function renderState() {
    const loadingEl = document.querySelector('#forum-loading');
    const emptyEl = document.querySelector('#forum-empty');
    const listEl = document.querySelector('#forum-messages-list');
    const titleEl = document.querySelector('#forum-company-name');
    const composerBadge = document.querySelector('#forum-composer-user-badge');

    if (titleEl && currentCompanyName) {
      titleEl.textContent = `${currentCompanyName} (${currentTicker})`;
    }
    if (loadingEl) loadingEl.hidden = !isLoading;

    if (composerBadge) {
      composerBadge.innerHTML = currentUser
        ? `<span class="forum-avatar-mini">${render.initials?.(currentUser.email)}</span><span>Publicando como <strong>${render.escapeHtml?.(currentUser.email)}</strong></span>`
        : '<span>💬 Debates de la comunidad</span>';
    }

    if (isLoading) {
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    const hasMessages = messages && messages.length > 0;
    if (emptyEl) emptyEl.hidden = hasMessages;
    if (listEl) {
      listEl.innerHTML = hasMessages ? (render.renderMessagesHtml?.(messages, currentUser) || '') : '';
      attachMessageEvents();
    }

    renderComposerState();
  }

  function toggleReplyForm(parentId) {
    const formWrap = document.querySelector(`#forum-reply-form-wrap-${parentId}`);
    if (!formWrap) return;
    const isHidden = formWrap.hidden;

    document.querySelectorAll('.forum-reply-form-wrap').forEach((w) => { w.hidden = true; });

    if (isHidden) {
      formWrap.hidden = false;
      const textarea = formWrap.querySelector('textarea');
      if (textarea) { textarea.value = ''; textarea.focus(); }
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
    if (activeReplyFormParentId === parentId) activeReplyFormParentId = null;
  }

  async function handleNewRootMessage(event) {
    event.preventDefault();
    if (!currentUser) {
      if (typeof window.openModal === 'function') window.openModal('login');
      return;
    }

    const form = event.currentTarget;
    const input = form.querySelector('#forum-message-input');
    const submitBtn = form.querySelector('#forum-submit-btn');
    const errorEl = form.querySelector('#forum-form-error');
    const messageText = input?.value.trim() ?? '';
    if (!messageText) return;

    if (errorEl) errorEl.hidden = true;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Publicando...'; }

    try {
      const res = await fetch(`/api/forum/${encodeURIComponent(currentTicker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo publicar el mensaje.');

      input.value = '';
      showToastMessage('Mensaje publicado en el foro.');
      await loadMessages(currentTicker);
    } catch (err) {
      if (errorEl) { errorEl.textContent = err.message; errorEl.hidden = false; }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publicar mensaje';
      }
    }
  }

  async function handleReplySubmit(event, form) {
    event.preventDefault();
    if (!currentUser) {
      if (typeof window.openModal === 'function') window.openModal('login');
      return;
    }

    const parentId = form.getAttribute('data-parent-id');
    const textarea = form.querySelector('textarea');
    const submitBtn = form.querySelector('.forum-reply-submit-btn');
    const replyText = textarea?.value.trim() ?? '';
    if (!replyText || !parentId) return;

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando...'; }

    try {
      const res = await fetch(`/api/forum/${encodeURIComponent(currentTicker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText, parentId: Number(parentId) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar la respuesta.');

      hideReplyForm(parentId);
      showToastMessage('Respuesta añadida.');
      await loadMessages(currentTicker);
    } catch (err) {
      alert(err.message);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Responder'; }
    }
  }

  async function handleDeleteMessage(messageId) {
    if (!confirm('¿Seguro que deseas eliminar este mensaje?')) return;
    try {
      const res = await fetch(`/api/forum/message/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo eliminar el mensaje.');
      showToastMessage('Mensaje eliminado.');
      await loadMessages(currentTicker);
    } catch (err) {
      alert(err.message);
    }
  }

  function attachMessageEvents() {
    const listEl = document.querySelector('#forum-messages-list');
    if (!listEl) return;

    listEl.querySelectorAll('.forum-reply-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) {
          if (typeof window.openModal === 'function') window.openModal('login');
          return;
        }
        toggleReplyForm(btn.getAttribute('data-reply-to'));
      });
    });

    listEl.querySelectorAll('.forum-cancel-reply-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideReplyForm(btn.getAttribute('data-cancel-reply'));
      });
    });

    listEl.querySelectorAll('.forum-reply-form').forEach((f) => {
      f.addEventListener('submit', (e) => handleReplySubmit(e, f));
    });

    listEl.querySelectorAll('.forum-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteMessage(btn.getAttribute('data-delete-id'));
      });
    });
  }

  window.addEventListener('auth:change', (event) => {
    currentUser = event.detail?.user ?? null;
    renderComposerState();
    if (!isLoading && messages.length > 0) {
      const listEl = document.querySelector('#forum-messages-list');
      if (listEl) {
        listEl.innerHTML = render.renderMessagesHtml?.(messages, currentUser) || '';
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
      if (titleEl) titleEl.textContent = `${currentCompanyName} (${currentTicker})`;
    },
  };
})();

window.Forum = Forum;
