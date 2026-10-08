// @ts-nocheck
// The daily job: builds digests and price alerts for people who asked for them and sends what is allowed to go. Call it from a schedule.
// Deploy: supabase functions deploy np-dispatch --no-verify-jwt   Secret: DISPATCH_KEY. Call with header x-nampromo-key: <DISPATCH_KEY>
import { serveJson } from '../_shared/http.ts';
import { handleDispatch } from '../_shared/nampromo.mjs';
serveJson(async (req, d) => req.method === 'POST' ? handleDispatch({ key:req.headers.get('x-nampromo-key') }, d) : { status:405, body:{ error:'method' } });
