# WhatsApp and SMS alerts: what is needed

The app collects name, email, cellphone number (stored as +264 8x xxx xxxx), the channels the person ticked and their consent. Today this is saved on the device only and messages are **previews, not sent**. To send for real:

1. **Server and database.** Supabase (or similar) with the `subscribers` and `consents` tables in `backend-additions.sql`. The browser never holds provider keys.
2. **WhatsApp.** The WhatsApp Business Platform needs a verified business account and pre approved message templates for messages that start a conversation. Pesa already has a WhatsApp function (`supabase/functions/whatsapp`) that can serve as a pattern.
3. **SMS.** A bulk SMS gateway account. Check which providers deliver on Namibian networks and the cost per message before choosing.
4. **Consent and stopping.** Send only on channels the person ticked. Every message offers a way to stop (reply STOP), and a stop must be honoured at once. Keep a record of when consent was given.
5. **Fair use.** Limit how many messages a person gets per day, send only for categories and towns they chose, and never send promotional messages to numbers that did not opt in.
6. **Privacy.** How personal information is handled, kept and protected under Namibian law is to be confirmed with the relevant legal bodies, authorities and entities of Namibia before launch.
7. **Shops.** Registered shops need checking (identity, business registration, contact) before a verified mark is shown. Until then they show as "not yet checked".
