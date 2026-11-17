// Node test of the WhatsApp sender logic. Run: node tests/wa_t.mjs
import { handleWhatsApp, normPhone } from '../supabase/functions/_shared/wahandler.mjs';
let fails = 0; const ok = (c, m) => { if(!c){ fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj').toString('base64');
let calls = [], metaFail = null;
const fetchStub = async (u, o) => { calls.push({ u, o });
  if(metaFail && u.endsWith(metaFail.on)) return { ok:false, json: async () => ({ error:metaFail.err }) };
  if(u.endsWith('/media')) return { ok:true, json: async () => ({ id:'MEDIA1' }) };
  return { ok:true, json: async () => ({ messages:[{ id:'wamid.X' }] }) }; };
const deps = () => ({ key:'secret-key', token:'TOKEN', phoneId:'12345', fetch:fetchStub, now:() => 1000, hits:[] });
const post = (body, key = 'secret-key', d = deps()) => handleWhatsApp({ method:'POST', headers:{ 'x-pesa-key':key }, body }, d);
ok(normPhone('081 234 5678') === '264812345678' && normPhone('+264 81 234 5678') === '264812345678' && normPhone('0027821234567') === '27821234567', 'phone numbers are normalised');
ok((await handleWhatsApp({ method:'GET', headers:{}, body:{} }, deps())).status === 405, 'only POST');
ok((await handleWhatsApp({ method:'POST', headers:{}, body:{} }, { ...deps(), key:'' })).status === 503, 'not configured is reported');
ok((await post({ to:'0812345678', text:'hi' }, 'wrong')).status === 401, 'wrong key refused');
ok((await post({ action:'ping' })).status === 200, 'ping with the right key');
ok((await post({ to:'123', text:'hi' })).status === 400, 'bad number refused');
ok((await post({ to:'0812345678', text:'' })).status === 400, 'empty message refused');
ok((await post({ to:'0812345678', text:'hi', pdf:Buffer.from('not a pdf').toString('base64') })).status === 400, 'a file that is not a PDF is refused');
ok((await post({ to:'0812345678', text:'hi', pdf:Buffer.alloc(2100000, 1).toString('base64') })).status === 413, 'an oversize file is refused');
// text only: template pesa_message, token only in the header
calls = []; let r = await post({ to:'081 234 5678', name:'Anna', shop:'Test Bakery', text:'Invoice INV-1\nAmount due: N$10.00' });
let sent = JSON.parse(calls[0].o.body);
ok(r.status === 200 && r.body.ok && calls.length === 1 && calls[0].u === 'https://graph.facebook.com/v21.0/12345/messages', 'text goes to the messages endpoint');
ok(sent.to === '264812345678' && sent.type === 'template' && sent.template.name === 'pesa_message' && sent.template.language.code === 'en', 'text uses the approved text template');
ok(sent.template.components[0].parameters.map(p => p.text).join('|') === 'Anna|Test Bakery|Invoice INV-1 | Amount due: N$10.00', 'template parameters are filled and new lines removed');
ok(calls[0].o.headers.Authorization === 'Bearer TOKEN' && !calls[0].o.body.includes('TOKEN'), 'the Meta token is only sent in the header');
// with the PDF: upload then send with the document header
calls = []; r = await post({ to:'0812345678', name:'Anna', shop:'Shop', text:'Receipt', pdf:PDF, filename:'receipt INV-7.pdf' });
sent = JSON.parse(calls[1].o.body);
ok(r.status === 200 && r.body.attached && calls[0].u.endsWith('/media') && calls[1].u.endsWith('/messages'), 'PDF is uploaded first, then sent');
ok(sent.template.name === 'pesa_document' && sent.template.components[0].type === 'header' && sent.template.components[0].parameters[0].document.id === 'MEDIA1' && sent.template.components[0].parameters[0].document.filename === 'receipt INV-7.pdf', 'document header carries the uploaded file');
// session (free form) mode
calls = []; await post({ to:'0812345678', text:'Hello', mode:'session' }); sent = JSON.parse(calls[0].o.body);
ok(sent.type === 'text' && sent.text.body === 'Hello', 'session mode sends a plain text');
// Meta errors are explained
metaFail = { on:'/messages', err:{ code:132001, message:'Template name does not exist' } }; r = await post({ to:'0812345678', text:'x' });
ok(r.status === 502 && r.body.error === 'template_missing', 'missing template is explained');
metaFail = { on:'/messages', err:{ code:190, message:'Invalid OAuth access token' } }; r = await post({ to:'0812345678', text:'x' });
ok(r.body.error === 'token_invalid', 'bad token is explained');
metaFail = { on:'/messages', err:{ code:131047, message:'Re-engagement message' } }; r = await post({ to:'0812345678', text:'x', mode:'session' });
ok(r.body.error === 'window_closed', 'closed 24 hour window is explained');
metaFail = null;
// hourly cap
const d = deps(); d.hits = new Array(100).fill(1000); r = await post({ to:'0812345678', text:'x' }, 'secret-key', d);
ok(r.status === 429, 'hourly cap stops a flood');
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
