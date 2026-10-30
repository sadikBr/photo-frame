#!/usr/bin/env python3
"""Builds public/css/themes/<id>.css from tools/themes/<id>.css.

In the sources, `svg(<svg …>…</svg>)` becomes a data: URL, and a first line
`/* fonts: amiri, aref-ruqaa */` pulls in the @font-face rules from tools/themes/fonts-<name>.css.
Run: python3 tools/build-themes.py
"""
import os, re, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'themes')
OUT = os.path.join(HERE, '..', 'public', 'css', 'themes')

def data_url(svg):
    svg = re.sub(r'\s+', ' ', svg.strip())
    if 'xmlns=' not in svg:
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" =:/,.-;'()") .replace('"', "'") + '")'

def build(name):
    src = open(os.path.join(SRC, name)).read()
    fonts = ''
    m = re.match(r'/\* fonts: ([^*]+)\*/', src)
    if m:
        for f in [x.strip() for x in m.group(1).split(',') if x.strip()]:
            fonts += open(os.path.join(SRC, 'fonts-' + f + '.css')).read()
    css = re.sub(r'svg\((<svg.*?</svg>)\)', lambda mm: data_url(mm.group(1)), src, flags=re.S)
    head = '/* Built by tools/build-themes.py from tools/themes/' + name + ' — edit that file, not this one. */\n'
    open(os.path.join(OUT, name), 'w').write(head + fonts + css)

os.makedirs(OUT, exist_ok=True)
for n in sorted(os.listdir(SRC)):
    if n.endswith('.css') and not n.startswith('fonts-'):
        build(n)
        print('built', n)
