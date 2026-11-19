"""Cut the NEXUS NAMIBIA brand assets out of the supplied design boards.
Nothing is redrawn: every file is a pixel crop of the source board, so it matches
the pictures exactly. Boards are 1536x1024, so assets are small; replace the
sources with the original high resolution renders when available and re-run."""
from PIL import Image
import os, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'assets')
b1 = Image.open(os.path.join(HERE, 'source/board1_brand_system.png')).convert('RGB')
b3 = Image.open(os.path.join(HERE, 'source/board3_dashboard.png')).convert('RGB')

def keyed(im, lo=38, hi=80):
    """Soft transparent background: the boards sit on deep navy, so pixels whose
    brightest channel stays near the navy level become transparent."""
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            m = max(r, g, b)
            a = 0 if m <= lo else 255 if m >= hi else int(255 * (m - lo) / (hi - lo))
            px[x, y] = (r, g, b, a)
    return im

crops = {  # name: (source, box)
  'logo-master-bg':   (b1, (22, 22, 240, 178)),    # symbol with orbit, on navy
  'wordmark-bg':      (b1, (258, 22, 530, 128)),   # NEXUS NAMIBIA lettering
  'lockup-bg':        (b1, (22, 22, 600, 190)),    # symbol + wordmark + tagline
  'app-icon-square':  (b1, (948, 24, 1053, 129)),  # App Icon (iOS/Android)
  'app-icon-circle':  (b1, (1086, 24, 1190, 129)), # App Icon (Circle)
  'logo-mark-bg':     (b1, (1215, 40, 1303, 114)), # Logo Mark (Standalone)
  'horizontal-bg':    (b1, (1336, 48, 1518, 112)), # Horizontal Logo
  'hero-dune-tree':   (b1, (606, 0, 926, 197)),    # Namib dune and tree photo
  'dashboard-sidebar-icon': (b3, (34, 30, 152, 140)),
  'dashboard-logo-bg':(b3, (222, 100, 432, 255)),
}
for n, (src, box) in crops.items():
    im = src.crop(box); im.save(os.path.join(OUT, n + '.png'))
    print(n, im.size)
for n in ('logo-master', 'wordmark', 'lockup', 'logo-mark', 'horizontal'):
    im = Image.open(os.path.join(OUT, n + '-bg.png')); keyed(im).save(os.path.join(OUT, n + '.png'))
# favicon and PWA sizes from the square app icon (upscaled with LANCZOS, not redrawn)
sq = Image.open(os.path.join(OUT, 'app-icon-square.png'))
for s in (32, 180, 192, 512):
    sq.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'app-icon-{s}.png'))
# copy for the web app
for dest in (os.path.join(HERE, '..', 'apps', 'web', 'public', 'brand'),):
    os.makedirs(dest, exist_ok=True)
    for f in os.listdir(OUT):
        shutil.copy(os.path.join(OUT, f), os.path.join(dest, f))

# ---- Hexagon emblem: the official logo and app icon (screenshot supplied by the owner) ----
from collections import deque
hx = Image.open(os.path.join(HERE, 'source/logo_hexagon_emblem.jpg')).convert('RGB').crop((185, 715, 900, 1595))
def cutout(im, thr=215):
    """Flood fill from the edges: connected near-white / checkerboard pixels become transparent."""
    im = im.convert('RGBA'); px = im.load(); w, h = im.size
    seen = bytearray(w * h); dq = deque()
    for x in range(w):
        dq.append((x, 0)); dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y)); dq.append((w - 1, y))
    while dq:
        x, y = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]: continue
        r, g, b, _ = px[x, y]
        if min(r, g, b) < thr: continue
        seen[y * w + x] = 1; px[x, y] = (r, g, b, 0)
        dq.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return im
emb = cutout(hx)
bbox = emb.getchannel('A').getbbox(); emb = emb.crop(bbox)
side = max(emb.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(emb, ((side - emb.width) // 2, (side - emb.height) // 2)); sq.save(os.path.join(OUT, 'logo-emblem.png'))
for s in (32, 64, 180, 192, 512, 1024):
    sq.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'emblem-{s}.png'))
# app icon: emblem centred on deep midnight navy #07111F, with safe margin (maskable friendly)
for name, pad in (('app-icon-emblem-1024', 0.16), ('app-icon-emblem-512', 0.16), ('app-icon-emblem-192', 0.16), ('app-icon-emblem-maskable-512', 0.26)):
    size = int(name.split('-')[-1]); bg = Image.new('RGBA', (size, size), (7, 17, 31, 255))
    inner = int(size * (1 - 2 * pad)); e = sq.resize((inner, inner), Image.LANCZOS)
    bg.paste(e, ((size - inner) // 2, (size - inner) // 2), e); bg.convert('RGB').save(os.path.join(OUT, name + '.png'))
shutil.copytree(OUT, os.path.join(HERE, '..', 'apps', 'web', 'public', 'brand'), dirs_exist_ok=True)
