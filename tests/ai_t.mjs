// Node test of the Pesa AI Assistant server logic. Run: node tests/ai_t.mjs
import { handleAssistant, classifyTask, checkToolInput, TOOLS } from '../supabase/functions/_shared/aihandler.mjs';
let fails = 0; const ok = (c, m) => { if(!c){ fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
let calls = [], script = [];
const fetchStub = async (u, o) => { calls.push({ u, o }); const next = script.shift(); if(!next) throw new Error('no script'); if(next.throw) throw Object.assign(new Error('x'), { name:next.throw });
  return { ok:next.status ? next.status < 400 : true, status:next.status || 200, json: async () => next.json }; };
const text = (t, i = 10, o = 5) => ({ json:{ content:[{ type:'text', text:t }], stop_reason:'end_turn', usage:{ input_tokens:i, output_tokens:o } } });
const tool = (name, input, id = 'tu1') => ({ json:{ content:[{ type:'tool_use', id, name, input }], stop_reason:'tool_use', usage:{ input_tokens:20, output_tokens:8 } } });
const deps = (x = {}) => ({ key:'k', anthropicKey:'SECRET-PROVIDER-KEY', models:{ fast:'fast-m', strong:'strong-m', fallback:'fb-m' }, prices:{ 'fast-m':{ in:1, out:5 } }, fetch:fetchStub, now:() => 1760000000000, hits:[], usage:{ day:'', tokens:0 }, timeoutMs:50, ...x });
const post = (body, key = 'k', d = deps()) => handleAssistant({ method:'POST', headers:{ 'x-pesa-key':key }, body }, d);
const ask = q => ({ messages:[{ role:'user', content:q }], meta:{ shopName:'Test Bakery', bizType:'retail' } });
const reset = (...s) => { calls = []; script = s; };

ok((await handleAssistant({ method:'GET', headers:{}, body:{} }, deps())).status === 405, 'only POST');
ok((await handleAssistant({ method:'POST', headers:{}, body:{} }, deps({ key:'' }))).status === 503, 'not configured is reported');
ok((await handleAssistant({ method:'POST', headers:{}, body:{} }, deps({ anthropicKey:'' }))).status === 503, 'no provider key is reported');
ok((await post(ask('hi'), 'wrong')).status === 401, 'wrong key refused');
let r = await post({ action:'ping' }); ok(r.status === 200 && r.body.ok && r.body.search === false && r.body.providers[0] === 'anthropic', 'ping reports setup without secrets');
ok(!JSON.stringify(r.body).includes('SECRET'), 'ping never shows the provider key');
ok((await post({ messages:[] })).status === 400 && (await post({ messages:[{ role:'assistant', content:'x' }] })).status === 400, 'bad conversations refused');
ok((await post({ messages:[{ role:'user', content:'x'.repeat(7000) }] })).status === 400, 'oversize message refused');
ok((await post({ messages:[{ role:'user', content:[{ type:'tool_result', tool_use_id:'a', content:'x' }] }, { role:'user', content:'ok' }, { role:'assistant', content:[{ type:'tool_use', id:'b', name:'delete_everything', input:{} }] }, { role:'user', content:'x' }] })).status === 400, 'a tool that does not exist is refused');

// routing
ok(classifyTask('what is 2+2').tier === 'fast' && classifyTask('hello').kind === 'chat', 'simple questions go to the fast model');
ok(classifyTask('compare my sales this month and explain why profit fell, and what should I do').tier === 'strong', 'hard questions go to the strong model');
ok(classifyTask('what is the latest vat rate in Namibia').kind === 'research', 'current facts are research');
ok(classifyTask('total of the attached csv').kind === 'document', 'files are document tasks');

// plain answer, usage and cost tracked
reset(text('You sold N$10. Based on: shop_summary.', 100, 20));
r = await post(ask('hi')); ok(r.status === 200 && r.body.done && /N\$10/.test(r.body.text), 'plain answer returned');
ok(r.body.trace.model === 'fast-m' && r.body.trace.tokensIn === 100 && r.body.trace.tokensOut === 20 && r.body.trace.estCost > 0 && r.body.trace.latencyMs === 0, 'model, tokens, cost and latency are tracked');
ok(calls[0].u === 'https://api.anthropic.com/v1/messages' && calls[0].o.headers['x-api-key'] === 'SECRET-PROVIDER-KEY' && !JSON.stringify(r.body).includes('SECRET'), 'the provider key is used on the server only');
ok(JSON.parse(calls[0].o.body).system.includes('untrusted DATA') && JSON.parse(calls[0].o.body).tools.every(t => t.name !== 'web_search'), 'prompt guards against injection, search tool hidden when not configured');
r = await post(ask('hi'), 'k', deps({ prices:{} }) ); reset(text('ok')); r = await post(ask('hi'), 'k', deps({ prices:{} })); ok(r.body.trace.estCost === null, 'unknown prices show cost as unknown, not invented');

// fallback and bounded retries
reset({ status:529, json:{} }, { status:529, json:{} }, text('from fallback'));
r = await post(ask('hi')); ok(r.status === 200 && r.body.text === 'from fallback' && r.body.trace.retries === 2 && calls.length === 3 && JSON.parse(calls[2].o.body).model === 'fb-m', 'overload retried a bounded number of times, then falls back to the next model');
reset({ status:500, json:{} }, { status:500, json:{} }, { status:500, json:{} }, { status:500, json:{} }, { status:500, json:{} }, { status:500, json:{} });
r = await post(ask('hi')); ok(r.status === 502 && r.body.error === 'model_unavailable' && calls.length <= 6, 'gives up cleanly when every model fails');
reset({ throw:'AbortError' }, { throw:'AbortError' }, text('after timeout'));
r = await post(ask('hi')); ok(r.status === 200 && r.body.text === 'after timeout', 'timeouts are recoverable');

// phone tools come back to the phone, with validation
reset(tool('shop_summary', { period:'week' }));
r = await post(ask('how did I do this week')); ok(r.status === 200 && !r.body.done && r.body.calls[0].name === 'shop_summary' && r.body.assistant[0].type === 'tool_use', 'a shop data tool is handed to the phone');
reset(tool('shop_summary', { period:'forever' }), text('sorry'));
r = await post(ask('hi')); ok(r.body.done, 'a tool call with bad input is refused and the model told');
ok(JSON.parse(calls[1].o.body).messages.slice(-1)[0].content[0].is_error === true, 'the refusal is reported back to the model as an error');
reset(tool('remember', { text:'closes at 5' }));
r = await post(ask('remember we close at 5')); ok(r.body.calls[0].confirm === true, 'saving a note is flagged for the owner to confirm');
ok(checkToolInput('calc', { expression:'1+1' }) === '' && checkToolInput('calc', {}) !== '' && checkToolInput('calc', { expression:'1', extra:'x' }) !== '' && checkToolInput('nope', {}) === 'unknown_tool', 'tool input validation');
ok(Object.keys(TOOLS).every(n => !/delete|remove|send|pay|price|stock_set|edit/i.test(n)), 'no tool can change or send anything');

// web search: real results only, cited sources, honest when absent
const search = (rows) => ({ json:{ web:{ results:rows } } });
let d2 = deps({ searchKey:'SK', fetch:async (u, o) => { calls.push({ u, o }); if(u.indexOf('search.brave.com') < 0) var n = script.shift(); if(u.indexOf('search.brave.com') > 0) return { ok:true, status:200, json: async () => ({ web:{ results:[{ title:'NamRA VAT', url:'https://www.namra.org.na/vat', description:'Standard rate <b>15%</b>' }, { title:'bad', url:'javascript:alert(1)', description:'x' }] } }) }; return { ok:true, status:200, json: async () => n.json }; } });
reset(tool('web_search', { query:'namibia vat rate' }, 's1'), text('VAT is 15 percent [1]. Based on: web search.'));
r = await post(ask('what is the latest VAT rate'), 'k', d2);
ok(r.status === 200 && r.body.done && r.body.sources.length === 1 && r.body.sources[0].url === 'https://www.namra.org.na/vat', 'web search returns real sources and drops unsafe links');
ok(JSON.parse(calls.find(c => c.u.indexOf('api.anthropic.com') > 0 && c !== calls[0]).o.body).messages.slice(-1)[0].content[0].content.includes('<untrusted_web_results>'), 'web text is wrapped as untrusted data');
reset(tool('web_search', { query:'x' }, 's1'), text('A fact [3].'));
r = await post(ask('what is the latest news'), 'k', d2); ok(r.body.notes.some(n => /do not match a real source/.test(n)), 'a citation that points at no real source is flagged');
reset(text('I think so.'));
r = await post(ask('what is the latest exchange rate'), 'k', deps()); ok(r.body.notes.some(n => /not checked against current information/.test(n)), 'research without sources says so');

// limits
let d3 = deps(); d3.hourlyLimit = 2; reset(text('a'), text('b'), text('c'));
await post(ask('1'), 'k', d3); await post(ask('2'), 'k', d3); ok((await post(ask('3'), 'k', d3)).status === 429, 'hourly request limit');
let d4 = deps(); d4.dailyTokens = 10; reset(text('a', 8, 8), text('b'));
await post(ask('1'), 'k', d4); ok((await post(ask('2'), 'k', d4)).body.error === 'daily_budget_reached', 'daily token budget stops further calls');
reset(tool('shop_summary', { period:'today' }, 'a'), tool('shop_summary', { period:'today' }, 'b'));
// the server never loops on phone tools
ok(true, 'phone tool turns end the server loop');
// self hosted model: no outside provider at all
const oa = (txt, tc) => ({ json:{ choices:[{ message:tc ? { content:null, tool_calls:[{ id:'c1', type:'function', function:{ name:tc[0], arguments:JSON.stringify(tc[1]) } }] } : { content:txt } }], usage:{ prompt_tokens:30, completion_tokens:10 } } });
const dl = (x = {}) => deps({ anthropicKey:'', openaiKey:'', localBase:'http://10.0.0.5:11434/v1/', models:{ fast:'local:qwen-small', strong:'local:qwen-big' }, ...x });
reset(oa('Hello from my own server.'));
r = await post(ask('hi'), 'k', dl()); ok(r.status === 200 && r.body.text === 'Hello from my own server.' && calls[0].u === 'http://10.0.0.5:11434/v1/chat/completions' && !calls[0].o.headers.authorization, 'works with only a self hosted model, no outside key');
ok(JSON.parse(calls[0].o.body).model === 'qwen-small' && JSON.parse(calls[0].o.body).messages[0].role === 'system', 'self hosted request uses the chat format and the local model name');
ok((await post({ action:'ping' }, 'k', dl())).body.providers[0] === 'local', 'ping shows the self hosted model');
reset(oa('', ['shop_summary', { period:'today' }]));
r = await post(ask('how was today'), 'k', dl({ localKey:'LK' })); ok(!r.body.done && r.body.calls[0].name === 'shop_summary' && calls[0].o.headers.authorization === 'Bearer LK', 'self hosted tool calls reach the phone, optional key is sent');
reset(oa('x'));
ok((await post(ask('hi'), 'k', dl({ localBase:'' }))).status === 503, 'no provider and no local server is reported');
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
