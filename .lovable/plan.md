## Root cause

vLLM crashed during startup. The real error in the log is:

```
File ".../flashinfer/jit/core.py", line 55, in check_cuda_arch
    elif major == 7 and minor.isdigit():
AttributeError: 'int' object has no attribute 'isdigit'
```

This is a known bug in FlashInfer's CUDA arch detection — it assumes `minor` is a string but on some driver/torch combos it's an int. vLLM tries to JIT-compile a FlashInfer sampling kernel at startup, hits this bug, the engine core dies, and the API server exits. That's why `ss -tlnp | grep :8000` returns nothing — nothing is listening because the process crashed.

The `tail: option used in invalid context -- 8` line is unrelated — it happened because you pasted `tail -80 ~/vllm.log ss -tlnp | grep ':8000'` as one line, so `tail` tried to read a file literally named `ss` and rejected `-tlnp`. Always run those as two separate commands.

## Fix

Tell vLLM to skip the FlashInfer sampler so it never hits that JIT path. Run these one line at a time:

```bash
pkill -f "vllm serve" || true
```

```bash
export VLLM_USE_FLASHINFER_SAMPLER=0
```

```bash
nohup vllm serve Qwen/Qwen2.5-32B-Instruct-AWQ --host 0.0.0.0 --port 8000 --api-key "$VLLM_KEY" > ~/vllm.log 2>&1 &
```

Wait ~60 seconds for model download/load, then check — as two separate commands:

```bash
tail -80 ~/vllm.log
```

```bash
ss -tlnp | grep ':8000'
```

Success looks like a log line `Uvicorn running on http://0.0.0.0:8000` and an `ss` row showing `LISTEN` on `0.0.0.0:8000`.

## If it still crashes

Fallback options, try in order:

1. Force a non-FlashInfer attention backend as well:
   ```bash
   export VLLM_ATTENTION_BACKEND=XFORMERS
   ```
   then re-run the `nohup vllm serve ...` line.

2. Uninstall FlashInfer entirely so vLLM falls back to the native sampler:
   ```bash
   pip uninstall -y flashinfer-python flashinfer
   ```
   then re-run the `nohup vllm serve ...` line.

3. If it still fails, paste the new `tail -80 ~/vllm.log`. A different traceback means a different root cause (GPU OOM for a 32B AWQ model, HF auth, disk space, etc.) and I'll take it from there.

## Note on scope

This is vLLM server troubleshooting on your remote box — nothing in this project's code needs to change. No files will be edited when we switch to build mode; the "plan" is just the shell steps above.