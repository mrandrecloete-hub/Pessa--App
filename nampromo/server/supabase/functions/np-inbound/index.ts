// @ts-nocheck
// People replying STOP. Point the WhatsApp Cloud API webhook (and the SMS gateway's inbound URL) here.
// Deploy: supabase functions deploy np-inbound --no-verify-jwt     Secret: WHATSAPP_VERIFY_TOKEN (any long phrase you also give Meta)
import { serveJson, readBody } from '../_shared/http.ts';
import { handleInbound, parseInbound } from '../_shared/nampromo.mjs';
serveJson(async (req, d) => {
  if(req.method === 'GET'){ // Meta's one time webhook check
    const u = new URL(req.url);
    return u.searchParams.get('hub.verify_token') && u.searchParams.get('hub.verify_token') === d.env.WHATSAPP_VERIFY_TOKEN ? { status:200, body:Number(u.searchParams.get('hub.challenge')) } : { status:403, body:{ error:'forbidden' } };
  }
  const items = parseInbound(await readBody(req), new URL(req.url).searchParams.get('channel') || 'sms');
  for(const it of items) await handleInbound(it, d);
  return { status:200, body:{ ok:true } };
});
