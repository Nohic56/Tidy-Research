# Mozilla signing and public release

This package is prepared for submission. It has not been signed, approved, or
published by Mozilla. Passing a local linter does not imply Mozilla approval.

## Before the first submission

1. Try the temporary add-on in ordinary desktop Firefox. Use the manual checks
   in `TESTING.md`, especially real DuckDuckGo/Google appearance, copy actions,
   host-permission prompts, and behaviour after a signed installation restarts.
2. Keep or change the name, author, MIT license, and extension ID **before** the
   first submission. The name's availability is not verified. After submission,
   keep the ID stable for updates.
3. Decide on **listed** for public discovery, or **unlisted** for a signed
   personal installation. Both use Mozilla's signing process.
4. Prepare a public support/contact route you control. There are deliberately
   no invented contact details, repository URLs or websites in this package.
5. Publish the privacy notice at a URL you control if the submission form asks
   for one, or supply the included text in the privacy-policy field.
6. Capture actual Firefox screenshots of the toolbar popup and search strip.
   Do not represent a mockup as a verified live screenshot.

## Submit through the Mozilla website

1. Sign in at <https://addons.mozilla.org/developers/> with your Mozilla account.
2. Choose to submit a new add-on, then choose public listing or self-distribution.
3. Upload `dist/tidy-research-1.0.0-amo.zip`.
4. Use the text in `AMO_LISTING.md` and the privacy notice in `PRIVACY.md`.
5. Paste `REVIEWER_NOTES.md` into notes for reviewers.
6. The runtime is the complete readable source: no minification, bundling or
   compilation. If additional source is requested, use the workshop archive
   and explain that only deterministic ZIP packaging is performed.
7. Review Mozilla's validator and address any new findings. Complete the
   submission, developer agreement, license and support details yourself.
8. Install the signed add-on returned by Mozilla, or use the public listing
   once approved. Restart Firefox and verify the extension remains installed.

Submitting requires your developer account and agreement to Mozilla's terms.
This project does not include API credentials, a configured publishing account,
or automatic deployment.

## Updating

For a public AMO listing, submit later versions under the same add-on entry and
ID. Firefox distributes approved listed updates. For unlisted self-distribution,
you can manually install later signed versions; automatic update hosting is
not configured in this package. Increase the version in `manifest.json`,
`package.json`, the lockfile and user-facing version text before packaging.

## Current policy choices

- Firefox Manifest V3, event page with synchronously registered listeners.
- Built-in data disclosure: `required: ["searchTerms"]`, describing searches
  explicitly chosen by the user. No telemetry or silent API lookups.
- No automatic interception/rerouting of default-engine searches.
- No new-tab replacement, homepage change, affiliate links, remote code, CSP
  weakening, cross-origin page manipulation or login automation.
- Broad HTTP(S) access serves the automatic navigation-cleanup feature. No
  redundant `tabs`, `history`, or `cookies` permission is requested.
- The runtime is dependency-free and reviewable; tools/tests stay outside it.

References checked 30 October 2026:

- <https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/>
- <https://extensionworkshop.com/documentation/publish/add-on-policies/>
- <https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/>
- <https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/>

Mozilla has announced policy changes for 1 December 2026. Recheck the live
requirements if submitting after that date; no future approval is implied.
