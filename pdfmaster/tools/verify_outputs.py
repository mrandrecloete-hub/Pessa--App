"""Opens the files PDFMASTER's engine produced in the unit tests with independent software, to prove they are
valid Office, TIFF and PDF files. Run after `./gradlew :app:testDebugUnitTest`:  python3 tools/verify_outputs.py"""
import os, sys
D = os.path.join(os.path.dirname(__file__), "..", "app", "build", "converted")
ok = True
def check(name, fn):
    global ok
    try: print("PASS", name, "-", fn())
    except Exception as e: ok = False; print("FAIL", name, "-", repr(e))

import docx, openpyxl, pptx, pypdf
from PIL import Image

def word():
    d = docx.Document(os.path.join(D, "report.docx")); text = "\n".join(p.text for p in d.paragraphs)
    assert "Annual Report 2026" in text and "Second page" in text
    t = d.tables[0]; assert [c.text for c in t.rows[0].cells] == ["Branch", "Units", "Revenue"], [c.text for c in t.rows[0].cells]
    return f"python-docx: {len(d.paragraphs)} paragraphs, {len(d.tables)} table(s)"
def word_exact():
    d = docx.Document(os.path.join(D, "report-exact.docx")); assert len(d.inline_shapes) == 2
    return "python-docx: 2 page pictures"
def excel():
    wb = openpyxl.load_workbook(os.path.join(D, "table.xlsx")); ws = wb.worksheets[0]
    rows = [[c.value for c in r] for r in ws.iter_rows()]
    assert rows[0] == ["Item", "Qty", "Price", "Total"], rows[0]
    assert rows[1][0] == "Maize meal 10kg" and rows[1][1] == 3 and rows[1][3] == 360, rows[1]
    assert sum(r[3] for r in rows[1:]) == 993.5
    return f"openpyxl: {len(rows)} rows, numbers are numeric (total column sums to 993.5)"
def powerpoint():
    p = pptx.Presentation(os.path.join(D, "report.pptx")); assert len(p.slides) == 2
    assert all(any(s.shape_type == 13 for s in sl.shapes) for sl in p.slides)
    return f"python-pptx: {len(p.slides)} slides, each with a picture, slide {p.slide_width}x{p.slide_height} EMU"
def tiff():
    im = Image.open(os.path.join(D, "report.tiff")); n = getattr(im, "n_frames", 1); assert n == 2 and im.mode == "RGB"
    im.seek(1); im.load(); return f"Pillow: {n} pages, {im.size[0]}x{im.size[1]} RGB, dpi {im.info.get('dpi')}"
def pdfs():
    out = []
    for f in sorted(os.listdir(D)):
        if f.endswith(".pdf"):
            r = pypdf.PdfReader(os.path.join(D, f)); r.pages[0].extract_text(); out.append(f"{f}:{len(r.pages)}p")
    return "pypdf opened " + ", ".join(out)
def form():
    r = pypdf.PdfReader(os.path.join(D, "form-filled.pdf")); f = r.get_fields()
    assert f["fullName"]["/V"] == "Maria Shikongo" and f["plan"]["/V"] == "Premium" and f["agree"]["/V"] != "/Off", {k: v.get("/V") for k, v in f.items()}
    r2 = pypdf.PdfReader(os.path.join(D, "static-filled.pdf")); f2 = r2.get_fields(); assert f2["Customer"]["/V"] == "Hilma N." and f2["Paid"]["/V"] == "/Yes"
    assert not pypdf.PdfReader(os.path.join(D, "form-flat.pdf")).get_fields()
    return "pypdf reads the filled values; added fields work; flattened form has no fields"
def searchable():
    t = pypdf.PdfReader(os.path.join(D, "searchable.pdf")).pages[0].extract_text(); assert "RECEIPT No 4471" in t
    return "pypdf finds the OCR text layer"
for n, f in [("PDF to Word (editable)", word), ("PDF to Word (exact)", word_exact), ("PDF to Excel", excel), ("PDF to PowerPoint", powerpoint),
             ("PDF to TIFF", tiff), ("All produced PDFs", pdfs), ("Form filling", form), ("Searchable PDF", searchable)]: check(n, f)
sys.exit(0 if ok else 1)
