"""Builds the sample documents used by the unit tests. They are made with widely used Python libraries
(python-docx, openpyxl, python-pptx, reportlab) so the tests read files that PDFMASTER did not write itself.
Run:  python3 tools/make_fixtures.py   (needs: pip install python-docx openpyxl python-pptx reportlab pillow)"""
import io, os, datetime
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "test", "resources", "fixtures")
os.makedirs(OUT, exist_ok=True)

def picture(w=600, h=300, text="CHART"):
    im = Image.new("RGB", (w, h), (37, 99, 235)); d = ImageDraw.Draw(im)
    for i in range(0, w, 40): d.rectangle([i, h - (i % 200) - 20, i + 25, h], fill=(34, 211, 238))
    d.text((20, 20), text, fill="white")
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()

# ---- Word ----
import docx
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
d = docx.Document()
d.add_heading("Quarterly Sales Report", 0)
d.add_heading("Summary", 1)
p = d.add_paragraph("Total sales grew by "); r = p.add_run("18 percent"); r.bold = True
p.add_run(" compared with the previous quarter, "); r = p.add_run("mainly in Windhoek"); r.italic = True; p.add_run(".")
p = d.add_paragraph("Centred closing remark"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
d.add_paragraph("First bullet point", style="List Bullet"); d.add_paragraph("Second bullet point", style="List Bullet")
t = d.add_table(rows=3, cols=3)
for r_, row in enumerate([["Branch", "Units", "Revenue"], ["Windhoek", "1200", "N$ 240,000.00"], ["Oshakati", "800", "N$ 152,500.50"]]):
    for c_, v in enumerate(row): t.cell(r_, c_).text = v
d.add_picture(io.BytesIO(picture()), width=Pt(300))
d.add_page_break()
d.add_heading("Appendix", 1)
d.add_paragraph("Unicode check: Ünïcödé čšž Ελληνικά Кириллица.")
d.add_paragraph("Long paragraph. " + "This sentence is repeated to force wrapping across several lines of the page. " * 12)
d.save(os.path.join(OUT, "report.docx"))

# ---- Excel ----
import openpyxl
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Stock"
ws.append(["Item", "Qty", "Unit price", "Received"])
ws.append(["Maize meal 10kg", 30, 120.5, datetime.date(2026, 3, 14)])
ws.append(["Cooking oil 2L", 12, 75.25, datetime.date(2026, 4, 2)])
ws.append(["Total", "=SUM(B2:B3)", None, None])
ws2 = wb.create_sheet("Notes"); ws2["A1"] = "Checked by"; ws2["B1"] = "Maria"; ws2["A3"] = True
wb.save(os.path.join(OUT, "stock.xlsx"))

# ---- PowerPoint ----
from pptx import Presentation
from pptx.util import Inches
pr = Presentation()
s = pr.slides.add_slide(pr.slide_layouts[0]); s.shapes.title.text = "Pitch Deck"; s.placeholders[1].text = "Investor update 2026"
s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = "Highlights"
tf = s.placeholders[1].text_frame; tf.text = "Revenue up 18 percent"; tf.add_paragraph().text = "Two new branches"
s = pr.slides.add_slide(pr.slide_layouts[5]); s.shapes.title.text = "Chart"
s.shapes.add_picture(io.BytesIO(picture(text="SLIDE")), Inches(1), Inches(2), width=Inches(5))
pr.save(os.path.join(OUT, "deck.pptx"))

# ---- PDF made by another library: fonts, a table, a picture, mixed page sizes ----
from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
st = getSampleStyleSheet()
doc = SimpleDocTemplate(os.path.join(OUT, "report.pdf"), pagesize=A4, title="Annual Report", author="Fixture Maker")
flow = [Paragraph("Annual Report 2026", st["Title"]), Paragraph("Executive summary", st["Heading2"]),
        Paragraph("The company opened two branches and <b>increased revenue</b> to N$ 4,250,000.75 by 31 December 2026. "
                  "This paragraph is long enough to wrap over more than one line so that paragraph joining can be tested properly.", st["BodyText"]),
        Spacer(1, 12),
        Table([["Branch", "Units", "Revenue"], ["Windhoek", "1200", "240,000.00"], ["Oshakati", "800", "152,500.50"], ["Walvis Bay", "640", "98,310.00"]],
              style=TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]), colWidths=[160, 80, 120]),
        Spacer(1, 12), RLImage(io.BytesIO(picture(900, 450)), width=360, height=180), PageBreak(),
        Paragraph("Second page", st["Heading1"]), Paragraph("Signed by the directors on 15 January 2027. Contact info@example.com.", st["BodyText"])]
doc.build(flow)

# ---- A PDF with a fillable form ----
from reportlab.pdfgen import canvas
c = canvas.Canvas(os.path.join(OUT, "form.pdf"), pagesize=A4)
c.setFont("Helvetica", 12); c.drawString(60, 780, "Application form")
c.drawString(60, 740, "Full name"); c.acroForm.textfield(name="fullName", x=160, y=728, width=300, height=24, borderStyle="inset")
c.drawString(60, 700, "Email"); c.acroForm.textfield(name="email", x=160, y=688, width=300, height=24)
c.drawString(60, 660, "I agree"); c.acroForm.checkbox(name="agree", x=160, y=652, size=18, buttonStyle="check")
c.drawString(60, 620, "Plan"); c.acroForm.choice(name="plan", x=160, y=608, width=160, height=24, options=["Basic", "Standard", "Premium"], value="Basic")
c.drawString(60, 580, "Contact by"); c.acroForm.radio(name="contact", value="phone", x=160, y=572, size=16, selected=False); c.drawString(182, 576, "Phone")
c.acroForm.radio(name="contact", value="email", x=250, y=572, size=16, selected=False); c.drawString(272, 576, "Email")
c.save()

open(os.path.join(OUT, "page.html"), "w", encoding="utf-8").write("""<!DOCTYPE html><html><head><title>t</title><style>p{color:red}</style><script>var x='<p>not text</p>';</script></head>
<body><h1>Web Page Title</h1><p>First <b>bold</b> and <i>italic</i> &amp; an entity &eacute;&#233;&#x20AC;.</p>
<ul><li>Apple</li><li>Banana</li></ul><ol><li>One</li><li>Two</li></ol>
<table><tr><th>Name</th><th>Age</th></tr><tr><td>Anna</td><td>31</td></tr></table><p style="text-align:center">Centred line</p></body></html>""")
open(os.path.join(OUT, "letter.rtf"), "w", encoding="ascii").write(
    r"{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}{\info{\title Hidden title}}\f0\fs24 Dear {\b Maria},\par "
    r"Thank you for your {\i order} of 3 caf\'e9 tables " + chr(92) + r"u8212? delivered {\ul today}.\par\page {\fs40 Second page heading}\par}")
print("fixtures written to", os.path.abspath(OUT))
