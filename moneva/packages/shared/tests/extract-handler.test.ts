import { describe, expect, it, vi } from 'vitest';
import { handleExtract, MAX_BASE64_CHARS } from '../../../supabase/functions/extract-document/handler';

const good = { mimeType: 'image/jpeg', base64: 'A'.repeat(200) };
const ok = (text: string) =>
  vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 })) as unknown as typeof fetch;

describe('extract-document handler', () => {
  it('refuses when the server key is missing', async () => {
    expect((await handleExtract(good, undefined)).status).toBe(503);
  });
  it('rejects bad types, empty and oversized files, non base64', async () => {
    expect((await handleExtract({ ...good, mimeType: 'text/html' }, 'k')).status).toBe(400);
    expect((await handleExtract({ ...good, base64: 'AAA' }, 'k')).status).toBe(413);
    expect((await handleExtract({ ...good, base64: 'A'.repeat(MAX_BASE64_CHARS + 1) }, 'k')).status).toBe(413);
    expect((await handleExtract({ ...good, base64: '<script>'.repeat(30) }, 'k')).status).toBe(400);
  });
  it('sends the key only in the header, picks document block for PDFs, returns text', async () => {
    const f = ok('{"documentType":"receipt"}');
    const r = await handleExtract({ mimeType: 'application/pdf', base64: 'A'.repeat(200), hint: 'payslip' }, 'secret-key', f);
    expect(r).toEqual({ status: 200, body: { text: '{"documentType":"receipt"}' } });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('secret-key');
    expect(String(init.body)).not.toContain('secret-key');
    expect(JSON.parse(String(init.body)).messages[0].content[0].type).toBe('document');
  });
  it('maps upstream failures to safe errors without leaking details', async () => {
    const down = vi.fn(async () => new Response('boom secret', { status: 500 })) as unknown as typeof fetch;
    const r = await handleExtract(good, 'k', down);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('boom');
    const thrown = vi.fn(async () => {
      throw new Error('net');
    }) as unknown as typeof fetch;
    expect((await handleExtract(good, 'k', thrown)).status).toBe(502);
  });
});
