/* Optional Firefox integration + UI checks. No external website requests.
 * npm ci; npx playwright install firefox; npm run test:browser
 * TIDY_TEST_CONTAINER=1 disables child sandboxes only in a disposable test
 * browser when the container itself cannot create nested user namespaces.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { firefox } = require('playwright');
const root = path.resolve(__dirname, '..');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tidy-firefox-'));
  const resultsDir = path.join(root, 'test-results');
  await fs.mkdir(resultsDir, { recursive: true });
  const requests = [];
  let finishReport;
  const reportPromise = new Promise(resolve => { finishReport = resolve; });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/report') {
      let body = ''; for await (const chunk of req) body += chunk;
      finishReport(JSON.parse(body)); res.end('ok'); return;
    }
    if (url.pathname.startsWith('/ui/')) {
      const relative = url.pathname.slice(4);
      if (!/^[a-zA-Z0-9/._-]+$/.test(relative) || relative.includes('..')) { res.writeHead(400); res.end(); return; }
      try {
        const content = await fs.readFile(path.join(root, 'extension', relative));
        res.setHeader('Content-Type', types[path.extname(relative)] || 'text/plain'); res.end(content);
      } catch { res.writeHead(404); res.end(); }
      return;
    }
    requests.push({ method: req.method, path: req.url });
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><title>Local extension test</title></head><body><h1>Research fixture</h1><input id="formValue" value="initial"><form method="post" action="/post?utm_source=keep"><button id="submit">Submit</button></form></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  let remote;
  let watchdog;
  try {
    const extension = path.join(temp, 'extension');
    await fs.cp(path.join(root, 'extension'), extension, { recursive: true });
    const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'));
    manifest.background.scripts.push('qa-only.js');
    await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    // This extra script exists only in the disposable test copy, never in dist.
    const qa = `
      (async()=>{
        const tests=[];
        const base=${JSON.stringify(origin)};
        const check=(name,condition)=>{if(!condition)throw Error(name);tests.push(name)};
        const loaded=async(url)=>{
          const tab=await browser.tabs.create({url});
          await new Promise(r=>setTimeout(r,250));
          for(let i=0;i<100;i++){
            const current=await browser.tabs.get(tab.id);
            if(current.status==='complete' && current.url!=='about:blank') return current;
            await new Promise(r=>setTimeout(r,80));
          }
          throw Error('Page did not load: '+url);
        };
        try {
          await settingsPromise;
          const auto=await loaded(base+'/auto?application_reference=&utm_source=chatgpt.com');
          check('automatic GET cleanup in Firefox',auto.url===base+'/auto?application_reference=');
          await browser.storage.local.set({settings:{autoClean:false,searchLinks:true,excludedHosts:[]}});
          await new Promise(r=>setTimeout(r,100));
          const manual=await loaded(base+'/manual?id=42&utm_source=x');
          check('off switch preserves navigation URL',manual.url.includes('utm_source=x'));
          await browser.scripting.executeScript({target:{tabId:manual.id},func:()=>{document.querySelector('#formValue').value='keep this form';history.replaceState({marker:123},'',location.href)}});
          await cleanCurrent(manual.id);
          const after=await browser.scripting.executeScript({target:{tabId:manual.id},func:()=>({href:location.href,value:document.querySelector('#formValue').value,marker:history.state.marker})});
          check('manual cleanup preserves the form and history state',after[0].result.href===base+'/manual?id=42'&&after[0].result.value==='keep this form'&&after[0].result.marker===123);
          await browser.storage.local.set({settings:{autoClean:true,searchLinks:true,excludedHosts:[]}});
          await new Promise(r=>setTimeout(r,100));
          const protectedTab=await loaded(base+'/protected?token=sample&utm_source=keep');
          check('protected link is unchanged',protectedTab.url.includes('utm_source=keep'));
          await browser.scripting.executeScript({target:{tabId:protectedTab.id},func:()=>document.querySelector('#submit').click()});
          for(let i=0;i<50;i++){const t=await browser.tabs.get(protectedTab.id);if(t.url.includes('/post?'))break;await new Promise(r=>setTimeout(r,80))}
          await browser.storage.local.set({settings:{autoClean:true,searchLinks:true,excludedHosts:['127.0.0.1']}});
          await new Promise(r=>setTimeout(r,100));
          const paused=await loaded(base+'/paused?utm_source=keep');
          check('site exception preserves the URL',paused.url.includes('utm_source=keep'));
          await fetch(base+'/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passed:true,tests})});
        }catch(error){await fetch(base+'/report',{method:'POST',body:JSON.stringify({passed:false,tests,error:error.message})})}
      })();`;
    await fs.writeFile(path.join(extension, 'qa-only.js'), qa);
    const webExtRoot = process.env.TIDY_WEB_EXT_ROOT || path.dirname(require.resolve('web-ext/package.json'));
    const { connectWithMaxRetries, findFreeTcpPort } = await import(pathToFileURL(path.join(webExtRoot, 'lib/firefox/remote.js')));
    const port = await findFreeTcpPort();
    const env = { ...process.env };
    const prefs = { 'devtools.debugger.remote-enabled': true, 'devtools.chrome.enabled': true, 'devtools.debugger.prompt-connection': false, 'devtools.debugger.force-local': true };
    if (process.env.TIDY_TEST_CONTAINER === '1') {
      Object.assign(env, { MOZ_DISABLE_CONTENT_SANDBOX: '1', MOZ_DISABLE_RDD_SANDBOX: '1', MOZ_DISABLE_SOCKET_PROCESS_SANDBOX: '1', MOZ_DISABLE_UTILITY_SANDBOX: '1' });
      prefs['security.sandbox.content.level'] = 0;
    }
    browser = await firefox.launchPersistentContext(path.join(temp, 'profile'), { headless: true, env, firefoxUserPrefs: prefs, args: ['-start-debugger-server', String(port)] });
    watchdog = setTimeout(() => { void browser.close(); finishReport({ passed: false, error: 'Firefox test timed out' }); }, 35000);
    remote = await connectWithMaxRetries({ port, maxRetries:40 });
    await remote.installTemporaryAddon(extension);
    const report = await reportPromise;
    if (!report.passed) console.log('Firefox failure:', report, 'Requests:', requests);
    assert(report.passed, report.error);
    assert(requests.some(r => r.path === '/auto?application_reference='));
    assert(!requests.some(r => r.path.includes('/auto?') && r.path.includes('utm_source')));
    assert(requests.some(r => r.method === 'POST' && r.path === '/post?utm_source=keep'));
    report.tests.push('POST URL is preserved on the real request');
    console.log('Real Firefox integration:', report);
    remote.disconnect(); remote = null;
    await browser.close(); browser = null;
    clearTimeout(watchdog);

    // UI exercise in a normal Firefox web page with mocked extension APIs.
    // Does not claim to automate native toolbar or permission-prompt surfaces.
    browser = await firefox.launch({ headless: true, env, firefoxUserPrefs: prefs });
    const context = await browser.newContext({ viewport: { width: 440, height: 850 } });
    await context.addInitScript(() => {
      const mock = { url: 'https://example.org/application?application_reference=&utm_source=chatgpt.com', config: { autoClean:true,searchLinks:true,excludedHosts:[] }, undo:null, copied:'' };
      window.__tidyMock = mock;
      window.browser = {
        tabs: { query: async()=>[{id:77,url:mock.url}] },
        permissions: { contains:async()=>true,request:async()=>true },
        storage: { local: { get:async()=>({settings:mock.config}) },onChanged:{listeners:[],addListener(fn){this.listeners.push(fn)}} },
        runtime: { sendMessage:async message=>{
          const C=window.TidyResearch;
          if(message.type==='getState')return {url:mock.url,config:mock.config,cleaned:C.cleanUrl(mock.url,mock.config),undo:mock.undo};
          if(message.type==='cleanCurrent'){const cleaned=C.cleanUrl(mock.url,mock.config);mock.undo={removed:cleaned.removed};mock.url=cleaned.url;return cleaned}
          if(message.type==='setSettings'){mock.config=C.settings({...mock.config,...message.patch});return {config:mock.config}}
        } }
      };
      const originalAttach=Element.prototype.attachShadow;
      Element.prototype.attachShadow=function(options){const shadow=originalAttach.call(this,options);window.__tidyShadow=shadow;return shadow};
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{mock.copied=value}}});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.goto(origin+'/ui/popup.html');
    await page.locator('#copy:not([disabled])').waitFor();
    await page.locator('#query').fill('P04637');
    assert.equal(await page.locator('#providers a').first().getAttribute('href'),'https://www.uniprot.org/uniprotkb/P04637/entry');
    await page.locator('#copy').click();
    assert.equal(await page.evaluate(()=>window.__tidyMock.copied),'https://example.org/application?application_reference=');
    await page.screenshot({path:path.join(resultsDir,'popup-light.png'),clip:{x:0,y:0,width:384,height:Math.ceil(await page.locator('body').evaluate(el=>el.scrollHeight))}});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:path.join(resultsDir,'popup-dark.png'),clip:{x:0,y:0,width:384,height:Math.ceil(await page.locator('body').evaluate(el=>el.scrollHeight))}});
    await page.locator('#clean').click();
    assert.equal(await page.locator('#restore').isVisible(),true);
    assert.equal(await page.locator('#clean').isDisabled(),true);
    await page.setViewportSize({width:1050,height:1000});
    await page.emulateMedia({colorScheme:'light'});
    await page.goto(origin+'/ui/options.html');
    await page.locator('#testUrl').fill('https://e.org/?id=42&utm_source=chatgpt.com');
    assert((await page.locator('#testResult').textContent()).startsWith('https://e.org/?id=42'));
    await page.locator('#excludedHosts').fill('example.org');
    await page.locator('button[type=submit]').click();
    assert.equal(await page.locator('#message').textContent(),'Preferences saved.');
    await page.screenshot({path:path.join(resultsDir,'options.png'),fullPage:true});
    await page.route('https://duckduckgo.com/**', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><header style="padding:24px;font:20px system-ui">Search fixture</header><main style="padding:24px;font:16px system-ui"><h1>P04637</h1><p>Local test content. No search query was transmitted.</p></main>'}));
    await page.goto('https://duckduckgo.com/?q=P04637');
    await page.addScriptTag({path:path.join(root,'extension/core.js')});
    await page.addScriptTag({path:path.join(root,'extension/search-links.js')});
    await page.locator('#tidy-research-shortcuts').waitFor();
    assert.equal(await page.evaluate(()=>window.__tidyShadow.querySelector('a').href),'https://www.uniprot.org/uniprotkb/P04637/entry');
    await page.screenshot({path:path.join(resultsDir,'search-strip-fixture.png')});
    await page.evaluate(()=>history.pushState({},'', '/?q=cyclin+B+Xenopus'));
    await page.waitForFunction(()=>window.__tidyShadow.querySelector('a').href.includes('cyclin%20B%20Xenopus'));
    await page.evaluate(()=>window.__tidyShadow.querySelector('button').click());
    assert.equal(await page.locator('#tidy-research-shortcuts').count(),0);
    assert.deepEqual(errors,[]);
    report.ui='Firefox-rendered popup/options with mocked extension APIs: copy, lookup, manual clean, settings, preview and search-strip updates passed; no page errors.';
    await fs.writeFile(path.join(resultsDir,'browser-report.json'),JSON.stringify(report,null,2));
    console.log(report.ui);
  } finally {
    clearTimeout(watchdog);
    remote?.disconnect();
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
