"""Synthetic landscapes and app icons. No photographs or EXIF/GPS metadata."""
from PIL import Image, ImageDraw
from pathlib import Path
import random, math
root = Path(__file__).resolve().parent
palettes = [((182,206,205),(237,225,194),(64,113,117)),((189,207,199),(218,224,205),(93,118,92)),((208,181,166),(240,212,165),(123,118,112)),((182,199,171),(221,225,193),(76,104,75)),((185,196,205),(227,228,215),(93,111,120)),((201,210,178),(241,225,175),(101,127,78))]
for n, (sky, glow, dark) in enumerate(palettes):
    random.seed(n)
    im = Image.new('RGB',(720,960))
    pixels = im.load()
    for y in range(960):
        t = min(y/600,1)
        color = tuple(int(a*(1-t)+b*t) for a,b in zip(sky,glow))
        for x in range(720):
            grain = random.randrange(-3,4)
            pixels[x,y] = tuple(max(0,min(255,c+grain)) for c in color)
    d = ImageDraw.Draw(im)
    d.ellipse((430,135,543,248),fill=tuple(min(255,c+13) for c in glow))
    for layer in range(3):
        color = tuple(int(a*(1-layer*.21)+b*(layer*.21)) for a,b in zip(tuple(min(255,c+55) for c in dark),dark))
        top = 490+layer*135
        points=[(0,960),(0,top)]+[(x,int(top+75*math.sin(x/160+n+layer)+27*math.sin(x/65+layer))) for x in range(0,721,8)]+[(720,960)]
        d.polygon(points,fill=color)
    if n in (0,2):
        for y in range(780,950,15):
            start=random.randint(0,200)
            d.line((start,y,start+random.randint(100,400),y),fill=tuple(min(255,c+22) for c in dark),width=2)
    im.save(root/f'landscape-{n}.png',optimize=True)
icons = root.parents[1]/'apps'/'web'/'public'/'icons'
icons.mkdir(parents=True,exist_ok=True)
for size, name in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
    im=Image.new('RGB',(size,size),'#e7ebdf');d=ImageDraw.Draw(im)
    s=size/512
    box=lambda coords:tuple(int(c*s) for c in coords)
    d.rounded_rectangle(box((100,163,413,359)),radius=int(35*s),outline='#3b6556',width=int(16*s))
    d.rounded_rectangle(box((157,132,262,176)),radius=int(10*s),fill='#3b6556')
    d.ellipse(box((196,198,314,316)),outline='#3b6556',width=int(15*s))
    d.ellipse(box((349,199,370,220)),fill='#3b6556')
    d.ellipse(box((383,104,423,144)),fill='#b69b69')
    im.save(icons/name,optimize=True)
