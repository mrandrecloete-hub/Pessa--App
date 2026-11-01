import numpy as np, cv2, os
from PIL import Image, ImageFilter
src = Image.open("icon/nocrown2.png").convert("RGB")
crop = src.crop((52, 120, 1202, 832))          # inside the frame, above the lettering
cw, ch = crop.size
# Elliptical feathered alpha so the camera and its glow fade out smoothly (no hard crop edges).
yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
nx = (xx - cw/2) / (cw/2); ny = (yy - ch/2) / (ch/2)
d = np.sqrt(nx**2 * 0.92 + ny**2 * 0.9)
alpha = np.clip((1.0 - d) / 0.22, 0, 1)
alpha = alpha**1.3
# Keep the camera itself fully opaque: bright or saturated pixels (body, gold, lens) get full alpha near the centre.
arr = np.asarray(crop).astype(np.float32)
lum = arr.mean(-1)
alpha = np.clip(np.maximum(alpha, np.clip((lum - 25) / 60, 0, 1) * np.clip((1.05 - d) / 0.25, 0, 1)), 0, 1)
fg = np.dstack([arr, alpha * 255]).astype(np.uint8)
fgimg = Image.fromarray(fg, "RGBA")

def canvas(size, frac):
    """Camera emblem scaled to frac of the canvas width, centred, on transparency."""
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    w = int(size * frac); h = int(w * ch / cw)
    e = fgimg.resize((w, h), Image.LANCZOS)
    c.alpha_composite(e, ((size - w) // 2, (size - h) // 2))
    return c

def background(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    r = np.sqrt((xx - 0.5)**2 + (yy - 0.45)**2)
    glow = np.clip(1 - r / 0.6, 0, 1)**1.8
    rgb = np.dstack([4 + 10*glow, 6 + 40*glow, 12 + 120*glow])
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

res = "/home/user/Pessa--App/android-camera-studio/app/src/main/res"
dens = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for k, s in dens.items():
    os.makedirs(f"{res}/mipmap-{k}", exist_ok=True)
    fgc = canvas(s, 0.76)          # inside the adaptive icon safe zone
    fgc.save(f"{res}/mipmap-{k}/ic_launcher_foreground.png")
    background(s).save(f"{res}/mipmap-{k}/ic_launcher_background.png")
    a = np.asarray(fgc)[..., 3].astype(np.float32)
    l = np.asarray(fgc)[..., :3].astype(np.float32).mean(-1)
    mono = np.zeros((s, s, 4), np.uint8); mono[..., :3] = 255
    mono[..., 3] = np.clip(a * np.clip((l - 20) / 120, 0.35, 1), 0, 255).astype(np.uint8)
    Image.fromarray(mono, "RGBA").save(f"{res}/mipmap-{k}/ic_launcher_monochrome.png")
os.makedirs(f"{res}/drawable-nodpi", exist_ok=True)
canvas(720, 0.98).save(f"{res}/drawable-nodpi/blazecam_logo.png")        # startup logo
full = background(512); full.alpha_composite(canvas(512, 0.86)); full.convert("RGB").save("/home/user/Pessa--App/android-camera-studio/docs/blazecam-icon-512.png")
# preview: square, circle and squircle masks like launchers use
prev = Image.new("RGB", (1100, 380), (30, 30, 30))
big = background(324); big.alpha_composite(canvas(324, 0.70))
for i, shape in enumerate(["square", "circle", "rounded"]):
    m = Image.new("L", (324, 324), 0)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(m)
    if shape == "square": dr.rectangle((0, 0, 323, 323), fill=255)
    elif shape == "circle": dr.ellipse((0, 0, 323, 323), fill=255)
    else: dr.rounded_rectangle((0, 0, 323, 323), 80, fill=255)
    prev.paste(big.convert("RGB"), (20 + i * 360, 28), m)
prev.save("icon/preview.png")
print("ok")
