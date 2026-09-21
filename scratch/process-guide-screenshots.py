from PIL import Image
import numpy as np
import os

SRC = '/tmp/opencode/guias-en'
DST = '/tmp/opencode/guias-final'
os.makedirs(DST, exist_ok=True)

TEXT_CROPS = {
    'khc-2026-q2-cuenta-3m.png', 'khc-2026-q2-cashflow-3m.png',
    'khc-2026-q2-asignacion-3m.png', 'khc-2026-q2-cuenta-anual.png',
    'tap-2025-cuenta-anual-impuestos.png',
}
PAD = 44  # 22 CSS px a 2x

def bbox_nonwhite(a, thresh):
    mask = (a < thresh).any(axis=2)
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    return cols.min(), rows.min(), cols.max(), rows.max()

for name in sorted(os.listdir(SRC)):
    if not name.endswith('.png'):
        continue
    im = Image.open(os.path.join(SRC, name)).convert('RGB')
    a = np.array(im)
    x0, y0, x1, y1 = bbox_nonwhite(a, 252)
    content = im.crop((x0, y0, x1 + 1, y1 + 1))
    if name in TEXT_CROPS:
        canvas = Image.new('RGB', (content.width + PAD * 2, content.height + PAD * 2), (255, 255, 255))
        canvas.paste(content, (PAD, PAD))
        out = canvas
    else:
        out = content
    out.save(os.path.join(DST, name))
    print(name, im.size, '->', out.size)
