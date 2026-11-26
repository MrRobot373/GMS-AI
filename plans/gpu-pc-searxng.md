# GPU PC: SearXNG fix (to do 26 Nov 2026)

Why: on 25 Nov SearXNG had only two web engines (DuckDuckGo, Google CSE). Test bursts got both
blocked (DuckDuckGo CAPTCHA, Google CSE "too many requests"), so every search found nothing.

## 1. Turn on more engines

In SearXNG's `settings.yml` (keep `use_default_settings: true`), add or merge:

```yaml
search:
  formats: [html, json]
  suspended_times:
    SearxEngineCaptcha: 86400          # a blocked engine rests 1 day
    SearxEngineTooManyRequests: 3600   # 1 hour
    SearxEngineAccessDenied: 86400
engines:
  - name: google
    disabled: false
  - name: bing
    disabled: false
  - name: brave
    disabled: false
  - name: yahoo
    disabled: false
  - name: yep
    disabled: false
  - name: mwmbl
    disabled: false
```

Restart SearXNG.

## 2. Check

From the GEM AI PC:

```
curl "http://127.0.0.1:8095/config"            # the engines above show as enabled
curl "http://127.0.0.1:8095/search?q=IEC+61439&format=json"   # results > 0
```

Then Admin → Settings → GEM AI → Test.

## 3. LiteLLM: raise the requests-a-minute limit

Found 26 Nov: the key GEM AI uses on LiteLLM allows only **60 requests a minute**. Re-embedding one workspace's
documents used it up and a chat failed with "429 Rate limit exceeded" (GEM AI now waits up to 30 s for the limit to
reset, but with 100 people 60 a minute is far too low: every chat message, embedding, brain reading and search judge is
a request). On the GPU PC, in LiteLLM's admin UI (Virtual Keys) or with its API, open the key GEM AI uses and raise
`rpm_limit` (for example to 1000), or clear it. Check `max_parallel_requests` and `tpm_limit` on the key, and
`rpm`/`tpm` under each model in LiteLLM's `config.yaml`, too. Then restart LiteLLM if config.yaml changed.

## 4. Optional

- Ollama account: check on ollama.com whether web search is still free after the October 2026
  pricing change. If it is, it can be the fallback provider (Admin → Settings → GEM AI → Test).
- A second SearXNG on a different internet connection (home or another office), only if blocks
  still happen after a week of normal use.
