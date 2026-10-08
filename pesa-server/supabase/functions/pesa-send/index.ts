// @ts-nocheck
// Central WhatsApp and SMS sending for Pesa shops. Deploy: supabase functions deploy pesa-send --no-verify-jwt
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (default pesa_message), SMS_API_URL, SMS_API_KEY, SMS_SENDER
import { serveJson, readBody } from '../_shared/http.ts';
import { handleSend } from '../_shared/send.mjs';
serveJson(async (req, d) => req.method === 'POST' ? handleSend({ body:await readBody(req) }, d) : { status:405, body:{ error:'method' } });
