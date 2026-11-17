# Training Blaze on Pesa's tools

Blaze is Qwen2.5 1.5B Instruct fine tuned with LoRA. It has only been trained on three demo tools, so it will not call Pesa's tools reliably until it is retrained with this data.

## 1. Make the data (on any computer with Python 3)
```
node tools/blaze_training/sync_tools.mjs          # refreshes tools.json from the server's tool list (and the app's copy)
python3 tools/blaze_training/make_dataset.py      # writes train.jsonl and golden_prompt.txt
```
- `train.jsonl`: one JSON object per line, `{"text": "<full Qwen chat template text>"}`. About 2,570 rows: roughly 55 questions for each of the 40 tools (plain and informal English, Namibian dollars, shop words), 15 percent chat, refusals ("I can't change prices, but I can open the page for you"), prompt injection resistance rows, identity rows (built and fine tuned by Björn, never naming another company), two tool questions in one turn, and small calculator, time and file rows so the old skills do not regress.
- One tool list of 29 shop tools, exactly as the app and server send it.
- Every answer only repeats numbers that appear in its tool response. The script drops any row that does not.
- Keep your own original Blaze rows too: `python3 make_dataset.py --existing your_old_train.jsonl`.
- In Colab, prefer the model's own chat template so the text is exactly what the server will build: `python3 make_dataset.py --tokenizer Qwen/Qwen2.5-1.5B-Instruct`. Without it the script writes the same format by hand (tested against the app, see below).
- Rows are long because the tool list is part of every prompt (about 2,300 tokens). Use `max_seq_length` of 3072 or more.
- `train.jsonl` is not committed (it is large). `golden_prompt.txt` is committed: `npm test -- blaze` checks that the app builds exactly this text, so training and the app agree.

## 2. Retrain (Colab)
Same recipe as before: LoRA, 3 epochs, about 5 minutes on a T4. Train on the `text` field. Then merge the adapter into the base model.

## 3. Export and host
```
python llama.cpp/convert_hf_to_gguf.py merged_model --outfile blaze-f16.gguf
llama-quantize blaze-f16.gguf blaze-q8.gguf Q8_0              # computers and the server
llama-quantize blaze-f16.gguf blaze-q4_k_m.gguf Q4_K_M        # phones (about 1 GB)
```
Upload both files and `MODEL_LICENSE_NOTICE.txt` to a Hugging Face repo. Paste the two file links into Pesa (Pesa AI settings) or set up the server as in `docs/BLAZE.md`.

## 4. After changing a tool
Edit `TOOLS` in `supabase/functions/_shared/aihandler.mjs`, add its phone function in `tools/blaze.js` (`blazeToolRun`) and an example maker `t_<name>` in `make_dataset.py`, then run `node tools/blaze_training/sync_tools.mjs` and `python3 tools/embed_block.py BLAZE blaze.js 'anchor'`. `node tests/check.js` fails if the lists drift apart.
