"""Pixel-compare before/after screenshots.
Usage: python -I -X utf8 diff_shots.py <before_dir> <after_dir> [out_dir_for_diff_images]
Pairs files named <device>-before-<x>.png with <device>-after-<x>.png."""
import os
import sys

from PIL import Image, ImageChops

bdir, adir = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out:
    os.makedirs(out, exist_ok=True)

rows = []
for f in sorted(os.listdir(bdir)):
    if '-before-' not in f:
        continue
    g = f.replace('-before-', '-after-')
    if not os.path.exists(os.path.join(adir, g)):
        rows.append((f, 'MISSING', '', '', ''))
        continue
    a = Image.open(os.path.join(bdir, f)).convert('RGB')
    b = Image.open(os.path.join(adir, g)).convert('RGB')
    if a.size != b.size:
        rows.append((f, f'SIZE {a.size} vs {b.size}', '', '', ''))
        continue
    d = ImageChops.difference(a, b).convert('L')
    hist = d.histogram()
    total = a.size[0] * a.size[1]
    over8 = sum(hist[9:]) / total * 100
    over40 = sum(hist[41:]) / total * 100
    strong = d.point(lambda v: 255 if v > 40 else 0)
    bbox = strong.getbbox()
    rows.append((f.replace('-before-', ' '), f'{over8:5.2f}%', f'{over40:5.2f}%', str(bbox), max(i for i, c in enumerate(hist) if c)))
    if out and over40 > 0.02:
        vis = Image.new('RGB', (a.size[0] * 3, a.size[1]))
        vis.paste(a, (0, 0)); vis.paste(b, (a.size[0], 0)); vis.paste(Image.merge('RGB', (strong, strong, strong)), (a.size[0] * 2, 0))
        vis.save(os.path.join(out, f.replace('-before-', '-diff-')))

print(f'{"shot":34s} {">8":>7s} {">40":>7s}  max  bbox(of >40)')
for r in rows:
    print(f'{r[0]:34s} {r[1]:>7s} {r[2]:>7s}  {r[4]!s:>3s}  {r[3]}')
