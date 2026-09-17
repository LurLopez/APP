import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = '/tmp/opencode/guias-en';
const PORT = 9333;
const PROFILE = '/tmp/opencode/chrome-guia-profile';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPageTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Chrome aún no está listo
    }
    await sleep(250);
  }
  throw new Error('Chrome no arrancó');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) fn(msg.params);
        this.listeners.delete(msg.method);
      }
    });
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(event) {
    return new Promise((resolve) => {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(resolve);
    });
  }
}

async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.subtype === 'error') throw new Error(result.description);
  return result.value;
}

const HELPERS = `
const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
};
const bound = (startEl, endEl, padTop = 0, padBottom = 0, endMode = 'bottom') => {
  const body = document.body.getBoundingClientRect();
  const start = rectOf(startEl);
  const end = endEl ? rectOf(endEl) : { top: start.top, bottom: start.bottom };
  const bottom = endMode === 'top' ? end.top : end.bottom;
  return {
    x: body.left,
    y: start.top - padTop,
    width: body.width,
    height: (bottom - start.top) + padTop + padBottom,
  };
};
const cards = () => Array.from(document.querySelectorAll('section.conclusion > div'));
const charts = () => Array.from(document.querySelectorAll('section.conclusion .shares-chart'));
const h3s = (horizonIndex) => Array.from(document.querySelectorAll('section.horizon')[horizonIndex].querySelectorAll('h3'));
`;

const WIDTH_TEXT = 972;
const WIDTH_WIDE = 1200;

const CROPS = [
  {
    file: 'khc-2026-q2-cuenta-3m.png',
    html: '/tmp/opencode/khc-en.html',
    width: WIDTH_TEXT,
    expr: `(() => { ${HELPERS}
      return bound(document.querySelector('h1'), h3s(0)[1], 10, -8, 'top');
    })()`,
  },
  {
    file: 'khc-2026-q2-cashflow-3m.png',
    html: '/tmp/opencode/khc-en.html',
    width: WIDTH_TEXT,
    expr: `(() => { ${HELPERS}
      return bound(h3s(0)[1], h3s(0)[2], 8, -8, 'top');
    })()`,
  },
  {
    file: 'khc-2026-q2-asignacion-3m.png',
    html: '/tmp/opencode/khc-en.html',
    width: WIDTH_TEXT,
    expr: `(() => { ${HELPERS}
      const horizon = document.querySelectorAll('section.horizon')[0];
      return bound(h3s(0)[2], horizon, 8, 10);
    })()`,
  },
  {
    file: 'khc-2026-q2-cuenta-anual.png',
    html: '/tmp/opencode/khc-en.html',
    width: WIDTH_TEXT,
    expr: `(() => { ${HELPERS}
      const horizon = document.querySelectorAll('section.horizon')[1];
      return bound(horizon.querySelector('h2'), h3s(1)[1], 6, -8, 'top');
    })()`,
  },
  {
    file: 'tap-2025-cuenta-anual-impuestos.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_TEXT,
    expr: `(() => { ${HELPERS}
      const horizon = document.querySelectorAll('section.horizon')[0];
      return bound(horizon.querySelector('h2'), h3s(0)[1], 6, -8, 'top');
    })()`,
  },
  {
    file: 'tap-2025-asignacion-anual.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS}
      const horizon = document.querySelectorAll('section.horizon')[0];
      return bound(h3s(0)[2], horizon, 8, 10);
    })()`,
  },
  {
    file: 'tap-analisis-recompras.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} return bound(cards()[0], cards()[0], 4, 4); })()`,
  },
  {
    file: 'tap-analisis-direccion.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} return bound(cards()[1], cards()[1], 4, 4); })()`,
  },
  {
    file: 'tap-analisis-outlook.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} return bound(cards()[2], cards()[2], 4, 4); })()`,
  },
  {
    file: 'tap-analisis-vencimientos.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} const c = charts()[1]; return bound(c, c, 4, 4); })()`,
  },
  {
    file: 'tap-analisis-deuda-evolucion.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} const c = charts()[2]; return bound(c, c, 4, 4); })()`,
  },
  {
    file: 'tap-analisis-adquisiciones.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} return bound(cards()[4], cards()[4], 4, 4); })()`,
  },
  {
    file: 'tap-analisis-dividendos.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS} return bound(cards()[5], cards()[5], 4, 4); })()`,
  },
  {
    file: 'tap-analisis-nota.png',
    html: '/tmp/opencode/tap-en.html',
    width: WIDTH_WIDE,
    expr: `(() => { ${HELPERS}
      const rating = document.querySelector('body > section[style*="dc2626"]');
      return bound(rating, rating, 6, 6);
    })()`,
  },
];

async function applyWidth(cdp, width) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  });
}

async function shoot(cdp, crop, currentWidth) {
  if (currentWidth !== crop.width) {
    await applyWidth(cdp, crop.width);
    currentWidth = crop.width;
  }
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `file://${crop.html}` });
  await loaded;
  await cdp.send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await sleep(250);
  const rect = await evaluate(cdp, crop.expr);
  const clip = {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    scale: 1,
  };
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip,
    captureBeyondViewport: true,
    fromSurface: true,
  });
  fs.writeFileSync(path.join(OUT_DIR, crop.file), Buffer.from(shot.data, 'base64'));
  console.log(`${crop.file} · ${clip.width}x${clip.height} css`);
  return currentWidth;
}

async function run() {
  const target = await getPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  let currentWidth = 0;
  for (const crop of CROPS) {
    currentWidth = await shoot(cdp, crop, currentWidth);
  }
  ws.close();
  chrome.kill('SIGTERM');
}

run().catch((error) => {
  console.error(error);
  chrome.kill('SIGTERM');
  process.exitCode = 1;
});
