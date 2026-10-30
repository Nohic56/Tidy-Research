# Tidy Research

A desktop Firefox extension for cleaner links and explicit research searches.
Independent of Mozilla, DuckDuckGo, Google, UniProt, and NCBI.

## Start here on Windows

1. Extract the workshop ZIP into a folder you will keep.
2. In Firefox, enter `about:debugging#/runtime/this-firefox` in the address bar.
3. Choose **Load Temporary Add-on…**, then select `extension/manifest.json`
   inside the extracted `tidy-research` folder.
4. Open Firefox's puzzle-piece Extensions menu. Open Tidy Research and pin it
   to the toolbar if desired. Allow website access if Firefox asks.
5. Visit `https://example.org/?application_reference=&utm_source=chatgpt.com`.
   The resulting address should be `https://example.org/?application_reference=`.
6. Search DuckDuckGo for `P04637` and choose **UniProt entry** in the research
   strip. Alternatively type `u`, then Space, then `P04637` in the address bar.

**A temporary installation disappears when Firefox exits.** This is a testing
step. To keep the extension installed across restarts, have Mozilla sign it,
then install the signed package. You can choose an unlisted personal release
or a public listing. See [the release guide](docs/RELEASE.md).

Firefox **142 or newer, desktop** is required. The package does not claim
Android or Chrome support. No Node.js or Python installation is needed to try
the extracted extension in Firefox.

## Included features

- Automatic removal of recognised `utm_*` and advertising click identifiers
  before top-level GET navigations. Also works when a tracked URL is pasted
  into the address bar and opened.
- Clean the current address without reloading the page. Existing pages are
  left intact until you choose this action; they are not mass-reloaded.
- Copy a clean link from the popup or the right-click menu.
- A visible list of removed fields and a temporary **Reopen original** action.
  Reopening the original reloads the page; do it before entering form data.
- Global on/off switches and website exceptions, including subdomains.
- UniProt, PubMed and Maps shortcuts on DuckDuckGo and selected Google sites.
- A `u` address-bar keyword. Its dropdown offers UniProt, PubMed and Maps.
- Research searches from selected page text via the right-click menu.
- Light and dark appearance, accessible labels, keyboard focus, and no external
  dependencies in the installed extension.

## How search works

Normal Firefox searches stay with the user's default engine. There is no
search interception, automatic rerouting, autocomplete network request,
remote identifier check, or background query transmission.

Type `u`, Space, then:

| Query | Result on Enter |
| --- | --- |
| `P04637` | Direct UniProt accession entry |
| `P04637-2` | UniProt isoform entry link |
| `CDC27_HUMAN` | UniProt entry-name search |
| `cyclin B Xenopus` | UniProt text search |
| `pubmed APC/C phosphorylation` | PubMed search |
| `maps Groningen` | Google Maps search |

Accession format recognition is case-insensitive and anchored to the whole
query. It does not establish that an entry exists. Names such as `APC3` are
searched rather than mapped to an assumed species. No cross-origin HEAD probe
is used. Provider navigation occurs only when the user selects a shortcut.

The search strip supports DuckDuckGo's main, www, html and lite sites and
Google's www `.com`, `.fr`, `.nl`, `.de`, `.co.uk`, and `.be` results. It uses an
independent Shadow DOM strip instead of modifying the engine's internal tabs.
It has a close button and can be disabled globally. Pages already loaded
before installation need one reload to receive the strip. Search providers
can change their page structure, so verify the appearance before publication.

## Cleanup boundaries

The cleaner removes whole recognised query fields, retaining every other raw
query segment. It preserves empty values, query encoding, parameter order,
repeated functional fields, URL fragments, and paths. It does not strip arbitrary
`ref`, `source`, `q`, `id`, or application-reference fields. It does not unwrap
redirect URLs, rewrite fragment-based routes, modify clipboard text outside an
explicit copy action, or remove every possible tracker on the web.

Recognised signing and authentication fields protect the entire URL from
cleanup. This is intentionally conservative, not a complete signed-link
detector. Add an exception if a website uses an unrecognised signing scheme or
needs a tracking parameter to work. There is a three-redirect limit per request
to avoid loops when a site keeps restoring a tracking field.

Only top-level GET navigation requests are changed. POST submissions,
subresources, background fetches and iframes are not rewritten. Firefox's
protected pages cannot be edited. Same-document address changes can be cleaned
manually; automatic cleanup does not continuously edit page history.

## Privacy

No developer-operated service, analytics, advertising, remote executable code,
accounts, or telemetry. URL processing happens locally. User-selected search
queries go to the selected destination, which receives a normal browser
request. This is disclosed as `searchTerms` in Firefox's built-in consent.
Details: [PRIVACY.md](PRIVACY.md).

## Development

The runtime is plain, unminified JavaScript, CSS, HTML and a locally authored
SVG icon. No compilation step or production package dependency is required.

With Node.js 22+ and Python 3:

```sh
node --test tests/*.test.cjs
python3 tools/package.py
```

For Mozilla's linter and Firefox development runner:

```sh
npm ci
npm run lint
npm start
```

Optional Firefox integration/UI checks:

```sh
npx playwright install firefox
npm run test:browser
```

These use a fresh test profile and local fixtures, not your personal browser.

`web-ext` is a pinned development dependency only. `npm ci` installs development
tools; these are not included in the extension submitted to Mozilla.

Packaging is deterministic and produces:

- `dist/tidy-research-1.0.0-amo.zip`: upload this to Mozilla.
- `dist/tidy-research-1.0.0-unsigned.xpi`: identical runtime bytes, still unsigned.
- `dist/Tidy_Research_1.0.0_Workshop.zip`: source, docs, tests and runtime packages.

Do not offer the unsigned XPI as a normal permanent Firefox installation.
Do not disable signing requirements in users' browsers.

## License

MIT; see [LICENSE](LICENSE). The author can choose a different license before
the first public distribution if preferred. Keep the extension ID stable after
its first Mozilla submission.
