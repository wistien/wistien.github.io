"""Build site-specific font subsets (same typefaces, only the characters the site uses).

    python build_fonts.py <chars.json> <font_source_dir> <site_root>

Writes <site_root>/fonts/*.woff2 and prints the @font-face CSS to stdout.
Characters outside the subset still render in the same typeface through the
Google Fonts fallback stylesheet, so a missed character never breaks the look.
"""
import io
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

chars_path, src_dir, site_root = sys.argv[1:4]
buckets = json.load(open(chars_path, encoding='utf-8'))
out_dir = os.path.join(site_root, 'fonts')
os.makedirs(out_dir, exist_ok=True)

ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
EXTRA_CJK = '已複製✓＋０１２３４５６７８９'  # strings the scripts insert at runtime
LATIN_EXTRA = '—–‘’“”…·©'

FONTS = [
    # (css family, style, source file, output file, characters)
    ('Noto Sans TC', 'normal', 'NotoSansTC[wght].ttf', 'noto-sans-tc-site.woff2',
     buckets.get('Noto Sans TC', '') + ASCII + EXTRA_CJK),
    ('Noto Serif TC', 'normal', 'NotoSerifTC[wght].ttf', 'noto-serif-tc-site.woff2',
     buckets.get('Noto Serif TC', '') + ASCII + EXTRA_CJK),
    ('Cormorant Garamond', 'normal', 'CormorantGaramond[wght].ttf', 'cormorant-garamond-site.woff2',
     buckets.get('Cormorant Garamond', '') + ASCII + LATIN_EXTRA),
    ('Cormorant Garamond', 'italic', 'CormorantGaramond-Italic[wght].ttf', 'cormorant-garamond-italic-site.woff2',
     buckets.get('Cormorant Garamond', '') + ASCII + LATIN_EXTRA),
]


def ranges(cps):
    cps = sorted(set(cps))
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ', '.join(out)


css = []
report = []
for family, style, src, dst, chars in FONTS:
    font = TTFont(os.path.join(src_dir, src))
    cmap = font.getBestCmap()
    wanted = sorted({ord(c) for c in chars if ord(c) in cmap})
    # Only the glyph set is reduced. Outlines, weight axis and hinting tables stay exactly as in the
    # source font (the same data Google Fonts serves), so text renders pixel-for-pixel the same.
    opts = subset.Options()
    opts.flavor = None
    opts.hinting = True
    opts.notdef_outline = True
    opts.name_IDs = [1, 2, 3, 4, 6, 13, 14]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=wanted)
    sub.subset(font)
    lo, hi = 400, 700  # the weights the site's CSS uses
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    open(os.path.join(out_dir, dst), 'wb').write(data)
    covered = sorted(font.getBestCmap().keys())
    report.append(f'{dst}: {len(covered)} characters, {len(data) / 1024:.0f} KB')
    css.append(
        "  @font-face { font-family: '%s'; font-style: %s; font-weight: %d %d; font-display: swap; "
        "src: url('fonts/%s') format('woff2'); unicode-range: %s; }" % (family, style, lo, hi, dst, ranges(covered)))

open(os.path.join(out_dir, 'fonts.css.txt'), 'w', encoding='utf-8', newline='\n').write('\n'.join(css) + '\n')
sys.stderr.write('\n'.join(report) + '\n')
