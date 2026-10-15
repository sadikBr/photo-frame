# Usage: python3 tools/paint-demo-photos.py out   then copy out/photo-*.jpg to public/demo/
# Paints four Moroccan scenes as SVG and renders them to 1920x1200 JPEGs with Chromium.
import math, random, sys, os
from playwright.sync_api import sync_playwright
from PIL import Image

W, H = 1920, 1200
OUT = sys.argv[1]

def smooth_path(pts, close_bottom=True, bottom=H):
    # Catmull-Rom through pts -> cubic Bezier path
    d = 'M%.1f %.1f' % pts[0]
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += ' C%.1f %.1f %.1f %.1f %.1f %.1f' % (c1 + c2 + p2)
    if close_bottom:
        d += ' L%d %d L%d %d Z' % (pts[-1][0], bottom, pts[0][0], bottom)
    return d

def ridge(rng, base, amp, rough, n=9, x0=-60, x1=W + 60):
    # midpoint displacement mountain profile
    pts = [(x0, base + rng.uniform(-amp, amp) * .3), (x1, base + rng.uniform(-amp, amp) * .3)]
    disp = amp
    for _ in range(n):
        new = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            mx = (a[0] + b[0]) / 2
            my = (a[1] + b[1]) / 2 + rng.uniform(-disp, disp)
            new += [(mx, my), b]
        pts = new
        disp *= rough
    return 'M' + ' L'.join('%.1f %.1f' % p for p in pts) + ' L%d %d L%d %d Z' % (x1, H, x0, H)

GRAIN = '''<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/>
<feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .55 0"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="softer"><feGaussianBlur stdDeviation="40"/></filter>
<filter id="haze"><feGaussianBlur stdDeviation="6"/></filter>'''
GRAIN_RECT = '<rect width="%d" height="%d" filter="url(#grain)" opacity=".14" style="mix-blend-mode:overlay"/>' % (W, H)
VIGNETTE = '''<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>'''
VIG_RECT = '<rect width="%d" height="%d" fill="url(#vig)"/>' % (W, H)

def svg(defs, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><defs>%s%s%s</defs>%s%s%s</svg>'
            % (W, H, W, H, GRAIN, VIGNETTE, defs, body, VIG_RECT, GRAIN_RECT))

# ---------------- 1. Sahara dunes at sunset ----------------
def dunes():
    rng = random.Random(3)
    defs = '''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#2A1A4A"/><stop offset=".35" stop-color="#6E3566"/><stop offset=".58" stop-color="#D2655A"/>
<stop offset=".72" stop-color="#F3A15E"/><stop offset=".8" stop-color="#FCD49A"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#FFE6B0" stop-opacity=".95"/><stop offset=".25" stop-color="#FFB867" stop-opacity=".55"/><stop offset="1" stop-color="#FF8A4C" stop-opacity="0"/></radialGradient>'''
    body = '<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H)
    body += '<circle cx="1260" cy="690" r="620" fill="url(#glow)"/>'
    # wispy clouds lit from below
    for (cx, cy, rx, ry, col, op) in [(560, 300, 420, 18, '#F6A27A', .55), (900, 250, 300, 12, '#F8B98C', .45), (1500, 360, 380, 16, '#F59A6E', .5),
                                      (300, 420, 260, 10, '#FFC48F', .45), (1700, 220, 260, 10, '#E88A86', .35), (1120, 470, 340, 9, '#FFD3A0', .5)]:
        body += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="%.2f" filter="url(#soft)"/>' % (cx, cy, rx, ry, col, op)
    body += '<circle cx="1260" cy="700" r="70" fill="#FFF1CF"/>'
    # dune layers, far to near: (base y, amplitude, top colour, bottom colour)
    layers = [(735, 40, '#E59563', '#C4704E'), (790, 60, '#D9814F', '#A9553D'), (860, 80, '#C96C3E', '#8F432F'),
              (960, 110, '#B85A31', '#6E3024'), (1080, 120, '#9C4826', '#4A1E18')]
    for i, (base, amp, c1, c2) in enumerate(layers):
        pts = []
        x = -100
        phase = rng.uniform(0, 6)
        while x < W + 200:
            y = base - amp * (0.55 * math.sin(x / (260 + 60 * i) + phase) + 0.45 * math.sin(x / (110 + 30 * i) + phase * 2)) ** 2 * 0 \
                - amp * abs(math.sin(x / (300 + 70 * i) + phase)) ** 1.6
            pts.append((x, y))
            x += 60 + 10 * i
        defs += '<linearGradient id="d%d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (i, c1, c2)
        body += '<path d="%s" fill="url(#d%d)"/>' % (smooth_path(pts), i)
        # sunlit crest highlight
        body += '<path d="%s" fill="none" stroke="#FFD39A" stroke-opacity="%.2f" stroke-width="%d" filter="url(#haze)"/>' % (smooth_path(pts, False), .5 - i * .07, 6 - i)
    # ripples in the foreground sand
    for k in range(14):
        y0 = 1110 + k * 7 + rng.uniform(-3, 3)
        body += '<path d="M%d %.1f Q%d %.1f %d %.1f" stroke="#2E120E" stroke-opacity=".25" stroke-width="2" fill="none"/>' % (
            rng.randint(-50, 600), y0, rng.randint(700, 1100), y0 - 14, rng.randint(1300, 1980), y0 + rng.uniform(-6, 6))
    # a small caravan on the middle ridge
    cx0, cy0 = 520, 0
    body += caravan(470, 812, 0.9)
    return svg(defs, body)

def caravan(x, y, s):
    # three camels with riders, simple silhouettes
    g = ''
    camel = ('M0 0 C4 -10 10 -18 18 -20 C24 -32 34 -32 38 -22 C44 -30 54 -28 56 -20 C60 -22 64 -26 66 -32 L70 -34 L72 -30 L68 -24 '
             'C66 -16 62 -10 58 -8 L58 10 L55 10 L54 -4 L44 -4 L42 10 L39 10 L38 -4 L24 -4 L22 10 L19 10 L18 -4 L10 -2 L8 10 L5 10 Z')
    for i in range(3):
        g += '<path transform="translate(%.1f %.1f) scale(%.2f)" d="%s" fill="#3A1712"/>' % (x + i * 78 * s, y + i * 6 * s, s, camel)
        g += '<path transform="translate(%.1f %.1f) scale(%.2f)" d="M30 -30 L32 -48 C33 -52 39 -52 40 -48 L42 -30 Z M33 -54 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0" fill="#3A1712"/>' % (x + i * 78 * s, y + i * 6 * s, s)
    return g

# ---------------- 2. Atlas mountains at dawn ----------------
def atlas():
    rng = random.Random(11)
    defs = '''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#6E8FC4"/><stop offset=".4" stop-color="#B9C4DE"/><stop offset=".62" stop-color="#F3CFB4"/><stop offset=".75" stop-color="#FBE3C2"/></linearGradient>
<radialGradient id="sun"><stop offset="0" stop-color="#FFF6E0"/><stop offset=".2" stop-color="#FFE2B0" stop-opacity=".8"/><stop offset="1" stop-color="#FFD09A" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4E8" stop-opacity="0"/><stop offset=".5" stop-color="#FFF4E8" stop-opacity=".55"/><stop offset="1" stop-color="#FFF4E8" stop-opacity="0"/></linearGradient>'''
    body = '<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H)
    body += '<circle cx="520" cy="560" r="520" fill="url(#sun)"/><circle cx="520" cy="560" r="46" fill="#FFF8EA"/>'
    for (cx, cy, rx, ry, op) in [(1300, 260, 380, 22, .5), (1600, 330, 280, 14, .45), (300, 300, 300, 16, .4), (900, 180, 240, 10, .35)]:
        body += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="#FFE9D6" opacity="%.2f" filter="url(#soft)"/>' % (cx, cy, rx, ry, op)
    cols = ['#C3BFD3', '#A9A9C6', '#8C8FB4', '#6B7099', '#4C5279', '#2F3555', '#1C2038']
    bases = [560, 610, 670, 740, 820, 920, 1040]
    amps = [150, 170, 180, 170, 150, 130, 110]
    for i, (c, b, a) in enumerate(zip(cols, bases, amps)):
        body += '<path d="%s" fill="%s"/>' % (ridge(rng, b, a, 0.55), c)
        if i < 5:
            # snow caps on the far peaks
            pass
        body += '<rect x="0" y="%d" width="%d" height="110" fill="url(#mist)" opacity="%.2f"/>' % (b + 20, W, .9 - i * .12)
    # the kasbah stands on a foreground hillside
    hill = [(980, 1210), (1100, 1120), (1250, 1062), (1420, 1040), (1620, 1052), (1800, 1085), (1990, 1110)]
    body += kasbah(1330, 1050, 1.0)
    body += '<path d="%s" fill="#161A2E"/>' % smooth_path(hill)
    # a few olive trees on the slope
    for (tx, ty, s) in [(1150, 1112, 1.0), (1205, 1090, .8), (1720, 1072, .9), (1790, 1085, .7)]:
        body += '<ellipse cx="%d" cy="%d" rx="%.1f" ry="%.1f" fill="#161A2E"/><rect x="%d" y="%d" width="4" height="%d" fill="#161A2E"/>' % (
            tx, ty - 22 * s, 20 * s, 15 * s, tx - 2, ty - 12 * s, int(14 * s))
    # birds
    for (bx, by, s) in [(1080, 380, 1), (1130, 360, .8), (1170, 395, .7), (1010, 410, .6)]:
        body += '<path d="M%d %d q%.1f %.1f %.1f 0 q%.1f %.1f %.1f 0" stroke="#3B3F5E" stroke-width="2.4" fill="none" stroke-linecap="round"/>' % (
            bx, by, 9 * s, -8 * s, 18 * s, 9 * s, -8 * s, 18 * s)
    return svg(defs, body)

def kasbah(x, y, s):
    c = '#1C2038'
    g = '<g transform="translate(%d %d) scale(%.2f)" fill="%s">' % (x, y, s, c)
    # main walls and towers (tapered, crenellated)
    def tower(tx, w, h):
        t = '<path d="M%d 0 L%d %d L%d %d L%d 0 Z"/>' % (tx, tx + 6, -h, tx + w - 6, -h, tx + w)
        for k in range(0, w - 12, 12):
            t += '<rect x="%d" y="%d" width="7" height="12"/>' % (tx + 6 + k, -h - 11)
        return t
    g += '<rect x="-20" y="-60" width="400" height="80"/>'
    g += tower(-40, 70, 150) + tower(300, 76, 170) + tower(120, 60, 110) + tower(200, 52, 95)
    g += '<rect x="-30" y="-20" width="420" height="60"/>'
    # warm lit windows
    for (wx, wy) in [(-20, -110), (330, -120), (140, -80), (215, -70), (60, -40)]:
        g += '<rect x="%d" y="%d" width="8" height="14" fill="#F5C77E" opacity=".85"/>' % (wx, wy)
    g += '</g>'
    return g

# ---------------- 3. Medina at night under the crescent ----------------
def medina():
    rng = random.Random(5)
    defs = '''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#070C24"/><stop offset=".45" stop-color="#14204F"/><stop offset=".72" stop-color="#2D3E7A"/><stop offset=".86" stop-color="#5A4E86"/><stop offset=".95" stop-color="#8E6A8E"/></linearGradient>
<radialGradient id="moonglow"><stop offset="0" stop-color="#FFF3D0" stop-opacity=".5"/><stop offset="1" stop-color="#FFF3D0" stop-opacity="0"/></radialGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#FFC56A" stop-opacity=".8"/><stop offset="1" stop-color="#FFC56A" stop-opacity="0"/></radialGradient>
<mask id="cres"><rect width="1920" height="1200" fill="#000"/><circle cx="1440" cy="250" r="92" fill="#fff"/><circle cx="1478" cy="222" r="84" fill="#000"/></mask>'''
    body = '<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H)
    # stars
    for _ in range(520):
        x, y = rng.uniform(0, W), rng.uniform(0, 820) ** 1.0
        if y > 820 * rng.random() + 200: continue
        r = rng.choice([0.6, 0.8, 1, 1, 1.2, 1.6])
        body += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#FFF8E7" opacity="%.2f"/>' % (x, y, r, rng.uniform(.35, .95))
    for (x, y) in [(300, 140), (760, 90), (1120, 200), (1750, 420), (540, 330), (980, 380)]:
        body += '<circle cx="%d" cy="%d" r="14" fill="#FFF8E7" opacity=".25" filter="url(#haze)"/><circle cx="%d" cy="%d" r="2.4" fill="#FFF8E7"/>' % (x, y, x, y)
    # crescent moon with glow
    body += '<circle cx="1440" cy="250" r="330" fill="url(#moonglow)"/>'
    body += '<rect width="1920" height="1200" fill="#FFF0C8" mask="url(#cres)"/>'
    # horizon glow of the city
    body += '<ellipse cx="960" cy="1000" rx="1300" ry="220" fill="#F0A86A" opacity=".18" filter="url(#softer)"/>'
    # skyline
    sk = '#0A0E22'
    x = -40
    city = ''
    windows = ''
    while x < W + 40:
        w = rng.randint(70, 180)
        top = rng.randint(880, 1000)
        city += '<rect x="%d" y="%d" width="%d" height="%d"/>' % (x, top, w + 2, H - top)
        if rng.random() < .25:
            city += '<path d="M%d %d a%d %d 0 0 1 %d 0 Z"/>' % (x + w * .2, top, w * .3, w * .3, w * .6)
        for _ in range(rng.randint(0, 3)):
            wx, wy = x + rng.randint(10, max(11, w - 20)), top + rng.randint(20, 120)
            windows += '<rect x="%d" y="%d" width="9" height="15" rx="4" fill="#FFCB78" opacity="%.2f"/>' % (wx, wy, rng.uniform(.55, .95))
        x += w
    # the minaret
    mx, mw, mtop = 620, 110, 520
    city += '<rect x="%d" y="%d" width="%d" height="%d"/>' % (mx, mtop, mw, H - mtop)
    for k in range(0, mw, 18):
        city += '<path d="M%d %d l9 -16 l9 16 Z"/>' % (mx + k, mtop)
    city += '<rect x="%d" y="%d" width="%d" height="%d"/>' % (mx + 30, mtop - 90, mw - 60, 90)
    city += '<path d="M%d %d a25 25 0 0 1 50 0 Z"/>' % (mx + 30, mtop - 90)
    city += '<rect x="%d" y="%d" width="4" height="60"/>' % (mx + 53, mtop - 175)
    for (cy, r) in [(mtop - 128, 9), (mtop - 150, 7), (mtop - 168, 5)]:
        city += '<circle cx="%d" cy="%d" r="%d"/>' % (mx + 55, cy, r)
    windows += '<path d="M%d %d v-34 a12 12 0 0 1 24 0 v34 Z" fill="#FFCB78" opacity=".9"/>' % (mx + 43, mtop + 90)
    windows += '<path d="M%d %d v-24 a8 8 0 0 1 16 0 v24 Z" fill="#FFCB78" opacity=".8"/>' % (mx + 47, mtop - 20)
    # hanging lanterns glow in the street
    lamps = ''
    for (lx, ly) in [(330, 1010), (1010, 990), (1380, 1030), (1680, 1000)]:
        lamps += '<circle cx="%d" cy="%d" r="60" fill="url(#lamp)"/><rect x="%d" y="%d" width="10" height="16" rx="3" fill="#FFD48A"/>' % (lx, ly, lx - 5, ly - 8)
    body += '<g fill="%s">%s</g>%s%s' % (sk, city, windows, lamps)
    return svg(defs, body)

# ---------------- 4. Atlantic sunset at Essaouira ----------------
def ocean():
    rng = random.Random(9)
    HZ = 690
    defs = '''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#2E2A63"/><stop offset=".3" stop-color="#7A4479"/><stop offset=".48" stop-color="#D9667A"/><stop offset=".53" stop-color="#F59160"/><stop offset=".575" stop-color="#FFC77E"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C46A78"/><stop offset=".12" stop-color="#7C4A78"/><stop offset=".5" stop-color="#3A3366"/><stop offset="1" stop-color="#15183A"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#FFE3A8" stop-opacity=".9"/><stop offset=".3" stop-color="#FFAE6A" stop-opacity=".5"/><stop offset="1" stop-color="#FF7A5A" stop-opacity="0"/></radialGradient>
<clipPath id="above"><rect width="1920" height="690"/></clipPath>'''
    body = '<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H)
    body += '<circle cx="1180" cy="%d" r="560" fill="url(#glow)"/>' % HZ
    # cloud streaks with pink undersides
    for k in range(12):
        cx = rng.randint(100, 1850); cy = rng.randint(180, 560); rx = rng.randint(160, 420)
        col = rng.choice(['#F7A483', '#F28C8C', '#FFC195', '#E6798F'])
        body += '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="%.2f" filter="url(#soft)"/>' % (cx, cy, rx, rng.randint(7, 16), col, rng.uniform(.35, .65))
    body += '<g clip-path="url(#above)"><circle cx="1180" cy="%d" r="78" fill="#FFF0C8"/></g>' % (HZ + 30)
    body += '<rect y="%d" width="%d" height="%d" fill="url(#sea)"/>' % (HZ, W, H - HZ)
    # sun path on the water
    for k in range(70):
        y = HZ + 4 + k * k * 0.1 + rng.uniform(0, 4)
        if y > H: break
        w = 60 + k * 4.5 + rng.uniform(-20, 20)
        body += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" fill="#FFD9A0" opacity="%.2f"/>' % (
            1180 - w / 2 + rng.uniform(-30, 30), y, w * rng.uniform(.3, .9), 2 + k * .06, max(.08, .85 - k * .012))
    # wave glints
    for _ in range(260):
        y = HZ + 10 + rng.random() ** 2 * (H - HZ)
        w = 6 + (y - HZ) * .08 * rng.uniform(.5, 1.6)
        body += '<rect x="%.1f" y="%.1f" width="%.1f" height="1.6" fill="#F6B4A0" opacity="%.2f"/>' % (rng.uniform(0, W), y, w, rng.uniform(.12, .4))
    # the Skala ramparts with cannons, left
    r = '#14102A'
    g = '<g fill="%s">' % r
    g += '<path d="M-20 %d L520 %d L560 %d L560 %d L-20 %d Z"/>' % (HZ + 120, HZ + 120, HZ + 160, H, H)
    g += '<rect x="-20" y="%d" width="540" height="40"/>' % (HZ + 80)
    for k in range(-20, 520, 34):
        g += '<rect x="%d" y="%d" width="20" height="24"/>' % (k, HZ + 58)
    # watchtower
    g += '<path d="M330 %d L346 %d L414 %d L430 %d Z"/>' % (HZ + 82, HZ - 110, HZ - 110, HZ + 82)
    for k in range(338, 420, 20):
        g += '<rect x="%d" y="%d" width="12" height="18"/>' % (k, HZ - 128)
    g += '<rect x="372" y="%d" width="14" height="26" rx="7" fill="#F2B36E" opacity=".9"/>' % (HZ - 70)
    # cannons
    for k in [60, 170, 250]:
        g += '<rect x="%d" y="%d" width="54" height="10" rx="5" transform="rotate(-8 %d %d)"/>' % (k, HZ + 66, k, HZ + 66)
    g += '</g>'
    body += g
    # seagulls
    for (bx, by, s) in [(760, 420, 1.2), (820, 450, .9), (690, 470, .8), (1500, 330, .7), (1550, 350, .6)]:
        body += '<path d="M%d %d q%.1f %.1f %.1f 2 q%.1f %.1f %.1f -2" stroke="#2A1F3E" stroke-width="2.6" fill="none" stroke-linecap="round"/>' % (
            bx, by, 10 * s, -10 * s, 20 * s, 10 * s, -10 * s, 20 * s)
    return svg(defs, body)

SCENES = [('photo-1', dunes), ('photo-2', atlas), ('photo-3', medina), ('photo-4', ocean)]
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': W, 'height': H})
    for name, fn in SCENES:
        pg.set_content('<html><body style="margin:0">' + fn() + '</body></html>')
        pg.wait_for_timeout(300)
        png = os.path.join(OUT, name + '.png')
        pg.screenshot(path=png)
        Image.open(png).convert('RGB').save(os.path.join(OUT, name + '.jpg'), quality=88, optimize=True, progressive=True)
        print(name, os.path.getsize(os.path.join(OUT, name + '.jpg')) // 1024, 'KB')
    b.close()
