// @ts-nocheck
// Confirms the code sent to the shopper's phone. Deploy: supabase functions deploy np-verify --no-verify-jwt
import { serveJson, readBody } from '../_shared/http.ts';
import { handleVerify } from '../_shared/nampromo.mjs';
serveJson(async (req, d) => req.method === 'POST' ? handleVerify(await readBody(req), d) : { status:405, body:{ error:'method' } });
