# WhatsApp sending (Send now by WhatsApp)

Pesa can send an invoice, receipt or report to a customer's WhatsApp, with the PDF attached, without opening the WhatsApp app.
It uses Meta's WhatsApp Business Cloud API. Meta's access token is a secret, so it lives in a small function in the shop's OWN
Supabase project (`supabase/functions/whatsapp`), never in the app or the website.

Honest limits, so nobody is surprised:
- Meta charges for most business messages. Check the current price list for your country in the Meta WhatsApp Business pricing page.
- Meta only lets a business start a chat with a customer through a **message template that Meta has approved**. Approval can take minutes to days.
- Until your business is verified and you add your own number, Meta's test number can message only a few people you add as test recipients.
- The send key is stored on the device that sends. Treat a lost phone like a lost key: change `PESA_SEND_KEY` (below) and the old one stops working.
- This was built and tested against a stand in for Meta. The first real send is yours to check, and Meta may change its rules.

## 1. Meta (once)
1. Make a Meta Business account at business.facebook.com and, when asked, verify the business.
2. At developers.facebook.com create an app of type Business and add the **WhatsApp** product.
3. Under WhatsApp, API Setup, add the shop's own WhatsApp number (not one already used in the normal WhatsApp app). Copy the **Phone number ID** (not the phone number).
4. In Business Settings, Users, System users: add a system user, give it your app and the WhatsApp account with full control, then **Generate token** with `whatsapp_business_messaging` and `whatsapp_business_management`, never expiring. This is the access token. Keep it secret.
5. In WhatsApp Manager, Message templates, create two templates in English, category **Utility**, and wait for approval:
   - `pesa_document`: header type **Document**, body `Hello {{1}}, here is your document from {{2}}: {{3}} Thank you.`
   - `pesa_message`: no header, body `Hello {{1}}, this is a message from {{2}}: {{3}} Thank you.`
   (Meta does not let a template body start or end with a variable, which is why the words around them are there.)

## 2. Supabase (once per shop, in the shop's own project)
1. Install the Supabase CLI and log in. From this repository folder: `supabase link --project-ref <the shop's project ref>`
2. Make a long random phrase for the send key, then set the secrets (one line):
   `supabase secrets set PESA_SEND_KEY='<long random phrase>' WHATSAPP_TOKEN='<access token>' WHATSAPP_PHONE_ID='<phone number id>'`
   Optional: `WHATSAPP_TEMPLATE_DOC`, `WHATSAPP_TEMPLATE_TEXT`, `WHATSAPP_LANG` if you named the templates differently.
3. Deploy: `supabase functions deploy whatsapp --no-verify-jwt`
   The address is `https://<project ref>.supabase.co/functions/v1/whatsapp`.

## 3. Pesa (on each device that should send)
Settings, Notifications, **WhatsApp sending**: paste the address and the send key, tap Save, then **Send test WhatsApp** to your own number
(add it as a test recipient in Meta first while the app is in test mode). After that every send sheet shows **Send now by WhatsApp**.

## Safety built in
- The function refuses any request without the right send key, and only accepts real PDF files up to 2 MB.
- At most 100 messages an hour from one running copy of the function, and 50 a day from one device.
- Every send is written to the Activity log in Pesa. The message text and the customer's number go through Meta, so mention that in your privacy notice.

Tests: `node tests/wa_t.mjs` checks the function logic against a stand in for Meta.
