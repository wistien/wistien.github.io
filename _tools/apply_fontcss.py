"""Put the freshly built @font-face rules into the site stylesheet.

    python -X utf8 apply_fontcss.py <fonts.css.txt> <stylesheet> [<more files> ...]

build_fonts.py writes four @font-face rules to <site_root>/fonts/fonts.css.txt.
This script replaces the four @font-face lines at the top of each given file
(normally ../src/styles/site.css) with them, makes the font paths root-relative
(/fonts/...) so they work on every page, and then deletes fonts.css.txt.
"""
import os
import sys

css_path = sys.argv[1]
targets = sys.argv[2:]
assert targets, 'give at least one file to update'

css = [c.strip() for c in open(css_path, encoding='utf-8').read().split('\n') if c.strip()]
assert len(css) == 4, f'expected 4 @font-face rules, got {len(css)}'
css = [c.replace("url('fonts/", "url('/fonts/") for c in css]
assert all("url('/fonts/" in c for c in css), 'unexpected font path in fonts.css.txt'

for target in targets:
    s = open(target, encoding='utf-8', newline='').read()
    lines = s.split('\n')
    idx = [i for i, l in enumerate(lines) if l.lstrip().startswith('@font-face')]
    assert len(idx) == 4 and idx == list(range(idx[0], idx[0] + 4)), f'{target}: unexpected @font-face lines {idx}'
    first = lines[idx[0]]
    indent = first[:len(first) - len(first.lstrip())]
    cr = '\r' if first.endswith('\r') else ''
    lines[idx[0]:idx[0] + 4] = [indent + c + cr for c in css]
    open(target, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
    print(f'updated {target} (lines {idx[0] + 1}-{idx[0] + 4})')

os.remove(css_path)
print('removed', css_path)
