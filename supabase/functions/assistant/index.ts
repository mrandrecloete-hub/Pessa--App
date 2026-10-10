// Pesa AI Assistant. Deploy into the shop's OWN Supabase project with:  supabase functions deploy assistant --no-verify-jwt
// Secrets (supabase secrets set ...):
//   PESA_AI_KEY          a long random phrase. The owner pastes the same phrase into Pesa, Settings, Pesa AI.
//   ANTHROPIC_API_KEY    the model provider key (server only, never put it in the app)
//   OPENAI_API_KEY       optional second provider (any OpenAI compatible service); OPENAI_BASE_URL optional
//   AI_MODEL_FAST / AI_MODEL_STRONG / AI_MODEL_FALLBACK   optional, default claude-haiku-5-5, claude-sonnet-5-5, none. Use "openai:model" for the second provider
//   AI_PRICES            optional JSON, per million tokens, for cost estimates, e.g. {"claude-haiku-5-5":{"in":1,"out":5}}. Without it cost shows as unknown
//   SEARCH_API_KEY       optional, Brave Search API key, turns on web search. Without it the assistant says it cannot search
//   AI_HOURLY_LIMIT / AI_DAILY_TOKENS   optional caps, default 60 requests an hour and 200000 tokens a day
// Details: docs/provisioning/ASSISTANT.md
// @ts-nocheck
import { handleAssistant } from '../_shared/aihandler.mjs';

const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, x-pesa-key, authorization, apikey', 'access-control-allow-methods':'POST, OPTIONS' };
const hits = [], usage = { day:'', tokens:0 };
const env = (k, d = '') => Deno.env.get(k) || d;
Deno.serve(async (request) => {
  if(request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  let body = {}; if(request.method === 'POST'){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const headers = {}; request.headers.forEach((v, k) => { headers[k] = v; });
  let out, prices = {}; try{ prices = JSON.parse(env('AI_PRICES', '{}')); }catch(e){}
  try{
    out = await handleAssistant({ method:request.method, headers, body }, {
      key:env('PESA_AI_KEY'), anthropicKey:env('ANTHROPIC_API_KEY'), openaiKey:env('OPENAI_API_KEY'), openaiBase:env('OPENAI_BASE_URL'),
      models:{ fast:env('AI_MODEL_FAST', 'claude-haiku-5-5'), strong:env('AI_MODEL_STRONG', 'claude-sonnet-5-5'), fallback:env('AI_MODEL_FALLBACK') },
      prices, searchKey:env('SEARCH_API_KEY'), hourlyLimit:+env('AI_HOURLY_LIMIT', '60'), dailyTokens:+env('AI_DAILY_TOKENS', '200000'),
      fetch:(u, o) => fetch(u, o), now:() => Date.now(), hits, usage,
    });
  }catch(e){ out = { status:500, body:{ error:'server_error' } }; console.error('assistant error', e && e.name); }   // never log the conversation
  return new Response(JSON.stringify(out.body), { status:out.status, headers:Object.assign({ 'content-type':'application/json' }, CORS) });
});
