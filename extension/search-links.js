(function () {
  "use strict";
  const Core = globalThis.TidyResearch;
  const ID = "tidy-research-shortcuts";
  let enabled = true;
  let scheduled = false;
  let currentQuery = "";
  let host;
  function render() {
    scheduled = false;
    const query = Core.searchQuery(location.href);
    if (!enabled || !query) {
      host?.remove(); currentQuery = ""; return;
    }
    if (host?.isConnected && currentQuery === query) return;
    host?.remove();
    currentQuery = query;
    host = document.createElement("div");
    host.id = ID;
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host {display:block;position:relative;z-index:1;clear:both;color-scheme:light dark;}
      nav {box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:8px;
        padding:10px 18px;background:light-dark(#f2f7f6,#182725);border-bottom:1px solid light-dark(#dbe8e5,#38514b);
        font:13px/1.4 system-ui,sans-serif;color:light-dark(#38534e,#bcd7cd);}
      span {font-weight:600;margin-right:4px;}
      a {text-decoration:none;color:light-dark(#105e58,#9de0d1);border:1px solid light-dark(#c6dcd5,#46665c);
        border-radius:20px;padding:5px 11px;background:light-dark(#fff,#20362e);font-weight:600;}
      a:hover {background:light-dark(#e1eee9,#315044);}
      a:focus-visible,button:focus-visible {outline:3px solid #d49b2f;outline-offset:3px;}
      button {margin-left:auto;border:0;background:transparent;color:inherit;padding:7px;cursor:pointer;font:inherit;}
    `;
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Tidy Research shortcuts");
    const title = document.createElement("span");
    title.textContent = "Tidy Research";
    nav.append(title);
    for (const [provider, label] of [["uniprot", "UniProt"], ["pubmed", "PubMed"], ["maps", "Maps"]]) {
      const link = document.createElement("a");
      link.textContent = provider === "uniprot" && Core.identify(query).kind === "accession" ? "UniProt entry ↗" : label + " ↗";
      link.href = Core.searchUrl(provider, query);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "Send this query to " + label + " in a new tab";
      nav.append(link);
    }
    const hide = document.createElement("button");
    hide.textContent = "×";
    hide.type = "button";
    hide.setAttribute("aria-label", "Hide research shortcuts on this page");
    hide.addEventListener("click", () => { enabled = false; host.remove(); });
    nav.append(hide);
    shadow.append(style, nav);
    // An independent strip avoids Google/DDG's changing internal tab selectors.
    // Place it after their header so it does not push a sticky header over results.
    const header = document.querySelector("header, #searchform");
    if (header?.parentNode && header.closest("body")) header.after(host);
    else document.body.prepend(host);
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(render); }
  }
  browser.storage.local.get("settings").then(data => {
    enabled = Core.settings(data.settings).searchLinks;
    render();
    // Observe DOM replacement, but render exits immediately while the strip
    // and query are unchanged. Never scan result text.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }).catch(() => {});
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) { enabled = Core.settings(changes.settings.newValue).searchLinks; schedule(); }
  });
  window.addEventListener("popstate", schedule);
  // Same-document search navigation is detected without patching the site's JS.
  let previous = location.href;
  const timer = setInterval(() => {
    if (location.href !== previous) { previous = location.href; schedule(); }
  }, 1000);
  window.addEventListener("pagehide", event => { if (!event.persisted) clearInterval(timer); });
})();
