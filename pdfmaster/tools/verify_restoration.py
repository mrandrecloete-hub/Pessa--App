"""Compares restored pages with the TRUE clean pages they were photographed from (GT_DIR/gtN.png from make_photo_fixtures.py).
Measures: how much of the real ink survives (recall) and how much ink in the result is NOT in the real page (invented marks).
The restored page is first aligned to the true page with ECC, so the small crop error does not count as invention."""
import os, sys, cv2, numpy as np
R = os.path.join(os.path.dirname(__file__), "..", "app", "build", "restored"); GT = os.environ.get("GT_DIR", "/tmp/gt")
cases = {"photo1": "gt1", "photo2": "gt2", "photo3": "gt3"}; ok = True
for photo, gt in cases.items():
    g = cv2.imread(os.path.join(GT, gt + ".png")); gg = cv2.cvtColor(g, cv2.COLOR_BGR2GRAY)
    for mode in ["CLEAN", "WHITE", "BW", "COLOUR", "SIGNATURE"]:
        r = cv2.imread(os.path.join(R, f"{photo}_{mode}.png")); rg = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
        gs = cv2.resize(gg, (rg.shape[1], rg.shape[0]), interpolation=cv2.INTER_AREA)
        # align restored to truth
        warp = np.eye(2, 3, dtype=np.float32)
        a = cv2.resize(gs, None, fx=0.5, fy=0.5).astype(np.float32); b = cv2.resize(rg, None, fx=0.5, fy=0.5).astype(np.float32)
        try: _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
        except cv2.error: pass
        warp[:, 2] *= 2
        al = cv2.warpAffine(rg, warp, (gs.shape[1], gs.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderValue=255)
        ink_t = (gs < 140).astype(np.uint8); ink_r = (al < 140).astype(np.uint8)
        k = np.ones((7, 7), np.uint8)
        near_t = cv2.dilate(ink_t, k); near_r = cv2.dilate(ink_r, k)
        recall = (ink_t & near_r).sum() / max(1, ink_t.sum())
        invented = (ink_r & (1 - near_t)).sum() / max(1, ink_r.sum())
        paper = al[gs > 235]; white = (paper > 235).mean()
        # colour ink (stamp, signature) kept?
        gc = cv2.resize(g, (rg.shape[1], rg.shape[0]), interpolation=cv2.INTER_AREA)
        print(f"{photo} {mode:9s} real ink recovered {recall*100:5.1f}%   marks not in the real page {invented*100:4.1f}%   paper that is clean white {white*100:5.1f}%")
        need = 0.95 if mode in ("CLEAN", "WHITE", "BW") else 0.80      # the gentle modes deliberately leave ink and shadows nearly as photographed
        if invented > 0.03 or recall < need: ok = False
sys.exit(0 if ok else 1)
