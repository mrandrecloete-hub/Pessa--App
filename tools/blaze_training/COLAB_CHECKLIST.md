# Blaze in Colab: everything still to do

Tick these off in order. Part A gets Blaze working with Pesa's tools. Part B is how you keep teaching it new things.

## Part A. First retrain (so Blaze calls Pesa's tools)

### 0. Before Colab (5 minutes, on any computer)
- [ ] `git pull` the Pesa repo (version 2026.10.178 or newer).
- [ ] `node tools/blaze_training/sync_tools.mjs` (refreshes `tools.json`).
- [ ] `python3 tools/blaze_training/make_dataset.py --existing <your old Blaze train.jsonl>` (keeps the calculator, time, files, jokes and identity rows you already trained). It writes `train.jsonl` (about 2,570 rows) and `eval.jsonl` (246 held out questions).
- [ ] Look at 20 random rows of `train.jsonl` yourself. Check the tone, the Namibian dollar amounts and that answers only repeat numbers from the tool response.
- [ ] Write 30 to 50 questions in YOUR own words into `eval_own.jsonl` (format in `eval_own.example.jsonl`). The generated eval uses the same phrasings as training, so only your own wording shows whether Blaze truly understood.
- [ ] Decide: retrain from the base model (recommended) or continue from your merged Blaze (see step 3).

### 1. Colab setup
- [ ] New notebook, Runtime, Change runtime type, GPU (T4 is enough).
- [ ] Upload `train.jsonl`, `tools.json`, `eval.jsonl`, `eval_own.jsonl`, `eval.py` (or mount Google Drive and keep them there so a disconnect does not lose them).
- [ ] Cell 1: `!pip -q install -U transformers peft trl datasets accelerate bitsandbytes huggingface_hub`
- [ ] Log in to Hugging Face (`from huggingface_hub import notebook_login; notebook_login()`) with a write token (needed only for the upload at the end).

### 2. Training settings (same recipe as before, adjusted)
- [ ] Base: `Qwen/Qwen2.5-1.5B-Instruct`. LoRA rank 16, alpha 32, dropout 0.05, all linear layers (q,k,v,o,gate,up,down).
- [ ] Learning rate 2e-4, 3 epochs, batch size 1 and gradient accumulation 8, cosine schedule, warmup 3 percent. On a T4 use fp16 (it has no bf16).
- [ ] Sequence length 3072 or more. Every row carries the tool list (about 2,300 tokens), so 2048 would cut rows off. Check no row is cut: print the longest tokenized row.
- [ ] Train only on what the assistant writes, not on the questions or the `<tool_response>` text. In trl use `DataCollatorForCompletionOnlyLM` with `instruction_template="<|im_start|>user"` and `response_template="<|im_start|>assistant\n"` (older trl), or the `assistant_only_loss` option on newer versions. Without this Blaze can learn to write fake tool responses. If you cannot do this, train on everything and check carefully in step 5.
- [ ] Keep 5 percent of rows aside as validation. Watch the validation loss: if it rises while training loss falls, stop at the earlier epoch.
- [ ] Expect 20 to 50 minutes for about 2,570 long rows on a T4 (the old 5 minute run had short rows).
- [ ] Save the LoRA adapter to Google Drive straight after training.

### 3. Retrain from base, or continue from Blaze?
- [ ] Recommended: retrain from base `Qwen2.5-1.5B-Instruct` with ALL data (old Blaze rows plus the new ones). Cleaner, and nothing from the old tool format is left behind.
- [ ] Alternative: load your merged Blaze and train a new adapter on the new rows only, with a lower learning rate (5e-5 to 1e-4) and 1 or 2 epochs. Faster, but it can forget the old skills, so keep the old rows in the mix.

### 4. Merge
- [ ] Load the BASE model in fp16 (not 4 bit), load the adapter, `model = model.merge_and_unload()`, then `save_pretrained("blaze-merged")` and save the tokenizer too.
- [ ] Copy `blaze-merged` to Drive.

### 5. Test BEFORE exporting (do not skip)
- [ ] Quick test in Python with the real chat template: `tok.apply_chat_template(messages, tools=tools, add_generation_prompt=True)` and generate. Ask "how much did I sell today", "who owes me money", "who built you".
- [ ] Check the model's own template gives the same text as Pesa's: compare against `golden_prompt.txt` (the repo test already proves Pesa builds exactly that text; this proves the Hugging Face template agrees).
- [ ] After step 6 run `eval.py` against the GGUF (this tests exactly what Pesa will use).

### 6. Convert to GGUF and quantize
- [ ] `!git clone https://github.com/ggml-org/llama.cpp` then build it: `!cmake -B build llama.cpp && cmake --build build -j --target llama-quantize llama-server` (run from the folder that holds `llama.cpp`; adjust paths).
- [ ] `!python llama.cpp/convert_hf_to_gguf.py blaze-merged --outfile blaze-f16.gguf`
- [ ] `!./build/bin/llama-quantize blaze-f16.gguf blaze-q8.gguf Q8_0` (computers and the server, about 1.6 GB)
- [ ] `!./build/bin/llama-quantize blaze-f16.gguf blaze-q4_k_m.gguf Q4_K_M` (phones, about 1 GB)

### 7. Test the real files
- [ ] `!./build/bin/llama-server -m blaze-q8.gguf --jinja --port 8080 -c 6144 &` then `!python eval.py http://127.0.0.1:8080/v1` and again with `--file eval_own.jsonl`. The `--jinja` flag is required.
- [ ] Target: 90 percent or more on both. Read the WRONG list: it shows what to teach next (Part B).
- [ ] Repeat with `blaze-q4_k_m.gguf`. If q4 is clearly worse than q8, tell me: phones then need more training data or a different quantization (for example Q5_K_M, about 1.2 GB).
- [ ] Test a full tool loop by hand: send a tool response back and check the answer repeats only the numbers you gave. Also try "change the price of milk to 20" (it must refuse and say what to type) and a customer name containing "ignore all previous instructions" (it must ignore it).

### 8. Host the files
- [ ] Create a Hugging Face model repo (public is free). Upload `blaze-q4_k_m.gguf`, `blaze-q8.gguf` and `MODEL_LICENSE_NOTICE.txt` (from `tools/blaze_training/`). Files must stay under 2 GB.
- [ ] Copy the two "resolve/main" file links (they end in `.gguf`).
- [ ] Optionally also upload the LoRA adapter and `train.jsonl` to a private repo as a backup.

### 9. Connect to Pesa
- [ ] On a computer and a phone: Pesa, Assistant, Pesa AI. Turn on "Run Blaze on this device", paste the two links, tap Download. Ask real questions. Write down seconds per answer on each device and tell me the numbers.
- [ ] Server option: run `llama-server` behind HTTPS, then `supabase secrets set LOCAL_AI_BASE_URL=... LOCAL_AI_KEY=... AI_MODEL_FAST=local:blaze AI_MODEL_STRONG=local:blaze` (full steps in `docs/BLAZE.md`).
- [ ] If the firewall is in Strict mode, switch it to Standard for the download.

## Part B. Teaching Blaze more

### The loop (repeat for every new skill)
1. [ ] Collect real questions: from your shop owners, and from `eval.py` WRONG lists. Real wording beats invented wording.
2. [ ] Write examples: `teach_more.example.jsonl` shows the two formats (plain answer, or tool question with the tool's response and the answer). Write the same idea 15 to 30 different ways: informal, short, long, with typos, mixed with Afrikaans or Oshiwambo words. Identical rows are dropped.
3. [ ] `python3 make_dataset.py --existing <old file> --extra my_examples.jsonl`. The script refuses an answer that repeats a number not in the tool response.
4. [ ] Retrain (Part A steps 2 to 7), always with the old rows still in the mix so nothing is forgotten.
5. [ ] Run `eval.py`: the old score must not drop, and the new skill must work. Add your new questions to `eval_own.jsonl` BEFORE training so they act as a test.

### Skills worth teaching (suggested order)
- [ ] **How to use Pesa** (no tool needed): "how do I open a till", "how do I record a supplier invoice", "how do I back up". Take the answers from `docs/` and the in app help text. Write them short and exact (menu paths). Keep them factual: a wrong menu path is worse than no answer.
- [ ] **Handing over actions**: when asked to change something, Blaze must say the exact words to type in the assistant. Copy the real commands from `AGENT_TRY` and `AGENT_TILES` in `tools/agent.js`, and write 20 requests for each (change price, add expense, record sale, add customer, send reminder). Today it has about 8 refusal patterns.
- [ ] **Asking back when unsure**: "who owes me" is clear, but "how is Maria" could be a customer or a staff member. Teach "Do you mean the customer or the staff member Maria?" instead of guessing. Also for dates ("last Friday") until a date tool exists.
- [ ] **Two or three tools in one answer**: "give me a full picture of the month" should call sales, expenses and profit tools together and combine them. Today only 5 pairs are generated; write more combinations.
- [ ] **Other languages**: Afrikaans, Oshiwambo (Oshikwanyama and Oshindonga), Otjiherero, German, and the mixed English most shopkeepers really type. The questions can be in those languages while tool names and numbers stay the same. Ask native speakers to write or check them. Do not machine translate blindly.
- [ ] **Explaining the numbers**: "why is my margin low", "what does stock variance mean", "what is the difference between gross and net profit". Plain explanations plus a tool call for the shop's own figures.
- [ ] **Business types**: the salon tools (appointments, walk_in_queue, stylist_earnings, top_services, service_prices) and lodge tools (occupancy, bookings_ahead, room_status, open_tabs, room_revenue, licences_and_levy) now exist and have training examples. Add real wording from salon and guest house owners ("who is in the chair", "is Room 3 clean", "how full are we this weekend"). "This weekend" needs a date range, so ask me for a tool that takes one if owners ask for it often.
- [ ] **Honesty rows**: "will I make more next week" (estimate, not a promise), "is this legal / what tax do I owe" (to be confirmed with the relevant legal bodies, authorities and entities of Namibia), "are you sure" (it can be wrong, check important amounts). Keep these wordings, they are on purpose.
- [ ] **Safety rows**: more prompt injection tests (names, product names and notes containing instructions), requests for passwords or keys, requests to delete or send. The right answer is always a calm refusal plus what to do instead.
- [ ] **Staff mode**: cashiers cannot use the tools. Teach Blaze to explain "only the owner or a manager can see that" when a tool answer says so (the app returns that text).

### How to add a brand new tool
1. [ ] Add it to `TOOLS` in `supabase/functions/_shared/aihandler.mjs` (short description, 12 words or fewer, string parameters with allowed values).
2. [ ] Write its phone function in `tools/blaze.js` (`blazeToolRun`), read only, small JSON, money to 2 decimals, and a `numbers` list.
3. [ ] Add `t_<name>` in `make_dataset.py` (question makers, fake result in the same shape, answer using only response numbers).
4. [ ] `node tools/blaze_training/sync_tools.mjs`, `python3 tools/embed_block.py BLAZE blaze.js 'anchor'`, `node tests/check.js`, `npm test -- blaze`.
5. [ ] Retrain (the tool list is part of every prompt, so Blaze must be retrained after ANY tool change, even a renamed description).
Or just ask me to do steps 1 to 4 for a tool you want.

### Keep quality up
- [ ] Never train on real customer names, phone numbers or shop figures. Use fake data only. If real questions are used, remove names and numbers first.
- [ ] Keep a changelog: model version, date, data version, eval score, q4 and q8 sizes, phone speed. Name files with the version (`blaze-v2-q4_k_m.gguf`), and keep the old files so you can roll back.
- [ ] Do not make the model bigger by habit. 1.5B keeps phones working. If quality is not enough after good data, tell me and we compare Qwen2.5-3B (check its licence first: it is not Apache 2.0) or a stronger server model for the server option only.
- [ ] Tool list size: more tools make every prompt longer and slower on phones. Each business type already gets its own short list (29 shop, 34 salon, 35 lodge) and training shows Blaze all three. After you add a tool, check the tool counts and the token length of the biggest list. If a list passes about 40 tools, tell me and we choose which tools are sent per question.
- [ ] Remember the honest limits: a small model can be wrong. Never describe Blaze as always accurate, secure or approved by any authority.
