/**
 * @fileoverview Arrastre y scroll de la tabla de estados financieros.
 */

(function (window) {
  const ES = window.EmpresaStatementsState;


  function initScreenerTableDrag() {
    const wrap = document.querySelector('#screener-table-wrap') || document.querySelector('.screener-block .table-wrap');
    if (!wrap) return null;

    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;
    let hasDragged = false;
    let velocityX = 0;
    let lastX = 0;
    let lastTime = 0;
    let animId = null;

    function stopMomentum() {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    }

    function startMomentum() {
      stopMomentum();
      let v = velocityX;
      const friction = 0.94;
      const minV = 0.15;

      function step() {
        if (Math.abs(v) < minV || isDown) {
          stopMomentum();
          return;
        }
        wrap.scrollLeft -= v * 16;
        v *= friction;
        animId = requestAnimationFrame(step);
      }
      animId = requestAnimationFrame(step);
    }

    function update() {
      const canScroll = wrap.scrollWidth > wrap.clientWidth + 2;
      wrap.classList.toggle('can-scroll', canScroll);
      wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 2);
    }

    wrap.addEventListener('scroll', () => {
      wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 2);
    }, { passive: true });

    window.addEventListener('resize', update);

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button, input, select, textarea, a')) return;

      stopMomentum();
      isDown = true;
      hasDragged = false;
      startX = e.clientX;
      scrollLeftStart = wrap.scrollLeft;
      lastX = e.clientX;
      lastTime = performance.now();
      velocityX = 0;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;

      const currentX = e.clientX;
      const diffX = currentX - startX;

      if (!hasDragged && Math.abs(diffX) > 4) {
        hasDragged = true;
        wrap.classList.add('is-dragging');
        document.body.classList.add('screener-table-dragging');
        window.getSelection()?.removeAllRanges();
      }

      if (hasDragged) {
        e.preventDefault();
        wrap.scrollLeft = scrollLeftStart - diffX;

        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 8) {
          velocityX = (currentX - lastX) / dt;
          lastX = currentX;
          lastTime = now;
        }
      }
    });

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      wrap.classList.remove('is-dragging');
      document.body.classList.remove('screener-table-dragging');

      if (hasDragged) {
        const now = performance.now();
        if (now - lastTime > 60) {
          velocityX = 0;
        } else if (Math.abs(velocityX) > 0.15) {
          startMomentum();
        }

        const swallowClick = (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          evt.stopImmediatePropagation();
        };
        window.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', swallowClick, { capture: true });
        }, 100);
      }
    };

    window.addEventListener('mouseup', onMouseUp);
    update();

    return {
      update,
      resetScroll: () => {
        stopMomentum();
        wrap.scrollLeft = 0;
        update();
      },
    };
  }

  function updateScreenerTableScroll() {
    if (!ES.screenerTableDragController) {
      ES.screenerTableDragController = initScreenerTableDrag();
    } else {
      ES.screenerTableDragController.update();
    }
  }

window.initScreenerTableDrag = initScreenerTableDrag;
window.updateScreenerTableScroll = updateScreenerTableScroll;

})(window);
