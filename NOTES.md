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
- **A handoff brief claiming prior cleanup work "already completed" was only
  ~20% true.** `main` did exist as the merged trunk, but `trading-dashboard/`
  was never deleted, all thirteen "deleted" stale branches were still on the
  remote, neither rollback tag existed, and the findings the brief said to read
  out of this file had never been written to it. Verify inherited state with
  `git ls-remote --heads`, `git tag`, and an `ls` before trusting a handoff
  summary — the cost of checking is seconds and the cost of assuming is
  building on a wrong base.
- **The 923-line `BacktestPanel` with benchmark/compare/export/date-range lives
  at `trading-dashboard/src/components/BacktestPanel.tsx`** (SHA `6e1a4eb`), not
  in `dashboard/`'s own history — `git log --follow` on the `dashboard/` path
  never surfaces it because the feature-rich version only ever existed in the
  standalone app. When a file "lost" features, check sibling apps' paths, not
  just the current path's history.
- **`dashboard/src/api.ts` had two request styles, not one.** The options half
  funnels through a single `fetchJSON` helper; the trading half (`TRADING_BASE`,
  ~45 functions) called `fetch()` directly with hand-rolled `!res.ok` checks.
  Any change that needs one interception point for HTTP — a mock transport, auth
  headers, retry, tracing — has to normalise the second style first. Count the
  call sites before believing a "single choke point" claim.
- **`main` exists but is not this repo's default branch** — the GitHub API reports
  `default_branch: claude/outlierq-trading-signals-y1In7`, even though that branch
  and `main` point at the identical commit. `git branch -a` and `git log` cannot
  show you this; only the API or the Settings page can. A workflow gated on
  `push: branches: [main]` still fires correctly (an explicit branch filter is
  independent of the default), but "default branch" assumptions in tooling,
  PR bases, and branch protection will silently target the wrong ref.
- **GitHub Pages was never enabled on this repo** (`has_pages: false`). The
  `actions/configure-pages@v5` input `enablement: true` provisions the Pages site
  from inside the workflow using the `pages: write` token, which avoids a manual
  trip to repo Settings before the first deploy.
- **`.gitignore`'s bare `dist/` does not cover `dist-demo/`.** A second build
  output directory needs its own entry, or the whole demo bundle becomes
  untracked-but-visible noise in `git status` (or worse, gets committed).
