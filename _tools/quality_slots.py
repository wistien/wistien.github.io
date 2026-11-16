"""What the visitor actually sees: scale each candidate file to the on-screen slot and compare with
the same slot rendered from the lossless original.
Usage: python -I -X utf8 quality_slots.py <originals> <live_images> <names> <slots>"""
import io
import math
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageStat

orig_dir, live_dir = sys.argv[1], sys.argv[2]
names = sys.argv[3].split(',')
slots = [int(v) for v in sys.argv[4].split(',')]


def psnr(a, b):
    rms = ImageStat.Stat(ImageChops.difference(a.convert('L'), b.convert('L'))).rms[0]
    return 99.0 if rms == 0 else 20 * math.log10(255 / rms)


def ssim(a, b, tmp):
    pa, pb = os.path.join(tmp, 'a.png'), os.path.join(tmp, 'b.png')
    a.save(pa); b.save(pb)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', pa, '-i', pb, '-lavfi', 'ssim', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'All:([0-9.]+)', r.stderr)
    return float(m.group(1)) if m else float('nan')


def webp(im, w, q):
    w = min(w, im.width)
    r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); r.save(buf, 'WEBP', quality=q, method=6)
    return Image.open(io.BytesIO(buf.getvalue())).convert('RGB'), len(buf.getvalue()) / 1024


with tempfile.TemporaryDirectory() as tmp:
    for n in names:
        o = Image.open(os.path.join(orig_dir, n + '.jpg')).convert('RGB')
        live = Image.open(os.path.join(live_dir, n + '.jpg')).convert('RGB')
        for slot in slots:
            size = (slot, round(o.height * slot / o.width))
            ref = o.resize(size, Image.LANCZOS)
            shown = live.resize(size, Image.LANCZOS)
            print(f'{n} shown at {slot}px | now (live JPEG {os.path.getsize(os.path.join(live_dir, n + ".jpg")) // 1024}KB): ssim={ssim(ref, shown, tmp):.4f} psnr={psnr(ref, shown):.1f}')
            for w, q in ((640, 86), (960, 86), (1280, 84)):
                if w < slot * 0.95:
                    continue
                dec, kb = webp(o, w, q)
                shown = dec.resize(size, Image.LANCZOS)
                print(f'      webp {min(w, o.width)}w q{q} ({kb:.0f}KB): ssim={ssim(ref, shown, tmp):.4f} psnr={psnr(ref, shown):.1f}')
