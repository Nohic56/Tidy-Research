# Reviewer notes

Desktop Firefox 142+. No account required for testing the add-on. No build
step: the submitted ZIP contains the exact readable runtime source.

## Test examples

1. Visit `https://example.org/?application_reference=&utm_source=chatgpt.com`.
   Expected address: `https://example.org/?application_reference=`.
2. Open the popup. A recent cleanup should offer the original address, indicate
   removed fields, and allow copying the cleaned URL.
3. Disable automatic cleanup. Open another tracked URL. Choose **Clean address**
   in the popup: it changes the address without reloading the document.
4. In settings, pause `example.org`. Tracked links on that host stay unchanged.
5. Paste `https://example.org/?token=sample&utm_source=x` into the settings
   preview. It is protected and unchanged. The preview makes no network request.
6. Search DuckDuckGo for `P04637`. The independent strip offers a direct UniProt
   entry, PubMed, and Maps. No query is sent to those destinations until clicked.
7. Type `u`, Space, `P04637`, Enter in the address bar: opens UniProt. Ordinary
   address-bar searches are not intercepted or rerouted.
8. Select text on any ordinary page and use the **Research selection** menu.

## Permissions

- HTTP(S) host access: automatic top-level navigation cleanup across websites,
  metadata for the current URL, and research strip on supported search pages.
- `webRequest`, `webRequestBlocking`: rewrite recognised tracking fields only
  on top-level GET requests; not POST, subresource, or background fetch traffic.
- `activeTab`, `scripting`: manual same-document address cleanup, preserving
  page history state without reloading. No injected remote code.
- `storage`: local settings and session-memory undo state. No sync storage.
- `contextMenus`: explicit link copy and selected-text searches.
- `clipboardWrite`: explicit user-requested copying; no clipboard reads.
- `searchTerms` data disclosure: user-selected research query navigation. No
  telemetry, server logging controlled by the developer, or background lookup.

Undo records are confined to `storage.session` and are removed on tab closure.
The shortcut links use fixed HTTPS origins with encoded query values. Messages
invoking privileged operations are accepted only from the bundled popup and
options pages. The search strip builds DOM nodes with textContent; it does not
use page-controlled HTML. No external libraries are included in the runtime.

The retained Google domains are `.com`, `.fr`, `.nl`, `.de`, `.co.uk`, `.be`.
The default search provider, new tab page, homepage and browser security
settings are never changed by the extension.
