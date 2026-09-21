/**
 * @fileoverview Mini-chat administrativo interactivo con DeepSeek para iterar y corregir informes específicos.
 * @module AnalisisAdminChat
 */

(function (window) {
  'use strict';

  const AS = window.AnalisisState;
  let chatHistory = [];
  let currentChatAnalysisId = null;
  let isSending = false;

  function escapeHtml(text) {
    if (window.AnalisisTables?.escapeHtml) {
      return window.AnalisisTables.escapeHtml(text);
    }
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  function getDrawer() {
    return document.querySelector('#admin-ai-chat-drawer');
  }

  function getMessagesContainer() {
    return document.querySelector('#admin-ai-chat-messages');
  }

  function getInput() {
    return document.querySelector('#admin-ai-chat-input');
  }

  function getSubmitBtn() {
    return document.querySelector('#admin-ai-chat-send');
  }

  function scrollToBottom() {
    const container = getMessagesContainer();
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function showWelcomeMessage() {
    const container = getMessagesContainer();
    if (!container) return;
    const ticker = AS?.currentAnalysisTicker || 'este informe';
    container.innerHTML = `
      <div class="admin-ai-chat-msg assistant welcome">
        <div class="msg-avatar">✨</div>
        <div class="msg-bubble">
          <p><strong>Asistente DeepSeek para administradores</strong></p>
          <p>Puedo ayudarte a corregir cifras, actualizar tablas (como Capital Allocation, Ventas o Deuda Neta), recalcular desviaciones o pulir notas para <strong>${escapeHtml(ticker)}</strong>.</p>
          <p class="msg-hint">Cualquier cambio que solicites se aplicará automáticamente a los datos del informe en tiempo real.</p>
        </div>
      </div>
    `;
    scrollToBottom();
  }

  function appendMessage(role, text, { hasModifications = false, isError = false } = {}) {
    const container = getMessagesContainer();
    if (!container) return;

    const msgEl = document.createElement('div');
    msgEl.className = `admin-ai-chat-msg ${role}${isError ? ' error' : ''}`;

    const avatar = role === 'user' ? '👤' : '✨';
    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');

    let modificationBadge = '';
    if (hasModifications) {
      modificationBadge = `
        <div class="msg-mod-badge" title="Los cambios se guardaron y aplicaron al informe actual">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Informe actualizado en tiempo real
        </div>
      `;
    }

    msgEl.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-bubble">
        <div class="msg-content">${formattedText}</div>
        ${modificationBadge}
      </div>
    `;

    container.appendChild(msgEl);
    scrollToBottom();
  }

  function setLoading(loading) {
    isSending = loading;
    const input = getInput();
    const submitBtn = getSubmitBtn();
    const container = getMessagesContainer();

    if (input) input.disabled = loading;
    if (submitBtn) submitBtn.disabled = loading;

    const existingTyping = document.querySelector('#admin-ai-chat-typing');
    if (loading) {
      if (!existingTyping && container) {
        const typingEl = document.createElement('div');
        typingEl.id = 'admin-ai-chat-typing';
        typingEl.className = 'admin-ai-chat-typing';
        typingEl.innerHTML = `
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <em>DeepSeek está analizando e iterando el informe…</em>
        `;
        container.appendChild(typingEl);
        scrollToBottom();
      }
    } else if (existingTyping) {
      existingTyping.remove();
    }
  }

  function open() {
    const drawer = getDrawer();
    if (!drawer) return;

    if (!AS?.currentAnalysisId) {
      if (typeof window.showToast === 'function') {
        window.showToast('Abre un informe primero para poder iterarlo con IA.');
      }
      return;
    }

    const subtitle = document.querySelector('#admin-ai-chat-subtitle');
    if (subtitle) {
      const parts = [AS.currentAnalysisTicker, AS.currentAnalysisSlug || ''].filter(Boolean);
      subtitle.textContent = parts.join(' · ');
    }

    if (currentChatAnalysisId !== AS.currentAnalysisId) {
      currentChatAnalysisId = AS.currentAnalysisId;
      chatHistory = [];
      showWelcomeMessage();
    }

    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');

    const input = getInput();
    if (input) {
      setTimeout(() => input.focus(), 80);
    }
  }

  function close() {
    const drawer = getDrawer();
    if (drawer) {
      drawer.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
    }
  }

  function toggle() {
    const drawer = getDrawer();
    if (!drawer) return;
    if (drawer.hidden) {
      open();
    } else {
      close();
    }
  }

  async function sendMessage(text) {
    const messageText = String(text ?? '').trim();
    if (!messageText || isSending) return;

    const analysisId = AS?.currentAnalysisId;
    if (!analysisId) {
      if (typeof window.showToast === 'function') {
        window.showToast('No hay un informe activo para editar.');
      }
      return;
    }

    appendMessage('user', messageText);
    chatHistory.push({ role: 'user', content: messageText });

    const input = getInput();
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/reports/ai-analysis/${analysisId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: chatHistory.slice(-10),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const errorMsg = data.error || 'Error al comunicarse con DeepSeek. Inténtalo de nuevo.';
        appendMessage('assistant', errorMsg, { isError: true });
        if (typeof window.showToast === 'function') {
          window.showToast(errorMsg);
        }
        return;
      }

      const replyText = data.message || 'Cambios procesados.';
      chatHistory.push({ role: 'assistant', content: replyText });
      appendMessage('assistant', replyText, { hasModifications: Boolean(data.hasModifications) });

      if (data.hasModifications && data.report) {
        if (typeof window.renderReport === 'function') {
          window.renderReport(data.report);
        }
        if (AS) {
          AS.currentReport = data.report;
        }
        if (typeof window.showToast === 'function') {
          window.showToast('Informe actualizado correctamente con DeepSeek ✨');
        }
        if (typeof window.refreshAnalysisVersions === 'function') {
          window.refreshAnalysisVersions();
        }
      }
    } catch {
      appendMessage('assistant', 'Error de conexión con el servidor. Verifica tu conexión.', { isError: true });
      if (typeof window.showToast === 'function') {
        window.showToast('Error de conexión con el servidor.');
      }
    } finally {
      setLoading(false);
      const inputEl = getInput();
      if (inputEl) inputEl.focus();
    }
  }

  function init() {
    const triggerBtn = document.querySelector('#admin-ai-chat-btn');
    triggerBtn?.addEventListener('click', toggle);

    const closeBtn = document.querySelector('#admin-ai-chat-close');
    closeBtn?.addEventListener('click', close);

    const form = document.querySelector('#admin-ai-chat-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = getInput();
      if (input) sendMessage(input.value);
    });

    const input = getInput();
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
      }
    });

    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });

    document.querySelectorAll('.admin-ai-chat-suggestions .suggestion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (!prompt) return;
        const inputEl = getInput();
        if (inputEl) {
          inputEl.value = prompt;
          inputEl.focus();
          inputEl.setSelectionRange(prompt.length, prompt.length);
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const drawer = getDrawer();
        if (drawer && !drawer.hidden) {
          close();
        }
      }
    });
  }

  window.AnalisisAdminChat = {
    open,
    close,
    toggle,
    sendMessage,
    init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
