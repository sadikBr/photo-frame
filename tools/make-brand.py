# Usage: python3 tools/make-brand.py public   (needs: pip install playwright pillow)
# Brand assets for "لوحة العائلة": a Moroccan horseshoe arch as a frame, a night sky inside it,
# and the 8-point zellige star. Renders icons, splash screens and the boot mark with Chromium.
import math, os, sys, io
from playwright.sync_api import sync_playwright
from PIL import Image

PUB = sys.argv[1]
import base64
def font_url(name):
    return 'data:font/woff;base64,' + base64.b64encode(open(os.path.join(PUB, 'fonts', name), 'rb').read()).decode()
KUFI, READEX = font_url('reem-kufi.woff'), font_url('readex-pro.woff')

def star(cx, cy, R, r, n=8, rot=-math.pi / 2):
    pts = []
    for i in range(n * 2):
        rad = r if i % 2 else R
        a = rot + i * math.pi / n
        pts.append('%.2f,%.2f' % (cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return ' '.join(pts)

def arch_paths(cx=256, cy=236, r_in=120, half_in=100, t=22, bottom_in=410):
    def ring(r, half, bottom):
        dy = math.sqrt(r * r - half * half)
        return 'M%.1f %.1f V%.1f A%.1f %.1f 0 1 1 %.1f %.1f V%.1f Z' % (cx - half, bottom, cy + dy, r, r, cx + half, cy + dy, bottom)
    inner = ring(r_in, half_in, bottom_in)
    outer = ring(r_in + t, half_in + t, bottom_in + t)
    return outer, inner

def mark(scale=1.0, mono=False, bg=True, rounded=0, sky_stars=True):
    """The mark on a 512 canvas. scale shrinks the art around the centre (maskable safe zone)."""
    outer, inner = arch_paths()
    gold = '#FFFFFF' if mono else 'url(#gold)'
    parts = []
    defs = '''<defs>
<linearGradient id="ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A1426"/><stop offset="1" stop-color="#1E0A16"/></linearGradient>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121A4E"/><stop offset=".7" stop-color="#22306E"/><stop offset="1" stop-color="#3B3A78"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD27A"/><stop offset="1" stop-color="#E89A2C"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#F2AE3D" stop-opacity=".45"/><stop offset="1" stop-color="#F2AE3D" stop-opacity="0"/></radialGradient>
<clipPath id="opening"><path d="%s"/></clipPath>
</defs>''' % inner
    if bg and not mono:
        parts.append('<rect width="512" height="512" rx="%d" fill="url(#ground)"/>' % rounded)
        # faint zellige stars in the ground
        for (x, y) in [(64, 64), (448, 64), (64, 448), (448, 448), (256, -8), (-8, 256), (520, 256), (256, 520)]:
            parts.append('<polygon points="%s" fill="none" stroke="#F3EDE2" stroke-opacity=".07" stroke-width="3"/>' % star(x, y, 46, 30))
    g = ['<g transform="translate(256 256) scale(%.3f) translate(-256 -256)">' % scale]
    if not mono:
        g.append('<path d="%s" fill="url(#sky)"/>' % inner)
        g.append('<g clip-path="url(#opening)"><circle cx="256" cy="290" r="120" fill="url(#glow)"/>')
        if sky_stars:
            for (x, y, rr) in [(196, 200, 3), (318, 186, 2.6), (220, 150, 2.2), (300, 236, 2), (178, 262, 2.2), (338, 270, 2.4), (262, 132, 2)]:
                g.append('<circle cx="%d" cy="%d" r="%.1f" fill="#FFF3D6" opacity=".85"/>' % (x, y, rr))
        g.append('</g>')
    g.append('<path d="%s %s" fill-rule="evenodd" fill="%s"/>' % (outer, inner, gold))
    if mono:
        g.append('<polygon points="%s" fill="#FFFFFF"/>' % star(256, 296, 62, 42))
    else:
        g.append('<polygon points="%s" fill="%s"/>' % (star(256, 296, 62, 42), gold))
        g.append('<circle cx="256" cy="296" r="15" fill="#1A2258"/>')
    g.append('</g>')
    return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">%s%s%s</svg>' % (defs, ''.join(parts), ''.join(g))

def splash_html(w, h):
    s = min(w, h)
    m = int(s * 0.42)
    return '''<html><head><style>
@font-face { font-family: Kufi; src: url('%s') format('woff'); font-weight: 400 700; }
@font-face { font-family: Readex; src: url('%s') format('woff'); font-weight: 160 700; }
html, body { margin: 0; width: %dpx; height: %dpx; overflow: hidden; }
body { background: radial-gradient(ellipse at 50%% 38%%, #4A1A33 0%%, #2A0D1B 55%%, #1A0812 100%%);
  display: flex; flex-direction: column; align-items: center; justify-content: center; direction: rtl; }
.m { width: %dpx; height: %dpx; }
.n { margin-top: %dpx; font: 600 %dpx/1.2 Kufi; color: #F3EDE2; }
.t { margin-top: %dpx; font: 300 %dpx/1.2 Readex; color: #F2AE3D; letter-spacing: 0; }
</style></head><body><div class="m">%s</div><div class="n">لوحة العائلة</div><div class="t">الإطار</div></body></html>''' % (
        KUFI, READEX, w, h, m, m, int(s * 0.05), int(s * 0.085), int(s * 0.018), int(s * 0.04),
        mark(bg=False).replace('width="512" height="512"', 'width="100%%" height="100%%"', 1))

def render(pg, svg_or_html, size, out, html=False):
    w, h = size
    pg.set_viewport_size({'width': w, 'height': h})
    # Only the outer <svg> gets the new size; the drawing inside keeps its 512 coordinates.
    body = svg_or_html if html else ('<html><body style="margin:0;background:transparent"><div style="display:flex">'
        + svg_or_html.replace('width="512" height="512"', 'width="%d" height="%d"' % (w, h), 1) + '</div></body></html>')
    pg.set_content(body)
    if html: pg.evaluate('document.fonts.ready')
    pg.wait_for_timeout(250)
    pg.screenshot(path=out, omit_background=not html, type='png')

# iPhone screens (portrait, device pixels) for apple-touch-startup-image
IPHONES = [  # (css w, css h, dpr)
    (430, 932, 3), (393, 852, 3), (428, 926, 3), (390, 844, 3), (375, 812, 3), (414, 896, 3), (414, 896, 2), (375, 667, 2), (320, 568, 2),
]

os.makedirs(os.path.join(PUB, 'brand'), exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    # icons
    any_svg = mark(rounded=112)
    full_svg = mark(rounded=0)
    mask_svg = mark(rounded=0, scale=0.8)
    mono_svg = mark(mono=True, bg=False, scale=0.8)
    open(os.path.join(PUB, 'favicon.svg'), 'w').write(any_svg)
    open(os.path.join(PUB, 'brand', 'mark.svg'), 'w').write(mark(bg=False))
    for size in (192, 512):
        render(pg, any_svg, (size, size), os.path.join(PUB, 'icon-%d.png' % size))
        render(pg, mask_svg, (size, size), os.path.join(PUB, 'brand', 'icon-maskable-%d.png' % size))
    render(pg, mono_svg, (512, 512), os.path.join(PUB, 'brand', 'icon-monochrome-512.png'))
    render(pg, full_svg, (180, 180), os.path.join(PUB, 'apple-touch-icon.png'))
    render(pg, any_svg, (32, 32), os.path.join(PUB, 'favicon-32.png'))
    # iOS splash screens
    links = []
    for (cw, ch, dpr) in IPHONES:
        w, h = cw * dpr, ch * dpr
        name = 'splash-%dx%d.png' % (w, h)
        render(pg, splash_html(w, h), (w, h), os.path.join(PUB, 'brand', name), html=True)
        im = Image.open(os.path.join(PUB, 'brand', name)).convert('RGB')
        im.save(os.path.join(PUB, 'brand', name), optimize=True)
        links.append('<link rel="apple-touch-startup-image" media="(device-width: %dpx) and (device-height: %dpx) and (-webkit-device-pixel-ratio: %d) and (orientation: portrait)" href="brand/%s">' % (cw, ch, dpr, name))
    open(os.path.join(PUB, 'brand', 'startup-links.html'), 'w').write('\n'.join(links) + '\n')
    b.close()
print('done')
