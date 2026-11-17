package com.pdfmaster.app.engine

import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDColor
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDDeviceRGB
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAppearanceCharacteristicsDictionary
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDAcroForm
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDCheckBox
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDChoice
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDPushButton
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDRadioButton
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDSignatureField
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDTerminalField
import com.tom_roush.pdfbox.pdmodel.interactive.form.PDTextField
import java.io.File

enum class FieldKind { TEXT, MULTILINE, CHECKBOX, RADIO, CHOICE, SIGNATURE, OTHER }

data class FormField(
    val name: String, val label: String, val kind: FieldKind, val value: String,
    val options: List<String> = emptyList(), val required: Boolean = false, val readOnly: Boolean = false, val page: Int? = null, val maxLength: Int? = null
)

/** A new form field to add to a page. Rectangle in displayed page points from the top left. */
data class NewField(val page: Int, val kind: FieldKind, val name: String, val x: Float, val y: Float, val w: Float, val h: Float)

object PdfForms {

    fun read(input: File, password: String? = null): List<FormField> = openPdf(input, password).use { doc ->
        val form = doc.documentCatalog.acroForm ?: return@use emptyList()
        val pageIndex = HashMap<Any, Int>()
        doc.pages.forEachIndexed { i, p -> runCatching { p.annotations.forEach { a -> pageIndex[a.cosObject] = i } } }
        form.fieldTree.filterIsInstance<PDTerminalField>().mapNotNull { f ->
            val name = f.fullyQualifiedName ?: return@mapNotNull null
            val label = f.alternateFieldName?.takeIf { it.isNotBlank() } ?: f.partialName ?: name
            val page = f.widgets.firstNotNullOfOrNull { pageIndex[it.cosObject] }
            when (f) {
                is PDTextField -> FormField(name, label, if (f.isMultiline) FieldKind.MULTILINE else FieldKind.TEXT, f.value.orEmpty(),
                    required = f.isRequired, readOnly = f.isReadOnly, page = page, maxLength = f.maxLen.takeIf { it > 0 })
                is PDCheckBox -> FormField(name, label, FieldKind.CHECKBOX, if (f.isChecked) "true" else "false", required = f.isRequired, readOnly = f.isReadOnly, page = page)
                is PDRadioButton -> FormField(name, label, FieldKind.RADIO, f.value.orEmpty().let { if (it == "Off") "" else it }, f.onValues.toList().sorted(), f.isRequired, f.isReadOnly, page)
                is PDChoice -> FormField(name, label, FieldKind.CHOICE, f.value.firstOrNull().orEmpty(),
                    (f.optionsExportValues.takeIf { it.isNotEmpty() } ?: f.options).toList(), f.isRequired, f.isReadOnly, page)
                is PDSignatureField -> FormField(name, label, FieldKind.SIGNATURE, "", readOnly = true, page = page)
                is PDPushButton -> null
                else -> FormField(name, label, FieldKind.OTHER, f.valueAsString.orEmpty(), readOnly = true, page = page)
            }
        }
    }

    /** Names of required fields that are still empty in [values]. */
    fun missingRequired(fields: List<FormField>, values: Map<String, String>): List<FormField> = fields.filter { f ->
        f.required && !f.readOnly && when (f.kind) {
            FieldKind.CHECKBOX -> (values[f.name] ?: f.value) != "true"
            FieldKind.SIGNATURE, FieldKind.OTHER -> false
            else -> (values[f.name] ?: f.value).isBlank()
        }
    }

    /**
     * Writes the values into the form fields. With [flatten] the answers become ordinary page content
     * and the form can no longer be changed.
     */
    fun fill(input: File, values: Map<String, String>, out: File, flatten: Boolean = false, password: String? = null): List<String> {
        val problems = ArrayList<String>()
        openPdf(input, password).use { doc ->
            if (doc.isEncrypted) doc.isAllSecurityToBeRemoved = true
            val form = doc.documentCatalog.acroForm ?: throw IllegalArgumentException("This PDF has no fillable form fields")
            ensureDefaults(form)
            for ((name, v) in values) {
                val f = form.getField(name) ?: continue
                try {
                    when (f) {
                        is PDTextField -> try { f.value = v } catch (e: Exception) {
                            // The field's own font cannot be used: store the value and ask the reader app to draw it.
                            f.cosObject.setString(COSName.V, v); form.needAppearances = true
                        }
                        is PDCheckBox -> if (v == "true") f.check() else f.unCheck()
                        is PDRadioButton -> if (v.isEmpty()) f.setValue("Off") else f.setValue(v)
                        is PDChoice -> f.setValue(v)
                        else -> {}
                    }
                } catch (e: Exception) { problems.add("${f.partialName ?: name}: ${e.message ?: "could not be filled"}") }
            }
            if (flatten) { runCatching { form.refreshAppearances() }; form.flatten() }
            doc.save(out)
        }
        return problems
    }

    /** Clears every answer. */
    fun reset(input: File, out: File, password: String? = null) {
        val blank = read(input, password).filter { !it.readOnly }.associate { it.name to if (it.kind == FieldKind.CHECKBOX) "false" else "" }
        fill(input, blank, out, false, password)
    }

    private fun ensureDefaults(form: PDAcroForm) {
        val res = form.defaultResources ?: PDResources().also { form.defaultResources = it }
        if (res.getFont(COSName.getPDFName("Helv")) == null) res.put(COSName.getPDFName("Helv"), PDType1Font.HELVETICA)
        if (form.defaultAppearance.isNullOrBlank()) form.defaultAppearance = "/Helv 0 Tf 0 g"
    }

    /** Adds real, fillable text fields and check boxes to a PDF that has none (or more to one that has). */
    fun addFields(input: File, fields: List<NewField>, out: File, password: String? = null) {
        require(fields.isNotEmpty()) { "Place at least one field" }
        openPdf(input, password).use { doc ->
            if (doc.isEncrypted) doc.isAllSecurityToBeRemoved = true
            val form = doc.documentCatalog.acroForm ?: PDAcroForm(doc).also { doc.documentCatalog.acroForm = it }
            ensureDefaults(form)
            val used = form.fieldTree.mapNotNull { it.fullyQualifiedName }.toMutableSet()
            for (nf in fields) {
                val page = doc.getPage(nf.page)
                val (_, vh) = viewSize(page)
                val m = viewMatrix(page)
                val a = m.transformPoint(nf.x, vh - nf.y - nf.h); val b = m.transformPoint(nf.x + nf.w, vh - nf.y)
                val rect = PDRectangle(minOf(a.x, b.x), minOf(a.y, b.y), kotlin.math.abs(b.x - a.x), kotlin.math.abs(b.y - a.y))
                var name = nf.name.ifBlank { if (nf.kind == FieldKind.CHECKBOX) "check" else "field" }.replace('.', ' ')
                var k = 2; val base = name; while (!used.add(name)) name = "$base ${k++}"
                val border = PDColor(floatArrayOf(0.36f, 0.37f, 0.94f), PDDeviceRGB.INSTANCE)
                when (nf.kind) {
                    FieldKind.CHECKBOX -> {
                        val f = PDCheckBox(form); f.partialName = name
                        val w = f.widgets[0]; w.rectangle = rect; w.page = page; w.isPrinted = true
                        val mk = PDAppearanceCharacteristicsDictionary(com.tom_roush.pdfbox.cos.COSDictionary()); mk.borderColour = border; w.appearanceCharacteristics = mk
                        val ap = PDAppearanceDictionary(); val normal = com.tom_roush.pdfbox.cos.COSDictionary()
                        fun stream(on: Boolean): PDAppearanceStream {
                            val s = PDAppearanceStream(doc); s.bBox = PDRectangle(rect.width, rect.height); s.resources = PDResources()
                            PDPageContentStream(doc, s).use { cs ->
                                cs.setStrokingColor(border); cs.setLineWidth(1f); cs.addRect(0.5f, 0.5f, rect.width - 1f, rect.height - 1f); cs.stroke()
                                if (on) { cs.setLineWidth(maxOf(1.5f, rect.width / 8f)); cs.setStrokingColor(PDColor(floatArrayOf(0f, 0f, 0f), PDDeviceRGB.INSTANCE))
                                    cs.moveTo(rect.width * 0.2f, rect.height * 0.5f); cs.lineTo(rect.width * 0.42f, rect.height * 0.25f); cs.lineTo(rect.width * 0.8f, rect.height * 0.78f); cs.stroke() }
                            }
                            return s
                        }
                        normal.setItem(COSName.getPDFName("Yes"), stream(true)); normal.setItem(COSName.Off, stream(false))
                        ap.cosObject.setItem(COSName.N, normal); w.appearance = ap; w.cosObject.setName(COSName.AS, "Off")
                        f.cosObject.setName(COSName.V, "Off")
                        page.annotations = page.annotations.toMutableList().apply { add(w) }; form.fields.add(f)
                    }
                    else -> {
                        val f = PDTextField(form); f.partialName = name; f.defaultAppearance = "/Helv ${if (nf.kind == FieldKind.MULTILINE) 10 else 0} Tf 0 g"
                        f.isMultiline = nf.kind == FieldKind.MULTILINE
                        val w: PDAnnotationWidget = f.widgets[0]; w.rectangle = rect; w.page = page; w.isPrinted = true
                        val mk = PDAppearanceCharacteristicsDictionary(com.tom_roush.pdfbox.cos.COSDictionary()); mk.borderColour = border; w.appearanceCharacteristics = mk
                        page.annotations = page.annotations.toMutableList().apply { add(w) }; form.fields.add(f)
                        runCatching { f.value = "" }
                    }
                }
            }
            doc.save(out)
        }
    }
}
