"""Builds simulated PHOTOGRAPHS of real document pages for the restoration tests.
The pages come from a real Word document rendered by LibreOffice. A red stamp and a blue handwritten signature are added to the
page, then the page is 'photographed': placed on a table in perspective, rotated, lit unevenly with a shadow, yellowed, blurred,
given sensor noise and JPEG compression. The true page corners are saved so detection can be measured.
These are simulations, not pictures from a real camera.   Run: python3 tools/make_photo_fixtures.py"""
import os, json, subprocess, shutil, tempfile, random
import numpy as np, cv2, docx
from docx.shared import Pt, Cm
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "test", "resources", "photos")
GT = os.environ.get("GT_DIR")      # optional: also write the clean ground-truth pages here
os.makedirs(OUT, exist_ok=True)
tmp = tempfile.mkdtemp()
d = docx.Document()
for s in d.sections: s.left_margin = s.right_margin = Cm(2.2); s.top_margin = Cm(2); s.bottom_margin = Cm(2)
d.styles['Normal'].font.size = Pt(11); d.styles['Normal'].font.name = 'Liberation Serif'
d.add_heading("Hilma Trading cc", 0); d.add_paragraph("Quotation 2026/0417 for Mr Johannes Shikongo, Erf 1182, Ongwediva. Valid until 31 December 2026. Prices include VAT at 15 percent.")
for i in range(1, 6): d.add_paragraph(f"Clause {i}. The supplier delivers the goods listed in the schedule within {10+i} working days of receiving payment of N$ {i*1250}.50. Late delivery gives the buyer the right to cancel the order and to receive a full refund within 7 days.")
t = d.add_table(rows=5, cols=4); t.style = 'Table Grid'
for r, row in enumerate([["Item", "Qty", "Unit price", "Total"], ["Maize meal 10kg", "30", "120.50", "3,615.00"], ["Cooking oil 2L", "12", "75.25", "903.00"], ["Sugar 2.5kg", "40", "48.25", "1,930.00"], ["Total", "", "", "6,448.00"]]):
    for c, v in enumerate(row): t.cell(r, c).text = v
d.add_page_break(); d.add_heading("Terms and conditions", 1)
for i in range(1, 12): d.add_paragraph(f"{i}. Ownership of the goods passes to the buyer only after full payment. The buyer must inspect the goods on delivery and report any damage in writing within 48 hours. Account number 0012 7788 {i:02d}, branch code 282 172.")
d.add_page_break(); d.add_heading("Acceptance", 1); d.add_paragraph("I accept this quotation and the terms above.")
d.add_paragraph("Signed: ______________________      Date: 15 March 2026")
d.save(os.path.join(tmp, "quote.docx"))
subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, os.path.join(tmp, "quote.docx")], check=True, capture_output=True)
subprocess.run(["pdftoppm", "-r", "170", "-png", os.path.join(tmp, "quote.pdf"), os.path.join(tmp, "pg")], check=True)
pages = sorted(f for f in os.listdir(tmp) if f.startswith("pg") and f.endswith(".png"))
print(len(pages), "real pages rendered")

def stamp(img, cx, cy, r, text):
    red = (40, 30, 200)
    cv2.circle(img, (cx, cy), r, red, 5); cv2.circle(img, (cx, cy), r - 14, red, 2)
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, 1.1, 3)
    cv2.putText(img, text, (cx - tw // 2, cy + th // 2), cv2.FONT_HERSHEY_DUPLEX, 1.1, red, 3, cv2.LINE_AA)
def signature(img, x, y, scale=1.0):
    blue = (160, 60, 20); rng = np.random.RandomState(3); pts = []
    t = np.linspace(0, 1, 90)
    xs = x + (t * 330 * scale) + 30 * np.sin(t * 17) * scale; ys = y + 18 * np.sin(t * 9 + 1) * scale - 55 * np.exp(-((t - 0.2) / 0.08) ** 2) * scale + 30 * np.exp(-((t - 0.6) / 0.07) ** 2) * scale
    cv2.polylines(img, [np.stack([xs, ys], 1).astype(np.int32)], False, blue, 3, cv2.LINE_AA)
    cv2.polylines(img, [np.stack([xs[::-1], ys[::-1] + 14 * scale], 1).astype(np.int32)[:60]], False, blue, 2, cv2.LINE_AA)

gtpages = []
for i, f in enumerate(pages):
    im = cv2.imread(os.path.join(tmp, f)); h, w = im.shape[:2]
    if i == 0: stamp(im, int(w * 0.76), int(h * 0.80), 95, "APPROVED")
    if i == 2: signature(im, int(w * 0.24), int(h * 0.275)); stamp(im, int(w * 0.72), int(h * 0.22), 90, "PAID")
    gtpages.append(im)
    if GT: cv2.imwrite(os.path.join(GT, f"gt{i+1}.png"), im)

def photograph(page, seed, corner_jit, angle, tilt, light, shadow, tint, blur, noise, q, bg, table=True, name="x"):
    rng = np.random.RandomState(seed); ph, pw = page.shape[:2]
    W, H = 1800, 2400
    if table:
        base = np.zeros((H, W, 3), np.float32); base[:] = bg
        base *= (1 + 0.10 * cv2.GaussianBlur(rng.randn(H, W).astype(np.float32), (0, 0), 6))[..., None]
        canvas = base
        m = 0.13; dst = np.float32([[W * m, H * m * 0.9], [W * (1 - m), H * m * 0.9], [W * (1 - m), H * (1 - m * 0.9)], [W * m, H * (1 - m * 0.9)]])
        dst += rng.uniform(-corner_jit, corner_jit, (4, 2)).astype(np.float32) * [W, H]
        dst[2, 0] += tilt * W; dst[3, 0] -= tilt * W * 0.3; dst[0, 0] += tilt * W * 0.2
        c = dst.mean(0); R = cv2.getRotationMatrix2D(tuple(c), angle, 1.0); dst = (np.hstack([dst, np.ones((4, 1), np.float32)]) @ R.T).astype(np.float32)
        M = cv2.getPerspectiveTransform(np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]]), dst)
        warped = cv2.warpPerspective(page.astype(np.float32), M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_TRANSPARENT)
        mask = cv2.warpPerspective(np.ones((ph, pw), np.float32), M, (W, H), flags=cv2.INTER_LINEAR); mask = cv2.GaussianBlur(mask, (0, 0), 1.2)[..., None]
        # soft contact shadow of the paper on the table
        sh = cv2.GaussianBlur(mask, (0, 0), 14)[..., None] if mask.ndim == 2 else cv2.GaussianBlur(mask[..., 0], (0, 0), 14)[..., None]
        canvas = canvas * (1 - 0.35 * np.roll(sh, 14, axis=0)) 
        img = canvas * (1 - mask) + warped * mask; corners = dst / [W, H]
    else:     # flat bed style: the picture is the page, slightly rotated, grey cast
        R = cv2.getRotationMatrix2D((pw / 2, ph / 2), angle, 1.0); img = cv2.warpAffine(page.astype(np.float32), R, (pw, ph), borderValue=(235, 235, 235))
        img = cv2.resize(img, (1500, int(1500 * ph / pw))); H, W = img.shape[:2]; corners = np.float32([[0, 0], [1, 0], [1, 1], [0, 1]])
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); xx /= W; yy /= H
    lightmap = 1 - light * (0.55 * xx + 0.25 * yy) - 0.18 * ((xx - 0.5) ** 2 + (yy - 0.5) ** 2) * 3
    if shadow: lightmap *= 1 - shadow * np.clip(1 - np.abs((xx * 0.8 + yy) - 0.95) / 0.22, 0, 1) ** 1.5
    img = img * lightmap[..., None] * np.float32(tint)
    if blur: img = cv2.GaussianBlur(img, (0, 0), blur)
    img = img + rng.randn(*img.shape).astype(np.float32) * noise
    img = np.clip(img, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, name + ".jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return corners.tolist()

truth = {}
wood = (60, 90, 130); desk = (90, 100, 110); light_table = (215, 220, 225)
truth["photo1"] = photograph(gtpages[0], 1, 0.015, -4.0, 0.03, 0.18, 0.0, (0.86, 0.93, 0.98), 1.0, 5, 78, wood, name="photo1")
truth["photo2"] = photograph(gtpages[1], 2, 0.02, 5.5, -0.04, 0.35, 0.45, (0.70, 0.86, 0.96), 1.6, 8, 70, desk, name="photo2")
truth["photo3"] = photograph(gtpages[2], 3, 0.012, 2.5, 0.02, 0.25, 0.25, (0.80, 0.90, 0.97), 1.2, 6, 75, light_table, name="photo3")
truth["scan4"] = photograph(gtpages[0], 4, 0, 1.6, 0, 0.12, 0.0, (0.90, 0.92, 0.93), 0.8, 4, 80, wood, table=False, name="scan4")
json.dump(truth, open(os.path.join(OUT, "corners.json"), "w"))
shutil.rmtree(tmp)
print({k: os.path.getsize(os.path.join(OUT, k + ".jpg")) // 1000 for k in truth}, "KB")
