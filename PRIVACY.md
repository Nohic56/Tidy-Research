# Tidy Research — privacy notice

Version 1.0.0 · 30 October 2026

Tidy Research has no developer-operated backend. It does not send analytics,
telemetry, error reports, advertising identifiers, or browsing records to its
developer. No account is required.

## Local processing and storage

The extension examines the address of ordinary top-level web navigations to
remove recognised tracking query fields. It reads the search query in supported
DuckDuckGo/Google result URLs to construct optional links. It recognises UniProt
identifier formats locally. It does not contact UniProt to validate a query.

Preferences and excluded hostnames are stored in Firefox's local extension
storage, not synced. At most one undo record per tab contains the original
address, cleaned address, removed field names, timestamp and redirect bookkeeping.
These records use browser-session memory; they are replaced on later cleanup,
removed when tabs close, and cleared when Firefox exits. They are not a persistent
browsing-history archive. Undo is available only on the matching cleaned page
for ten minutes. Records may remain in session memory until the tab closes,
the next cleanup replaces them, or Firefox exits.

## User-directed searches

When a user chooses a research shortcut in the address bar, popup, search strip,
or selected-text menu, the extension opens an HTTPS page with the chosen query:

- UniProt: `www.uniprot.org`
- PubMed: `pubmed.ncbi.nlm.nih.gov`
- Maps: `www.google.com`

The chosen destination receives that query and a normal browser request,
including information the browser normally sends to it. The extension adds no
developer tracking fields. The destination's own privacy practices apply.
No queries are sent merely because a suggestion or shortcut is displayed.
Firefox's manifest declares `searchTerms` to disclose these explicit searches.

## Clipboard and pages

The extension writes to the clipboard only when the user chooses a copy action.
It does not read the clipboard. “Clean address” changes the current page address
without reloading; it does not erase information previously received by the site.
Reopening the original address is an explicit navigation and reloads the page.

Website access enables local request cleanup across HTTP(S) sites and research
links on supported result pages. The extension does not use cookie, password,
history, or download APIs. Its runtime contains no remote executable code.

## Controls

Automatic cleanup and search-strip display can each be turned off. Websites can
be excluded from cleanup, including their subdomains. Firefox also controls
website permissions and separate permission for private windows. Uninstalling
the extension removes its local preferences according to Firefox's extension
storage behaviour.

This independent extension is not affiliated with the services above or Mozilla.
