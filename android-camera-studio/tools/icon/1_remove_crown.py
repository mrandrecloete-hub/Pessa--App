import numpy as np, cv2
img = cv2.cvtColor(cv2.imread("icon/src.png"), cv2.COLOR_BGR2RGB).astype(np.float32)
H,W,_ = img.shape
poly = np.array([(345,98),(395,30),(585,0),(670,0),(865,30),(912,98),(878,205),(848,272),(838,296),(412,296),(402,272),(372,205)], np.int32)
m = np.zeros((H,W), np.uint8); cv2.fillPoly(m, [poly], 1); m = cv2.dilate(m, np.ones((5,5),np.uint8))
out = img.copy()
cx, cy, R = 626.0, 520.0, 286.0
ys, xs = np.where(m > 0)
def sample(x, y):
    x = np.clip(x, 0, W-1); y = np.clip(y, 0, H-1)
    return cv2.getRectSubPix(img, (1,1), (float(x), float(y)))[0,0]
ring = 0
for y, x in zip(ys, xs):
    d = np.hypot(x-cx, y-cy)
    if d <= R + 4:
        a = np.arctan2(y-cy, x-cx); acc = []
        for s in (+1, -1):
            for D in (np.radians(44), np.radians(52)):
                b = a + s*D; px, py = cx + d*np.cos(b), cy + d*np.sin(b)
                if not m[int(py), int(px)]: acc.append(sample(px, py))
        if acc: out[y, x] = np.mean(acc, 0); ring += 1; continue
    # background / top plate: blend the nearest unmasked pixels left and right on this row
    row = m[y]; l = x
    while l > 0 and row[l]: l -= 1
    r = x
    while r < W-1 and row[r]: r += 1
    t = (x - l) / max(1, r - l)
    a = img[y, max(l-2,0)]; c = img[y, min(r+2,W-1)]
    gold = lambda p: p[0] > p[2] + 50 and p[1] > p[2] + 20
    if gold(c) and not gold(a): c = a
    elif gold(a) and not gold(c): a = c
    out[y, x] = a * (1-t) + c * t
print("ring pixels rebuilt", ring)
# smooth the rebuilt background (not the ring) to remove row streaks
bgmask = m.copy()
yy, xx = np.mgrid[0:H, 0:W]
bgmask[np.hypot(xx-cx, yy-cy) <= R + 6] = 0
sm = cv2.GaussianBlur(out, (0,0), 6)
bgw = cv2.GaussianBlur(bgmask.astype(np.float32), (0,0), 2)[...,None]
out = out*(1-bgw) + sm*bgw
# soften seams inside the mask only
blur = cv2.GaussianBlur(out, (0,0), 2.0)
edge = cv2.GaussianBlur(m.astype(np.float32), (0,0), 3) * (1 - cv2.erode(m, np.ones((9,9),np.uint8)))
out = out*(1-edge[...,None]) + blur*edge[...,None]
cv2.imwrite("icon/nocrown2.png", cv2.cvtColor(np.clip(out,0,255).astype(np.uint8), cv2.COLOR_RGB2BGR))
cv2.imwrite("icon/nocrown2_zone.png", cv2.cvtColor(np.clip(out[60:460, 250:1010],0,255).astype(np.uint8), cv2.COLOR_RGB2BGR))
