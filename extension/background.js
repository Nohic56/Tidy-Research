/* Firefox MV3 event page: register listeners synchronously on every wake. */
"use strict";
const Core = globalThis.TidyResearch;
let settingsPromise = browser.storage.local.get("settings").then(data => Core.settings(data.settings));
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) settingsPromise = Promise.resolve(Core.settings(changes.settings.newValue));
});
const entryKey = tabId => "tab:" + tabId;
const readEntry = async tabId => (await browser.storage.session.get(entryKey(tabId)))[entryKey(tabId)];
const writeEntry = (tabId, entry) => browser.storage.session.set({ [entryKey(tabId)]: entry });
const EXPIRY = 10 * 60 * 1000;
async function intercept(details) {
  if (details.tabId < 0 || details.method !== "GET") return {};
  try {
    const config = await settingsPromise;
    if (!config.autoClean) return {};
    const previous = await readEntry(details.tabId);
    if (previous?.bypass === details.url && previous.bypassUntil > Date.now()) {
      // Keep the exact bypass until it expires: browser redirects/HSTS can
      // produce more than one request for the original URL.
      return {};
    }
    const cleaned = Core.cleanUrl(details.url, config);
    if (!cleaned.removed.length) return {};
    const count = previous?.requestId === details.requestId ? (previous.redirects || 0) + 1 : 1;
    if (count > 3) return {}; // Stop a site that repeatedly restores a tracker.
    await writeEntry(details.tabId, {
      original: details.url, cleaned: cleaned.url, removed: cleaned.removed,
      timestamp: Date.now(), requestId: details.requestId, redirects: count
    });
    return { redirectUrl: cleaned.url };
  } catch { return {}; } // A cleaner failure must not block navigation.
}
browser.webRequest.onBeforeRequest.addListener(intercept,
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["blocking"]);

async function setBadge(tabId, url) {
  try {
    const config = await settingsPromise;
    const cleaned = Core.cleanUrl(url, config);
    const entry = await readEntry(tabId);
    const recent = entry?.cleaned === url && Date.now() - entry.timestamp < EXPIRY;
    const text = cleaned.removed.length ? "•" : recent ? String(entry.removed.length) : "";
    await browser.action.setBadgeText({ tabId, text });
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#126d68" });
  } catch { /* Tab may have closed. */ }
}
browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === "complete") void setBadge(tabId, change.url || tab.url);
});
browser.tabs.onRemoved.addListener(tabId => { void browser.storage.session.remove(entryKey(tabId)); });

function createMenus() {
  browser.contextMenus.create({ id: "tidy-copy", title: "Copy clean link", contexts: ["link"] });
  browser.contextMenus.create({ id: "tidy-copy-page", title: "Copy clean page address", contexts: ["page"] });
  browser.contextMenus.create({ id: "tidy-research", title: "Research selection", contexts: ["selection"] });
  for (const [provider, label] of [["uniprot", "UniProt"], ["pubmed", "PubMed"], ["maps", "Google Maps"]]) {
    browser.contextMenus.create({ id: "tidy-" + provider, parentId: "tidy-research", title: label, contexts: ["selection"] });
  }
}
browser.runtime.onInstalled.addListener(async () => {
  await browser.contextMenus.removeAll();
  createMenus();
});
browser.contextMenus.onClicked.addListener(async info => {
  try {
    if (info.menuItemId === "tidy-copy" || info.menuItemId === "tidy-copy-page") {
      const config = await settingsPromise;
      await navigator.clipboard.writeText(Core.cleanUrl(info.linkUrl || info.pageUrl, config).url);
    } else if (["tidy-uniprot", "tidy-pubmed", "tidy-maps"].includes(info.menuItemId)) {
      await browser.tabs.create({ url: Core.searchUrl(info.menuItemId.slice(5), info.selectionText || "") });
    }
  } catch (error) { console.warn("Tidy Research action failed:", error.message); }
});

browser.omnibox.setDefaultSuggestion({ description: "UniProt lookup — accession, entry name, or protein search (Enter to open)" });
browser.omnibox.onInputChanged.addListener((text, suggest) => {
  if (!text.trim()) return;
  const match = Core.identify(text);
  const description = match.kind === "accession" ? "Open UniProt accession" : "Search UniProt";
  // Do not echo user input into the XML-like description field.
  suggest([
    { content: "uniprot " + text, description },
    { content: "pubmed " + text, description: "Search PubMed instead" },
    { content: "maps " + text, description: "Search Google Maps instead" }
  ]);
});
browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
  try {
    const match = /^(uniprot|pubmed|maps)\s+(.+)$/is.exec(text);
    const url = Core.searchUrl(match ? match[1].toLowerCase() : "uniprot", match ? match[2] : text);
    if (disposition === "currentTab") await browser.tabs.update({ url });
    else await browser.tabs.create({ url, active: disposition !== "newBackgroundTab" });
  } catch { /* Empty input or dismissed lookup. */ }
});

async function cleanCurrent(tabId) {
  const tab = await browser.tabs.get(tabId);
  const config = await settingsPromise;
  const cleaned = Core.cleanUrl(tab.url, config);
  if (!cleaned.removed.length) return cleaned;
  const results = await browser.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: (expected, replacement) => {
      if (location.href !== expected) return false;
      history.replaceState(history.state, "", replacement);
      return location.href === replacement;
    }, args: [tab.url, cleaned.url]
  });
  if (!results[0]?.result) throw new Error("The page changed. Reopen this popup and try again.");
  await writeEntry(tabId, { original: tab.url, cleaned: cleaned.url, removed: cleaned.removed, timestamp: Date.now() });
  await setBadge(tabId, cleaned.url);
  return cleaned;
}
browser.runtime.onMessage.addListener((message, sender) => {
  // Privileged actions are accepted only from bundled UI pages, never content scripts.
  if (sender.id !== browser.runtime.id || ![browser.runtime.getURL("popup.html"), browser.runtime.getURL("options.html")].includes(sender.url)) return undefined;
  return (async () => {
    try {
      if (message.type === "getState") {
        const config = await settingsPromise;
        const tab = await browser.tabs.get(message.tabId);
        const cleaned = Core.cleanUrl(tab.url || "", config);
        const entry = await readEntry(tab.id);
        const undo = entry?.cleaned === tab.url && Date.now() - entry.timestamp < EXPIRY ? entry : null;
        return { config, cleaned, undo, url: tab.url || "" };
      }
      if (message.type === "cleanCurrent") return await cleanCurrent(message.tabId);
      if (message.type === "restore") {
        const entry = await readEntry(message.tabId);
        const tab = await browser.tabs.get(message.tabId);
        if (!entry || entry.cleaned !== tab.url || Date.now() - entry.timestamp > EXPIRY) throw new Error("The original address is no longer available for this page.");
        await writeEntry(message.tabId, { ...entry, bypass: entry.original, bypassUntil: Date.now() + 30000 });
        await browser.tabs.update(message.tabId, { url: entry.original });
        return { restored: true };
      }
      if (message.type === "setSettings") {
        const config = Core.settings({ ...await settingsPromise, ...message.patch });
        await browser.storage.local.set({ settings: config });
        settingsPromise = Promise.resolve(config);
        return { config };
      }
      return { error: "Unknown action." };
    } catch (error) { return { error: error.message || "This action is unavailable on this page." }; }
  })();
});
