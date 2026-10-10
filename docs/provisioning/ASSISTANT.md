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

## Safety design
- The key is only in server secrets. The phone sends its own access phrase, which only unlocks this function.
- Tools are a fixed list in the server. Anything else the model asks for is refused. No tool can change shop data.
- Shop data, notes, files and web pages are passed to the model as untrusted data with an instruction never to follow text inside them.
- Limits: at most 4 model calls per question, 8 phone tool calls, 3 searches, 25 second timeout per call, 70 seconds overall, and the question can be cancelled.
- Notes are saved only after the owner confirms. They stay on the phone, per business, are shown on screen, can be edited or deleted, and expire after 180 days.
- The audit log records that an AI answer happened (model, token counts, tool names), never the question or the answer.
- Daily and hourly caps are kept in the running function's memory. They reset when the function restarts. For strict caps also set a spending limit with your provider.

## Tests
`node tests/ai_t.mjs` (server logic), and `npm test -- ai_ui` (phone side).
