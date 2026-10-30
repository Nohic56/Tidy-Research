"use strict";
const Core = globalThis.TidyResearch;
const $ = id => document.getElementById(id);
let config = Core.settings();
function notify(text, error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); }
function preview() {
  const input = $("testUrl").value.trim();
  if (!input) { $("testResult").textContent = "Paste a link to see the result."; return; }
  const result = Core.cleanUrl(input, config);
  const label = result.reason === "protected" ? "Protected link: unchanged" : result.reason === "excluded" ? "Paused website: unchanged" : result.reason === "unsupported" ? "Enter an http(s) URL" : result.removed.length ? "Removed " + result.removed.join(", ") : "No recognised tracking fields";
  $("testResult").textContent = result.url + "\n" + label;
}
$("preferences").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const excludedHosts = $("excludedHosts").value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(Core.normaliseHost);
    const patch = { autoClean: $("autoClean").checked, searchLinks: $("searchLinks").checked, excludedHosts };
    const result = await browser.runtime.sendMessage({ type: "setSettings", patch });
    if (!result || result.error) throw new Error(result?.error || "Could not save preferences.");
    config = result.config;
    $("excludedHosts").value = config.excludedHosts.join("\n");
    notify("Preferences saved."); preview();
  } catch (error) { notify(error.message, true); }
});
$("testUrl").addEventListener("input", preview);
browser.storage.local.get("settings").then(data => {
  config = Core.settings(data.settings);
  $("autoClean").checked = config.autoClean;
  $("searchLinks").checked = config.searchLinks;
  $("excludedHosts").value = config.excludedHosts.join("\n");
}).catch(error => notify(error.message, true));
