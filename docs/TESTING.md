# Validation and release checks

## Automated

Run `node --test tests/*.test.cjs`. The core tests cover the supplied job-portal
example, empty values, exact query encoding, duplicate and encoded tracking
keys, functional fields, signed/auth links, hostname boundaries, invalid input,
512 combinations for idempotence, UniProt formats, and query encoding.

Background tests use a mocked Firefox API and a fresh JavaScript VM to check
synchronous registration, GET-only interception, settings and session-memory
persistence over event-page recreation, manual history-state preservation,
undo and bypass expiry, stale undo, message origin restrictions, options-tab
messages, loop limits, tab closure and explicit omnibox navigation.

Run `npm ci` then `npm run lint` for Mozilla's web-ext validator. Package with
`python3 tools/package.py`. Runtime ZIPs contain no tools, dependencies, tests,
personal browser profiles or credentials.

Optional real-browser checks: run `npx playwright install firefox` then
`npm run test:browser`. The test temporarily installs a disposable copy of the
add-on, uses a local HTTP server, and checks the actual incoming requests.
Its test-only background script is never added to the distributable extension.
It also renders popup/options/search-strip fixtures with mocked extension UI
APIs. That UI check does not automate Firefox's native toolbar or consent prompts.
In a container without nested user namespaces, `TIDY_TEST_CONTAINER=1` applies
test-browser-only sandbox settings; normal user installation requires no such
changes. Test screenshots remain local under the ignored `test-results` folder.

## Results for this package — 30 October 2026

- Node.js suite: **28 passed, 0 failed**, including 512 cleanup combinations.
- Mozilla web-ext 10.8.0 validator: **0 errors, 0 warnings, 0 notices**.
- A fresh headless Firefox 153.0 test profile: **6 integration checks passed**:
  automatic GET cleanup, off switch, manual cleanup preserving form/history
  state, protected URLs, site exceptions, and untouched POST URL on the real
  server request.
- Firefox-rendered UI fixtures: lookup links, copy action, manual-clean state,
  settings save, local URL preview, search-strip query changes and dismissal
  passed with no page-script errors. Light and dark appearances were inspected.
- The browser fixture is a local test, not a verification of live Google/DDG
  styling. Native toolbar prompts, actual clipboard integration, Windows UI and
  signed-package persistence remain the manual checks below.

## Manual before public release

- Test the temporary extension in desktop Firefox 142+ on Windows, then a
  current Firefox release. Verify the toolbar popup at normal and increased
  text size, keyboard tab order, and light/dark themes.
- Grant and withhold website access. Confirm ordinary browsing still works.
- Verify automatic cleanup before navigation using the local test examples in
  reviewer notes. Verify fragment and functional search parameters remain.
- With automatic cleanup off, fill a test form, clean its address manually and
  confirm the form contents stay present. Reopen the original before entering
  any important data; that operation intentionally reloads.
- Copy from the popup and right-click link/page menus, then paste to confirm.
- Test site pause/resume, parent-domain exceptions, settings save, and reopening
  Firefox after installing the **signed** package.
- Test the visible strip on live DuckDuckGo, html/lite variants, and Google
  `.com`/`.nl`; check supported regional domains you plan to advertise.
- Try result-page navigation and browser Back/Forward. Close the strip and
  confirm it stays dismissed for that page; disable it globally in settings.
- Confirm accession, entry-name and ordinary text lookups, new-tab disposition,
  no requests merely on typing, and selected-text searches.
- Confirm no cleanup of POST submissions or protected signing/auth links.
- Check Firefox protected pages, private-window allowance, and a revoked host
  permission. Failures must leave browsing usable.

The unsigned build cannot validate permanent installation across a real Firefox
restart. That check must use the package signed by Mozilla.
