/* Shared pure functions. No requests, storage, or page access. */
(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({ autoClean: true, searchLinks: true, excludedHosts: [] });
  const TRACKING = new Set([
    "fbclid", "gclid", "dclid", "msclkid", "twclid", "ttclid", "li_fat_id",
    "mc_cid", "mc_eid", "igshid", "srsltid", "_ga", "_gl", "gbraid", "wbraid"
  ]);
  const SIGNED = /^(?:x-amz-.+|x-goog-.+|signature|sig|hmac|token|access_token|id_token|auth|authorization|oauth_.+|samlrequest|samlresponse|samlart|relaystate|code|state|policy|key-pair-id|expires|se|sp|sv|__cf_chl_.+)$/i;
  const ACCESSION = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[1-9][0-9]*)?$/;
  const ENTRY_NAME = /^[A-Z0-9]{1,10}_[A-Z0-9]{3,5}$/;
  function normaliseHost(value) {
    const text = String(value).trim().toLowerCase();
    if (!text || /[\s*]/.test(text)) throw new Error("Enter a hostname or an http(s) URL, without wildcards.");
    const url = new URL(text.includes("://") ? text : "https://" + text);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Invalid website address.");
    return url.hostname.replace(/\.$/, "");
  }
  function settings(input = {}) {
    return {
      autoClean: typeof input.autoClean === "boolean" ? input.autoClean : DEFAULTS.autoClean,
      searchLinks: typeof input.searchLinks === "boolean" ? input.searchLinks : DEFAULTS.searchLinks,
      excludedHosts: Array.isArray(input.excludedHosts) ? [...new Set(input.excludedHosts.map(normaliseHost))].sort() : []
    };
  }
  function isExcluded(hostname, hosts = []) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return hosts.some(item => host === item || host.endsWith("." + item));
  }
  function cleanUrl(input, options = {}) {
    // Keep untouched query segments byte-for-byte. URLSearchParams serialization
    // can change spaces, percent encoding, parameter order, and empty values.
    const original = String(input);
    const result = { original, url: original, removed: [], reason: "clean" };
    let parsed;
    try { parsed = new URL(original); } catch { return { ...result, reason: "unsupported" }; }
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return { ...result, reason: "unsupported" };
    if (!options.ignoreExclusions && isExcluded(parsed.hostname, options.excludedHosts)) return { ...result, reason: "excluded" };
    const hashIndex = original.indexOf("#");
    const body = hashIndex < 0 ? original : original.slice(0, hashIndex);
    const fragment = hashIndex < 0 ? "" : original.slice(hashIndex);
    const queryIndex = body.indexOf("?");
    if (queryIndex < 0) return result;
    const parts = body.slice(queryIndex + 1).split("&");
    const keys = parts.map(part => {
      const raw = part.split("=", 1)[0];
      try { return decodeURIComponent(raw.replace(/\+/g, " ")).toLowerCase(); } catch { return raw.toLowerCase(); }
    });
    if (keys.some(key => SIGNED.test(key))) return { ...result, reason: "protected" };
    const kept = parts.filter((part, index) => {
      const key = keys[index];
      if (key.startsWith("utm_") || TRACKING.has(key)) { result.removed.push(key); return false; }
      return true;
    });
    if (!result.removed.length) return result;
    result.url = body.slice(0, queryIndex) + (kept.length ? "?" + kept.join("&") : "") + fragment;
    result.reason = "changed";
    return result;
  }
  function identify(query) {
    const value = String(query).trim().toUpperCase();
    if (ACCESSION.test(value)) return { kind: "accession", value };
    if (ENTRY_NAME.test(value)) return { kind: "entry-name", value };
    return { kind: "search", value: String(query).trim() };
  }
  function searchUrl(provider, query) {
    const text = String(query).trim();
    if (!text) throw new Error("Enter a search term first.");
    const encoded = encodeURIComponent(text);
    if (provider === "uniprot") {
      const match = identify(text);
      if (match.kind === "accession") return "https://www.uniprot.org/uniprotkb/" + encodeURIComponent(match.value) + "/entry";
      const term = match.kind === "entry-name" ? "id:" + match.value : text;
      return "https://www.uniprot.org/uniprotkb?query=" + encodeURIComponent(term);
    }
    if (provider === "pubmed") return "https://pubmed.ncbi.nlm.nih.gov/?term=" + encoded;
    if (provider === "maps") return "https://www.google.com/maps/search/?api=1&query=" + encoded;
    throw new Error("Unknown search provider.");
  }
  function searchQuery(input) {
    let url;
    try { url = new URL(input); } catch { return ""; }
    const ddg = /^(?:(?:www|html|lite)\.)?duckduckgo\.com$/.test(url.hostname);
    const google = /^www\.google\.(?:com|fr|nl|de|co\.uk|be)$/.test(url.hostname) && url.pathname === "/search";
    return ddg || google ? (url.searchParams.get("q") || "").trim() : "";
  }
  const api = { DEFAULTS, TRACKING, cleanUrl, identify, searchUrl, searchQuery, settings, normaliseHost, isExcluded };
  root.TidyResearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
