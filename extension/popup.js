"use strict";
const Core = globalThis.TidyResearch;
const $ = id => document.getElementById(id);
let state;
let tabId;
function notify(text, error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); }
async function request(message) {
  const response = await browser.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || "The extension could not respond. Try reopening this popup.");
  return response;
}
function renderProviders() {
  const query = $("query").value.trim();
  $("providers").replaceChildren();
  const match = Core.identify(query);
  for (const [provider, label] of [["uniprot", "UniProt"], ["pubmed", "PubMed"], ["maps", "Maps"]]) {
    if (!query) {
      const disabled = document.createElement("button"); disabled.type = "button"; disabled.textContent = label; disabled.disabled = true;
      $("providers").append(disabled); continue;
    }
    const link = document.createElement("a");
    link.className = "button";
    link.textContent = label;
    link.href = Core.searchUrl(provider, query);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    $("providers").append(link);
  }
  $("recognition").textContent = match.kind === "accession" ? "UniProt accession format detected → direct entry link." : match.kind === "entry-name" ? "UniProt entry-name format detected → entry-name search." : "Choose where to search. Opens in a new tab.";
}
async function refresh() {
  state = await request({ type: "getState", tabId });
  const { cleaned, config, undo, url } = state;
  const supported = /^https?:\/\//i.test(url);
  $("cleanUrl").textContent = cleaned.url || "Firefox internal page";
  let label = "No recognised tracking fields";
  if (!supported) label = "Cleanup is available on web pages";
  else if (cleaned.reason === "excluded") label = "Paused on this website";
  else if (cleaned.reason === "protected") label = "Protected link — kept unchanged";
  else if (cleaned.reason === "unsupported") label = "Address kept unchanged";
  else if (cleaned.removed.length) label = cleaned.removed.length + " tracking " + (cleaned.removed.length === 1 ? "field" : "fields") + " to remove";
  else if (undo) label = "Cleaned " + undo.removed.length + " tracking " + (undo.removed.length === 1 ? "field" : "fields");
  $("pageStatus").textContent = label;
  $("copy").disabled = !supported;
  $("copy").textContent = cleaned.removed.length || undo ? "Copy clean link" : "Copy link";
  $("clean").disabled = !cleaned.removed.length;
  $("restore").hidden = !undo;
  const removed = cleaned.removed.length ? cleaned.removed : undo?.removed || [];
  $("removedDetails").hidden = !removed.length;
  $("removedNames").textContent = removed.join(", ");
  $("pauseSite").hidden = !supported;
  $("pauseSite").textContent = cleaned.reason === "excluded" ? "Resume on this website" : "Pause on this website";
  $("autoClean").checked = config.autoClean;
  $("searchLinks").checked = config.searchLinks;
}
async function run(task) { try { await task(); } catch (error) { notify(error.message, true); } }
$("copy").addEventListener("click", () => run(async () => {
  await navigator.clipboard.writeText(state.cleaned.url); notify("Copied to clipboard.");
}));
$("clean").addEventListener("click", () => run(async () => {
  await request({ type: "cleanCurrent", tabId }); await refresh(); notify("Address cleaned. The page was not reloaded.");
}));
$("restore").addEventListener("click", () => run(async () => {
  await request({ type: "restore", tabId }); window.close();
}));
$("pauseSite").addEventListener("click", () => run(async () => {
  const host = Core.normaliseHost(state.url);
  const hosts = state.cleaned.reason === "excluded" ? state.config.excludedHosts.filter(item => !(host === item || host.endsWith("." + item))) : [...state.config.excludedHosts, host];
  await request({ type: "setSettings", patch: { excludedHosts: hosts } }); await refresh();
  notify(state.cleaned.reason === "excluded" ? "Automatic cleanup paused for this site and its subdomains." : "Cleanup resumed for this site.");
}));
for (const key of ["autoClean", "searchLinks"]) {
  $(key).addEventListener("change", () => run(async () => {
    await request({ type: "setSettings", patch: { [key]: $(key).checked } }); await refresh(); notify("Setting saved.");
  }));
}
$("query").addEventListener("input", renderProviders);
$("query").addEventListener("keydown", event => {
  if (event.key === "Enter") $("providers").querySelector("a")?.click();
});
$("grantAccess").addEventListener("click", () => run(async () => {
  // Call request directly in this user-gesture handler, before other awaits.
  const granted = await browser.permissions.request({ origins: ["http://*/*", "https://*/*"] });
  $("accessNotice").hidden = granted;
  notify(granted ? "Website access enabled." : "Access was not granted. Manual tools remain available.");
}));
run(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active tab is available.");
  tabId = tab.id;
  await refresh();
  $("query").value = Core.searchQuery(state.url);
  renderProviders();
  $("accessNotice").hidden = await browser.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
});
