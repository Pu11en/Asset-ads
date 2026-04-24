# skill/scripts/ — placeholder

Python scripts currently live at the repo root — `/asset_ads.py`,
`/generate_splash_ad.py`, `/batch_splash_ads.py`, `/schedule_runner.py`.

## Why they aren't here yet

Two hard dependencies on root location:

1. `asset_ads.py` uses `Path(__file__).resolve().parent` to find `brands/`
   and `output/`. Moving it breaks that.
2. `generate_splash_ad.py` does `from gemini import ...` which resolves to
   `src/gemini.py` at the repo root. Moving the entrypoint would need a
   matching fix for the gemini helper.

## When to migrate

Phase 1. When we start rewriting the generator for the Hermes skill-driven
flow, also:

- Replace `Path(__file__).parent` with an env-var-driven repo root (or
  `Path(__file__).resolve().parents[2]`).
- Move `src/gemini.py` into `skill/scripts/` or publish it as an importable
  module and update imports.
- Update any cron jobs that call these scripts with absolute paths.
