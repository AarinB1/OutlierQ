# Working notes

One lesson per entry. Corrections and confirmed approaches from overhaul runs —
things git history does not record.

- **`ta` fails to build in a clean env unless numpy is installed first.** Install
  numpy, then `pip install --no-build-isolation ta` — its setup.py imports numpy
  at build time.
- **Don't pipe `pip install` through `tail`** — the pipe masks pip's exit code and
  a failed transaction (pip installs nothing if one package fails) looks like
  success.
- **Sandboxed egress proxies can reject chrome/firefox TLS fingerprints** used by
  curl_cffi/yfinance browser impersonation, resetting the handshake (curl error
  35). `safari17_0` and `edge101` fingerprints pass. Fixed for this environment
  via a `sitecustomize.py` patch outside the repo — never bake environment
  workarounds into project code.
- **Tests that assert on live FinBERT outputs for borderline sentences break on
  transformers upgrades.** The 4.37→5.x move shifted several borderline
  probabilities (e.g. "Market closes slightly higher today" is now extreme-
  positive at 0.87). Filter logic must be unit-tested with an injected stub
  analyzer; only clear-cut sentences belong in live-model tests.
- **The FinBERT model itself is healthy under transformers 5.x** — canonical
  positive/negative/neutral sentences score correctly and `config.id2label`
  matches the hardcoded map, so baseline test failures were test brittleness,
  not an engine regression.
- **This environment has no FINNHUB_API_KEY**, which exposed a real robustness
  bug: both `run_once` and `DiscoveryOrchestrator.feed_discoveries` constructed
  `NewsFetcher()` eagerly and crashed the whole pipeline instead of degrading to
  the key-free stages (yfinance options flow, EDGAR, already-stored articles).
- **pandas 3.x / yfinance 1.5 / transformers 5.x all install as "latest" from this
  repo's `>=` pins** — the test suite is the only guard against ecosystem drift;
  keep it runnable without network-dependent assertions.
- **Running the demo CLI end-to-end found a bug the whole test suite missed:**
  every pipeline entry point returns ORM rows out of a committed-and-closed
  session, which crashes with DetachedInstanceError under SQLAlchemy's default
  attribute expiry. Tests always passed a session in, so only the real CLI path
  exercised it. Exercise the actual entry points, not just the units.
- **scipy 1.17 + torch: importing the FastAPI app can start torch's import and
  reach scipy before torch finishes**, and scipy's array-API probe of
  `sys.modules['torch'].Tensor` then errors. Only visible running a single test
  file; `tests/conftest.py` imports torch first as the guard.
- **`npm run build` had never passed for the dashboard** (15 TypeScript errors)
  because everyone ran `npm run dev`, which skips typechecking. Four components
  called `addToast(message, type)` with the arguments swapped — a class of bug
  the runtime never surfaces loudly. Run the real build in CI or before
  claiming the frontend works.
- **The `addToast`-in-deps footgun is only a footgun when the callback identity
  is unstable.** Toast's addToast is wrapped in useCallback with stable deps,
  so listing it in effect dependency arrays is safe; check identity stability
  before "fixing" dependency arrays.
- **Base-layer CSS defaults for `input`/`select`/`textarea`** fix an entire
  class of "this page came from a different app" white-control bugs at once,
  and utility classes still win — cheaper and safer than restyling each field.
- **This sandbox has a writable-disk allowance that `df` does not show** — the
  pip cache alone was 2.7G and its exhaustion surfaced as SQLite "disk I/O
  error" and OperationalError test failures, not as a clear disk-full signal.
  Delete caches, then re-run anything that failed around the same time before
  trusting its result.
