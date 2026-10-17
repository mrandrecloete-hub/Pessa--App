# Pesa AI Assistant: server setup

The assistant first uses its own rules (open a page, add an expense, change a price, each with a Confirm step). Only when it does not understand a question does it ask your own Pesa AI server. The server holds the model key. The phone never does.

## What it can and cannot do
- Can: answer questions using the shop's totals, stock, who owes money, notes the owner saved, a calculator and an attached CSV file. Can search the web when a search key is set, and cites the numbered sources it was given.
- Cannot: change, send or remove anything. It cannot run code. It cannot read PDF or spreadsheet files directly (save a spreadsheet as CSV first). It does not search by meaning, only by words.
- It can be wrong. Figures it states that did not come from the shop records or the calculator are flagged in the answer. Tax and legal points are general information, to be confirmed with the relevant legal bodies, authorities and entities of Namibia.

## Deploy (in the shop's own Supabase project)
```
supabase functions deploy assistant --no-verify-jwt
supabase secrets set PESA_AI_KEY=<a long random phrase> ANTHROPIC_API_KEY=<provider key>
```
Then in Pesa: Assistant, Pesa AI. Paste the function address (https://<project>.supabase.co/functions/v1/assistant) and the same phrase as the access key, then tap Test the connection.

## Environment variables (server only)
| Name | Needed | Meaning |
|---|---|---|
| PESA_AI_KEY | yes | Access phrase, pasted into Pesa. At least 8 characters, use a long one |
| ANTHROPIC_API_KEY | yes, or OPENAI_API_KEY | Model provider key. Costs money, see your provider's pricing |
| LOCAL_AI_BASE_URL, LOCAL_AI_KEY | no | Your own model server (OpenAI compatible). With this you need no outside provider, see SELF_HOSTED_AI.md |
| OPENAI_API_KEY, OPENAI_BASE_URL | no | A second provider (any OpenAI compatible service) used as a fallback |
| AI_MODEL_FAST, AI_MODEL_STRONG, AI_MODEL_FALLBACK | no | Models for easy questions, hard questions and fallback. Default claude-haiku-5-5 and claude-sonnet-5-5. Write openai:model-name for the second provider |
| AI_PRICES | no | JSON of per million token prices so cost estimates show, for example {"claude-haiku-5-5":{"in":1,"out":5}}. Without it cost shows as unknown |
| SEARCH_API_KEY | no | Brave Search API key. Without it the assistant says it cannot search the web |
| AI_HOURLY_LIMIT, AI_DAILY_TOKENS | no | Caps, default 60 requests an hour and 200000 tokens a day (per running copy of the function) |

## Run your own model, Blaze
Blaze is Björn's own model (Qwen2.5 1.5B Instruct, fine tuned with LoRA, exported as GGUF). Full guide: `docs/BLAZE.md`. The short version for the server:
1. On a server with enough memory (about 4 GB free for the 8 bit file) run llama.cpp: `llama-server -m blaze-q8.gguf --jinja --host 127.0.0.1 --port 8080 -c 6144 --api-key <a long random key>`. The `--jinja` flag is required, it makes the Qwen chat template handle tools. `-c 6144` leaves room for the tool list (29 to 35 tools use about 2,500 to 3,000 tokens). Or use Ollama with a Modelfile whose system prompt is `You are Blaze, a helpful, friendly assistant built by Björn. Use the provided tools when they help.`
2. Put it behind HTTPS (Caddy or nginx) and keep the API key. Never expose the raw port.
3. In the shop's Supabase project: `supabase secrets set LOCAL_AI_BASE_URL=https://<host>/v1 LOCAL_AI_KEY=<the api key> AI_MODEL_FAST=local:blaze AI_MODEL_STRONG=local:blaze`. A local model whose name contains blaze automatically gets the short system prompt it was trained with.
4. Check: Settings, Pesa AI, Test the connection (the `ping` answer lists `local`), then ask a real question such as "how much did I sell this month". The answer shows "Answered by Blaze on your own server".
5. Do not turn on request logging on the model server: shop figures pass through it. Rate limits (`AI_HOURLY_LIMIT`, `AI_DAILY_TOKENS`) still apply.
Blaze can read the same shop facts as the other models, plus the extra read only tools listed in `docs/BLAZE.md`. It cannot change anything.

## Safety design
- The key is only in server secrets. The phone sends its own access phrase, which only unlocks this function.
- Tools are a fixed list in the server (read only phone tools, 29 shop tools, and web search). Anything else the model asks for is refused, and the arguments of every call are checked. No tool can change shop data. The same list, in the same order, is used by the app and by Blaze's training data (`node tools/blaze_training/sync_tools.mjs`).
- Shop data, notes, files and web pages are passed to the model as untrusted data with an instruction never to follow text inside them.
- Limits: at most 4 model calls per question, 8 phone tool calls, 3 searches, 25 second timeout per call, 70 seconds overall, and the question can be cancelled.
- Notes are saved only after the owner confirms. They stay on the phone, per business, are shown on screen, can be edited or deleted, and expire after 180 days.
- The audit log records that an AI answer happened (model, token counts, tool names), never the question or the answer.
- Daily and hourly caps are kept in the running function's memory. They reset when the function restarts. For strict caps also set a spending limit with your provider.

## Tests
`node tests/ai_t.mjs` (server logic), and `npm test -- ai_ui` (phone side).
