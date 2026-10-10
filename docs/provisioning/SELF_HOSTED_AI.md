# Running Pesa AI with no outside AI provider

Pesa can run with no Claude or OpenAI account. There are two parts, and you can use either or both.

## Part 1: on the phone, always on, no server (built in)
Plain statistics on the shop's own records, with no internet and no AI service:
- Sales forecast for tomorrow or the next 7 days, with a range
- This week against last week, this month against the same days last month
- Best and slowest day of the week
- Unusual days (much higher or lower than a normal day of that kind)
- Price what if (raise or lower a price by a percentage, three scenarios)

It refuses when there is too little history, labels estimates as estimates, and cannot change any record. Ask in the assistant, for example "forecast my sales next week", "which day is my best day", "was anything unusual", "what if I raise the price of Bread by 10%".

## Part 2: your own language model on your own server (optional)
For open ended questions, run an open weight model on a server you control and point the Pesa AI function at it. Nothing leaves your own systems.

1. Get a Linux server with a GPU (or a strong CPU for small models). Roughly, a model of 7 to 8 billion parameters, shrunk to 4 bit, needs about 6 to 8 GB of GPU memory. Larger models need much more.
2. Install a model server that speaks the OpenAI chat format. Ollama is the simplest. vLLM and llama.cpp also work.
3. Pull a model that supports tool calling, for example from the Qwen, Llama, Mistral or Gemma families. Read each model's licence for commercial use before you build a product on it.
4. Put it behind HTTPS with a password or key. Never expose a model server to the open internet without one.
5. In the Pesa AI function secrets set: `LOCAL_AI_BASE_URL=https://your-server/v1` (and `LOCAL_AI_KEY` if you set one), and `AI_MODEL_FAST=local:<small model>` and `AI_MODEL_STRONG=local:<bigger model>`. With only these set, no outside provider is used at all.
6. In Pesa: Assistant, Pesa AI, test the connection.

## Honest expectations
- A self hosted model is usually weaker than the best paid models at hard reasoning, long documents and web research, and weaker still in Oshiwambo, Otjiherero and Khoekhoegowab. Test it on 30 real shop questions before relying on it.
- The safety checks still apply: figures are checked against your records, the AI can only read, and you can switch it off.
- You become responsible for the server's security, updates, backups and running costs.
- Building a brand new large language model from scratch is not realistic. It needs thousands of GPUs and millions of dollars.
