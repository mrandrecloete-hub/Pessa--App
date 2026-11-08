// Supabase Edge Function (Deno). JWT verification stays ON (default): only signed in users can call it.
// Secret: supabase secrets set ANTHROPIC_API_KEY=...   (never put it in the app)
import { handleExtract } from './handler.ts';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const r = await handleExtract(payload, Deno.env.get('ANTHROPIC_API_KEY'));
  return Response.json(r.body, { status: r.status });
});
