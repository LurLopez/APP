/**
 * @fileoverview Gestor de adjuntos de capturas de pantalla para reportes.
 * Soporta selección de archivos, arrastrar y soltar (drag & drop) y pegado desde portapapeles (Ctrl+V).
 * @module ImageAttachmentManager
 */

(function () {
  'use strict';

  /**
   * Crea una instancia del gestor de adjuntos de imágenes para un formulario.
   * @param {Object} options
   * @param {HTMLElement} options.dropzoneEl
   * @param {HTMLInputElement} options.inputEl
   * @param {HTMLElement} options.previewEl
   * @param {Function} [options.onImagesChange]
   * @param {number} [options.maxImages=5]
   * @returns {Object}
   */
  function createImageAttachmentManager({
    dropzoneEl,
    inputEl,
    previewEl,
    onImagesChange,
    maxImages = 5,
  }) {
    let imagesList = [];

    function renderPreviews() {
      if (!previewEl) return;
      if (imagesList.length === 0) {
        previewEl.innerHTML = '';
        previewEl.hidden = true;
        return;
      }

      previewEl.hidden = false;
      previewEl.innerHTML = imagesList.map((img, idx) => `
        <div class="report-thumb-item">
          <img src="${img}" alt="Captura ${idx + 1}" class="report-thumb-img">
          <button type="button" class="report-thumb-del" data-idx="${idx}" title="Quitar imagen" aria-label="Quitar captura">×</button>
        </div>
      `).join('');

      previewEl.querySelectorAll('.report-thumb-del').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx, 10);
          imagesList.splice(idx, 1);
          renderPreviews();
          onImagesChange?.(imagesList);
        });
      });
    }

    function processFiles(files) {
      const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!imgFiles.length) return;

      imgFiles.forEach((file) => {
        if (imagesList.length >= maxImages) {
          window.showToast?.(`Máximo ${maxImages} capturas permitidas por reporte.`);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          if (imagesList.length < maxImages) {
            imagesList.push(e.target.result);
            renderPreviews();
            onImagesChange?.(imagesList);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (dropzoneEl && inputEl) {
      dropzoneEl.addEventListener('click', () => inputEl.click());

      inputEl.addEventListener('change', (e) => {
        if (e.target.files?.length) {
          processFiles(e.target.files);
          inputEl.value = '';
        }
      });

      ['dragenter', 'dragover'].forEach((evt) => {
        dropzoneEl.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneEl.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach((evt) => {
        dropzoneEl.addEventListener(evt, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzoneEl.classList.remove('is-dragover');
        });
      });

      dropzoneEl.addEventListener('drop', (e) => {
        if (e.dataTransfer?.files?.length) {
          processFiles(e.dataTransfer.files);
        }
      });
    }

    return {
      getImages: () => [...imagesList],
      setImages: (imgs) => {
        imagesList = [...imgs];
        renderPreviews();
      },
      clear: () => {
        imagesList = [];
        renderPreviews();
        onImagesChange?.(imagesList);
      },
      handlePasteEvent: (e) => {
        const items = e.clipboardData?.items;
        if (!items) return false;
        let found = false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              processFiles([file]);
              found = true;
            }
          }
        }
        return found;
      },
    };
  }

  window.ImageAttachmentManager = { createImageAttachmentManager };
})();
