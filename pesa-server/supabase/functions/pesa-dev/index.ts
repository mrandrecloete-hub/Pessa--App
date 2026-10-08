// @ts-nocheck
// Developer panel login. Deploy: supabase functions deploy pesa-dev --no-verify-jwt
// Secrets: DEV_PRIVATE_JWK (made by tools/make_keys.mjs), DEV_PUBLIC_JWK (the matching public key)
import { serveJson, readBody, clientIp } from '../_shared/http.ts';
import { handleDev } from '../_shared/dev.mjs';
serveJson(async (req, d) => {
  if(req.method !== 'POST') return { status:405, body:{ error:'method' } };
  const body = await readBody(req);
  return handleDev({ action:String(body.action || ''), body, ip:clientIp(req) }, d);
});
