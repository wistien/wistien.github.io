"""Generate optimized WebP derivatives from the best-quality originals.
Usage: python -I tools/make_images.py <originals_dir> <out_dir>"""
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

CAROUSEL = ['photo-5', 'photo-10', 'photo-12', 'photo-14', 'photo-7', 'photo-11', 'photo-13', 'photo-9', 'photo-15', 'photo-8']
CAROUSEL_W = [960, 1280]  # ~1.5x the on-screen size, so photos stay as crisp as the originals
BACKGROUNDS = {'photo-3': [1024, 1600], 'lakeside': [1024, 1600], 'photo-1': [1024, 1600]}

def resized(im, w):
    if w >= im.width:
        return im.copy(), im.width
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS), w

rows = []
def save(im, name, q):
    p = os.path.join(out, name)
    im.save(p, 'WEBP', quality=q, method=6)
    rows.append((name, im.size, os.path.getsize(p)))

for n in CAROUSEL:
    im = Image.open(os.path.join(src, n + '.jpg')).convert('RGB')
    done = set()
    for w in CAROUSEL_W:
        r, rw = resized(im, w)
        if rw in done:
            continue
        done.add(rw)
        save(r, f'{n}-{rw}.webp', 84 if rw > 960 else 86)

for n, ws in BACKGROUNDS.items():
    im = Image.open(os.path.join(src, n + '.jpg')).convert('RGB')
    for w in ws:
        r, rw = resized(im, w)
        save(r, f'{n}-{rw}.webp', 80)

logo = Image.open(os.path.join(src, 'logo.png')).convert('RGBA')
for w in (176, 600):
    r = logo.resize((w, w), Image.LANCZOS)
    save(r, f'logo-{w}.webp', 90)

total = 0
for name, size, b in rows:
    total += b
    print(f'{name:22s} {size[0]}x{size[1]:<5d} {b/1024:7.1f} KB')
print('files', len(rows), 'total', round(total/1024), 'KB')
