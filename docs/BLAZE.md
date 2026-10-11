# Blaze: Pesa's own AI model

Blaze is Björn's own assistant model: Qwen2.5 1.5B Instruct, fine tuned with LoRA, merged and exported as one GGUF file (`blaze-q8.gguf`, about 1.6 GB, and a phone sized `blaze-q4_k_m.gguf`, about 1 GB). It says it was built and fine tuned by Björn. It answers shop questions by calling Pesa's read only tools and then explaining the result.

Honest limits: a 1.5 billion parameter model can be wrong or miss what you meant. Pesa checks every N$ amount in an answer against the numbers its tools returned and warns the owner when one did not come from the shop records. Blaze is not tax, legal or accounting advice, and nothing here claims it is always accurate, secure or compliant.

## Three ways it runs
| | Where | Needs | Private? |
|---|---|---|---|
| A. Server | Your own server (llama.cpp or Ollama) reached through the shop's Supabase function | Server, HTTPS, a key | Shop figures pass through your server, never an outside AI company |
| B. On the device | Inside Pesa, in the browser (wllama, llama.cpp compiled to WebAssembly) | A recent phone or computer, 4 GB memory or more, a one time download | Nothing leaves the device |
| C. Outside Pesa | The same server as A, called by other tools | The OpenAI compatible address and key | Your server |

Pesa chooses in this order: Blaze on this device (if turned on and downloaded), then your server, then the normal rules assistant. The switch "Never send shop data off this device" removes the server from that list.

## Tier A: server
See `docs/provisioning/ASSISTANT.md`, section "Run your own model, Blaze". In short: run `llama-server` with `--jinja`, put it behind HTTPS with an API key, then set `LOCAL_AI_BASE_URL`, `LOCAL_AI_KEY` and `AI_MODEL_FAST=local:blaze` in the shop's Supabase project.

## Tier B: on the device
1. Host the model files on Hugging Face (a public repo is free) together with `MODEL_LICENSE_NOTICE.txt` from `tools/blaze_training/`. The file address must start with `https://` and end with `.gguf`. Hugging Face allows downloads from other sites. Files over 2 GB do not work in the browser; both Blaze files are under that.
2. In Pesa: Assistant, Pesa AI. Turn on "Run Blaze on this device", paste the two file addresses (small file for phones, full size for computers), then tap "Download Blaze to this device". Pesa shows the size, asks first, checks free space, shows progress, and lets the owner cancel. The model is kept by the browser, so it is downloaded once. "Remove Blaze from this device" deletes it.
3. The model library (wllama 3.8.1, MIT licence) ships inside Pesa (`vendor/wllama/`). It is loaded only when the owner uses Blaze on the device, never at app start. Inference runs inside the library's own worker, so the screen never freezes. Cancel works.
4. Pesa checks the device before offering it: WebAssembly with SIMD, and `navigator.deviceMemory` when the browser reports it (under 4 GB is refused with a plain message). Phones and computers under 8 GB get the small file. If the device is too weak, Pesa says so and uses your server instead (or the normal assistant when the owner chose never to send shop data off the device).
5. Without special web server headers (GitHub Pages cannot set them) the library runs on one thread. It still works but is slower than on a server. Expect a few seconds per answer on a recent computer and longer on a phone. This has not been measured on real devices yet.

## Tier C: using Blaze from outside Pesa
The server in Tier A speaks the OpenAI chat format, so other apps can call it directly:
```
curl https://<host>/v1/chat/completions \
  -H "Authorization: Bearer <the api key>" -H "Content-Type: application/json" \
  -d '{"model":"blaze","messages":[{"role":"system","content":"You are Blaze, a helpful, friendly assistant built by Björn. Use the provided tools when they help."},{"role":"user","content":"Hello"}]}'
```
Keep the key on a server, never in a web page or an app that others can open. Do not expose the raw llama.cpp port. Without Pesa's tools Blaze can only chat. To let other apps use shop figures, go through the Pesa function (`supabase/functions/assistant`), which keeps its own key, limits (`AI_HOURLY_LIMIT`, `AI_DAILY_TOKENS`) and the read only tool list.

## What Blaze can read (all read only)
Original tools: calc, shop_summary, find_product, low_stock, customers_owing, recall_memory, remember (only when the owner asks, and Pesa asks to confirm), analyze_csv.
Added tools for every business: sales_by_period, top_products, sales_by_staff, payment_methods, stock_value, stock_variances, out_of_stock, slow_movers, supplier_balances, supplier_reconciliation, reconciliation_status, customer_history, expenses_summary, till_status, refunds_summary, vat_summary, profit_and_loss, forecast, compare_periods, unusual_days, alerts_and_notes.
Only the owner and managers can use them. Each returns small JSON (at most 3000 characters), money rounded to two decimals, and a list of numbers for the amount check. vat_summary and profit_and_loss use the books engine (`acctGather`, `acctBuild`, `acctView`) without changing it. VAT wording stays "to be confirmed with the relevant legal bodies, authorities and entities of Namibia".
Actions (record a sale, add an expense, change a price, remove anything) stay with the assistant's own commands with their Confirm step, passwords and reasons. Blaze may say "type this in the assistant" but never writes data itself.
Barbershop and salon only (5): appointments, walk_in_queue, stylist_earnings, top_services, service_prices.
Hospitality only (6): occupancy, bookings_ahead, room_status, open_tabs, room_revenue (with the levy shown as an estimate, to be confirmed with the relevant legal bodies, authorities and entities of Namibia), licences_and_levy.
Business type tools are only offered to that business type. A shop sees 29 tools, a salon 34 and a lodge 35, so the prompt stays short for a small model. The server filters by the business type the app sends, the app filters for Blaze on the device, and the training data uses the same three lists (`tools.json` marks each tool with its `biz`). If a model asks for a tool that is not for this business type the app refuses it, and the tool itself answers plainly that this business is not set up for it.

## Training Blaze on the Pesa tools
Blaze today only knows three demo tools. It must be retrained before it calls Pesa's tools reliably. See `tools/blaze_training/README.md`: it makes `train.jsonl` from the same tool list the app uses, then you retrain in Colab, export new GGUF files, and replace the hosted files.

## Privacy and licence
- Do not log requests on the model server. Do not put keys in the app: the address and key a shop owner pastes stay on that device, and the Hugging Face file addresses are public.
- Qwen2.5 1.5B Instruct is Apache 2.0 licensed. Keep `MODEL_LICENSE_NOTICE.txt` next to the hosted model files. If a larger Qwen size is ever used, check its licence first.
- wllama is MIT licensed (`vendor/wllama/LICENCE`).

## Tests
`node tests/ai_t.mjs` (server and the Blaze prompt), `npm test -- blaze` (tools, chat format, on device flow with a pretend model, routing, settings), `node tests/check.js` (tool list sync). Real model speed and answer quality still need to be measured on real devices once the model files are hosted.
