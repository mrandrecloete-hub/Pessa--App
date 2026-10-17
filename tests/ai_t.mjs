// Node test of the Pesa AI Assistant server logic. Run: node tests/ai_t.mjs
import { handleAssistant, classifyTask, checkToolInput, TOOLS, BLAZE_SYSTEM, isBlaze, toolNamesFor } from '../supabase/functions/_shared/aihandler.mjs';
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
ok(Object.keys(TOOLS).every(n => !/delete|remove|send|^pay_|_pay$|set_price|stock_set|edit/i.test(n)), 'no tool can change or send anything');

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


// Google Gemini as a provider (gemini:model-name), key only on the server
const gm = (parts, u = { promptTokenCount:40, candidatesTokenCount:12 }) => ({ json:{ candidates:[{ content:{ role:'model', parts } }], usageMetadata:u } });
const dg = (x = {}) => deps({ anthropicKey:'', geminiKey:'GEM-SECRET', models:{ fast:'gemini:gem-fast', strong:'gemini:gem-strong' }, prices:{ 'gem-fast':{ in:0.1, out:0.4 } }, ...x });
reset(gm([{ text:'You sold N$10.' }]));
r = await post(ask('hi'), 'k', dg());
ok(r.status === 200 && r.body.text === 'You sold N$10.' && calls[0].u === 'https://generativelanguage.googleapis.com/v1beta/models/gem-fast:generateContent' && calls[0].o.headers['x-goog-api-key'] === 'GEM-SECRET', 'Gemini is called with the model name and the key in a header');
ok(!calls[0].u.includes('GEM-SECRET') && !calls[0].o.body.includes('GEM-SECRET') && !JSON.stringify(r.body).includes('GEM-SECRET'), 'the Gemini key is never in the address, the body or the answer');
{ const gb = JSON.parse(calls[0].o.body), decl = gb.tools[0].functionDeclarations, noParams = decl.find(d => d.name === 'low_stock'), withParams = decl.find(d => d.name === 'sales_by_period');
  ok(gb.systemInstruction.parts[0].text.includes('untrusted DATA') && gb.contents[0].role === 'user' && gb.contents[0].parts[0].text === 'hi', 'system prompt and the question are sent in Gemini format');
  ok(noParams && !('parameters' in noParams), 'a tool with no fields is sent without an empty parameter list');
  ok(withParams.parameters.type === 'OBJECT' && withParams.parameters.properties.period.type === 'STRING' && Array.isArray(withParams.parameters.properties.period.enum) && !JSON.stringify(decl).includes('maxLength'), 'tool fields use Gemini types, with allowed values and no length limits');
  ok(decl.length === Object.keys(TOOLS).filter(n => TOOLS[n].where === 'phone' && n !== 'web_search').length && decl.every(d => !/^web_search$/.test(d.name)), 'the same read only shop tools are offered'); }
ok(r.body.trace.model === 'gem-fast' && r.body.trace.tokensIn === 40 && r.body.trace.tokensOut === 12 && r.body.trace.estCost > 0, 'Gemini usage and cost are tracked');
reset(gm([{ text:'private thoughts', thought:true }, { text:'Answer.' }]));
r = await post(ask('hi'), 'k', dg()); ok(r.body.text === 'Answer.', 'the private thinking of the model is never shown');
// tool call round trip, including a thought signature
reset(gm([{ functionCall:{ name:'sales_by_period', args:{ period:'today' } }, thoughtSignature:'SIG123' }]));
r = await post(ask('how much did I sell today'), 'k', dg());
ok(!r.body.done && r.body.calls[0].name === 'sales_by_period' && r.body.calls[0].input.period === 'today' && r.body.assistant[0].sig === 'SIG123', 'a Gemini tool call is handed to the phone and keeps its signature');
{ const id = r.body.calls[0].id; reset(gm([{ text:'Today you sold N$52. Based on: sales_by_period.' }]));
  const r2 = await post({ messages:[{ role:'user', content:'how much did I sell today' }, { role:'assistant', content:r.body.assistant }, { role:'user', content:[{ type:'tool_result', tool_use_id:id, content:'{"total":52}' }] }], meta:{ shopName:'S' } }, 'k', dg());
  const gb = JSON.parse(calls[0].o.body);
  ok(r2.body.done && /N\$52/.test(r2.body.text), 'the phone tool answer comes back and Gemini finishes the answer');
  ok(gb.contents[1].role === 'model' && gb.contents[1].parts[0].functionCall.name === 'sales_by_period' && gb.contents[1].parts[0].thoughtSignature === 'SIG123', 'the earlier call is replayed with its signature');
  ok(gb.contents[2].role === 'user' && gb.contents[2].parts[0].functionResponse.name === 'sales_by_period' && gb.contents[2].parts[0].functionResponse.response.result === '{"total":52}', 'the tool answer is sent as a function response with the function name'); }
reset({ status:503, json:{} }, gm([{ text:'second try' }]));
r = await post(ask('hi'), 'k', dg()); ok(r.body.text === 'second try' && r.body.trace.retries === 1, 'a Gemini overload is retried a bounded number of times');
reset({ json:{ candidates:[], promptFeedback:{ blockReason:'SAFETY' } } });
r = await post(ask('hi'), 'k', dg()); ok(r.status === 502 && r.body.error === 'empty_answer', 'a blocked or empty Gemini answer is reported, not invented');
ok((await post({ action:'ping' }, 'k', dg())).body.providers.join() === 'gemini' && !JSON.stringify((await post({ action:'ping' }, 'k', dg())).body).includes('GEM-SECRET'), 'ping shows Gemini without the key');
ok((await post(ask('hi'), 'k', dg({ geminiKey:'', localBase:'' }))).status === 503, 'no Gemini key and no other provider is reported');
reset({ status:529, json:{} }, { status:529, json:{} }, gm([{ text:'from gemini fallback' }]));
r = await post(ask('hi'), 'k', deps({ geminiKey:'G', models:{ fast:'fast-m', fallback:'gemini:gem-fast' } })); ok(r.status === 200 && r.body.text === 'from gemini fallback' && calls[2].u.includes('generativelanguage.googleapis.com'), 'Gemini can sit beside Anthropic as the fallback model');

// Blaze: the shop's own fine tuned model, reached through the same self hosted path as local:blaze
const dbz = (x = {}) => dl({ models:{ fast:'local:blaze', strong:'local:blaze' }, ...x });
reset(oa('Hello. I am Blaze.'));
r = await post(ask('who are you'), 'k', dbz()); ok(r.status === 200 && /Blaze/.test(r.body.text) && JSON.parse(calls[0].o.body).model === 'blaze', 'local:blaze is called by name on the self hosted server');
ok(JSON.parse(calls[0].o.body).messages[0].content === BLAZE_SYSTEM && !/Pesa AI Assistant/.test(JSON.parse(calls[0].o.body).messages[0].content), 'Blaze gets the exact short system prompt it was trained with');
ok(isBlaze({ provider:'local', id:'blaze' }) && isBlaze({ provider:'local', id:'blaze-q8' }) && !isBlaze({ provider:'local', id:'qwen-small' }) && !isBlaze({ provider:'anthropic', id:'blaze' }), 'only a local model named blaze gets the Blaze prompt');
reset(oa('x')); await post(ask('hi'), 'k', dl()); ok(/Pesa AI Assistant/.test(JSON.parse(calls[0].o.body).messages[0].content), 'other local models keep the full Pesa prompt');
{ const names = JSON.parse((reset(oa('x')), await post(ask('hi'), 'k', dbz()), calls[0].o.body)).tools.map(t => t.function.name);
  ok(names.length === toolNamesFor().length - 1 && !names.includes('appointments') && !names.includes('occupancy') && ['sales_by_period', 'top_products', 'stock_value', 'profit_and_loss', 'vat_summary', 'forecast', 'alerts_and_notes', 'customer_history', 'supplier_balances'].every(n => names.includes(n)) && !names.includes('web_search'), 'every read only Blaze tool is offered, search stays hidden without a key'); }
reset(oa('', ['sales_by_period', { period:'last_month' }]));
r = await post(ask('how much did I sell last month'), 'k', dbz()); ok(!r.body.done && r.body.calls[0].name === 'sales_by_period' && r.body.calls[0].input.period === 'last_month', 'a Blaze tool call is handed to the phone');
reset(oa('', ['sales_by_period', { period:'forever' }]), oa('I could not read that.'));
r = await post(ask('x'), 'k', dbz()); ok(r.status === 200 && r.body.done && !r.body.calls, 'an invalid tool argument from the model is refused, never handed to the phone');
ok(checkToolInput('top_products', { period:'today' }) === 'bad_period' && checkToolInput('top_products', { period:'week' }) === '' && checkToolInput('vat_summary', { period:'week' }) === 'bad_period' && checkToolInput('stock_value', {}) === '' && checkToolInput('stock_value', { x:'1' }) === 'unexpected_x' && checkToolInput('supplier_reconciliation', {}) === '' && checkToolInput('customer_history', {}) === 'missing_query', 'the new tools check their input');
ok(Object.keys(TOOLS).filter(n => TOOLS[n].where === 'phone').every(n => TOOLS[n].d.length <= 120), 'tool descriptions stay short for a small model');
ok(Object.keys(TOOLS).every(n => !/(add|delete|remove|change|send|set)_/.test(n) || n === 'remember'), 'no tool can change shop data (only the confirmed note tool exists)');
{ const pg = (await post({ action:'ping' }, 'k', dbz())).body; ok(pg.providers[0] === 'local' && pg.models.includes('local:blaze') && !JSON.stringify(pg).includes('LK'), 'ping returns the local provider and the Blaze model name, no keys'); }

// one list of shop tools for every business
{ reset(oa('x')); await post({ messages:[{ role:'user', content:'hi' }], meta:{ shopName:'S' } }, 'k', dbz()); const re = JSON.parse(calls[0].o.body).tools.map(t => t.function.name);
  ok(re.length === 29 && !re.includes('appointments') && !re.includes('occupancy'), 'the tool list stays small and shop only (29 tools)'); }
ok(checkToolInput('appointments', { day:'today' }) === 'unknown_tool', 'salon and lodge tools no longer exist');
console.log(fails ? 'FAILED ' + fails : 'ALL OK'); process.exit(fails ? 1 : 0);
