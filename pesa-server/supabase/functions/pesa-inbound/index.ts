// @ts-nocheck
// Customers replying STOP (WhatsApp webhook or SMS gateway). Deploy: supabase functions deploy pesa-inbound --no-verify-jwt
// Secret: WHATSAPP_VERIFY_TOKEN (any long phrase you also give Meta)
import { serveJson, readBody } from '../_shared/http.ts';
import { handleStop, parseInbound } from '../_shared/send.mjs';
serveJson(async (req, d) => {
  if(req.method === 'GET'){
    const u = new URL(req.url), t = u.searchParams.get('hub.verify_token');
    return t && t === d.env.WHATSAPP_VERIFY_TOKEN ? { status:200, body:Number(u.searchParams.get('hub.challenge')) } : { status:403, body:{ error:'forbidden' } };
  }
  return handleStop(parseInbound(await readBody(req)), d);
});
