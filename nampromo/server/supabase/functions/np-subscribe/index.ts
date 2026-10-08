// @ts-nocheck
// Shopper sign up. Deploy: supabase functions deploy np-subscribe --no-verify-jwt   (the public app calls it; it checks everything itself)
import { serveJson, readBody } from '../_shared/http.ts';
import { handleSubscribe } from '../_shared/nampromo.mjs';
serveJson(async (req, d) => req.method === 'POST' ? handleSubscribe(await readBody(req), d) : { status:405, body:{ error:'method' } });
