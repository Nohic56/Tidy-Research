const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');

test('job-portal URL keeps its empty application reference', () => {
  const result = C.cleanUrl('https://example.org/candidate-onboarding/13494?application_reference=&utm_source=chatgpt.com');
  assert.equal(result.url, 'https://example.org/candidate-onboarding/13494?application_reference=');
  assert.deepEqual(result.removed, ['utm_source']);
});
test('only tracking query segments change, encoding and fragment remain byte-exact', () => {
  const url = 'https://example.org/P%2f?q=a%20b+c&blank=&UTM_Source=x&x=%2f&x=%2F&bare#utm_source=keep';
  assert.equal(C.cleanUrl(url).url, 'https://example.org/P%2f?q=a%20b+c&blank=&x=%2f&x=%2F&bare#utm_source=keep');
});
test('all tracking parameters, including duplicates and encoded names, are removed', () => {
  assert.equal(C.cleanUrl('https://e.org/?utm_source=a&utm_source=b&%75tm_medium=c&gclid=d#p').url, 'https://e.org/#p');
});
test('functional ref, source, identifiers, query and arbitrary text are preserved', () => {
  const url = 'https://e.org/?ref=abc&source=app&id=42&q=utm_source%3Dx&application_reference=';
  assert.equal(C.cleanUrl(url).url, url);
});
test('every supported click identifier is removed', () => {
  for (const key of C.TRACKING) assert.equal(C.cleanUrl('https://e.org/?' + key + '=123').url, 'https://e.org/');
});
test('recognised signed and auth URLs are not modified', () => {
  for (const key of ['X-Amz-Signature', 'X-Goog-Credential', 'sig', 'token', 'access_token', 'code', 'state', 'SAMLRequest', 'RelayState', 'Expires', 'Policy', 'Key-Pair-Id']) {
    const url = 'https://e.org/?utm_source=x&' + key + '=secret';
    assert.equal(C.cleanUrl(url).reason, 'protected', key);
    assert.equal(C.cleanUrl(url).url, url, key);
  }
});
test('unsupported or credential-bearing addresses are left unchanged', () => {
  for (const url of ['about:config', 'file:///tmp/a?utm_source=x', 'mailto:a@b.org', 'not a URL', 'https://u:password@e.org/?utm_source=x']) {
    assert.equal(C.cleanUrl(url).url, url);
    assert.equal(C.cleanUrl(url).reason, 'unsupported');
  }
});
test('malformed query escapes do not crash cleanup', () => {
  assert.equal(C.cleanUrl('https://e.org/?bad%=x&utm_source=z').url, 'https://e.org/?bad%=x');
});
test('pause matches exact host and subdomains but not suffix lookalikes', () => {
  assert(C.isExcluded('a.example.org', ['example.org']));
  assert(!C.isExcluded('notexample.org', ['example.org']));
  assert(!C.isExcluded('example.org.attacker.org', ['example.org']));
  assert.equal(C.cleanUrl('https://a.example.org/?utm_source=x', { excludedHosts: ['example.org'] }).reason, 'excluded');
});
test('cleaner is idempotent over a broad fixture set', () => {
  const bits = ['utm_source=x', 'id=2', 'q=a%20b', 'empty=', 'fbclid=3', 'bare', 'ref=4', '', '%75tm_campaign=c'];
  for (let mask = 0; mask < 512; mask++) {
    const url = 'https://example.org/?' + bits.filter((_, index) => mask & (1 << index)).join('&') + '#x';
    const first = C.cleanUrl(url);
    assert.equal(C.cleanUrl(first.url).url, first.url);
    assert.equal(C.cleanUrl(first.url).removed.length, 0);
  }
});
test('recognises six and ten character UniProt accessions and isoforms', () => {
  for (const query of ['P04637', 'Q9Y6K9', 'A2BC19', 'A0A023GPI8', 'p04637-2']) assert.equal(C.identify(query).kind, 'accession', query);
  for (const query of ['APC3', 'P1234', 'P046370', 'A0A023GPI88', 'P04637-0', 'hello P04637']) assert.notEqual(C.identify(query).kind, 'accession', query);
});
test('entry name is a candidate search, not falsely treated as a verified entry', () => {
  assert.equal(C.identify('CDC27_HUMAN').kind, 'entry-name');
  assert.equal(C.searchUrl('uniprot', 'CDC27_HUMAN'), 'https://www.uniprot.org/uniprotkb?query=id%3ACDC27_HUMAN');
});
test('research query encoding cannot inject URL parameters or protocols', () => {
  assert.equal(C.searchUrl('pubmed', 'a & b#c'), 'https://pubmed.ncbi.nlm.nih.gov/?term=a%20%26%20b%23c');
  assert(C.searchUrl('uniprot', 'javascript:alert(1)').startsWith('https://www.uniprot.org/uniprotkb?query='));
  assert.throws(() => C.searchUrl('unknown', 'x'));
  assert.throws(() => C.searchUrl('pubmed', ' '));
});
test('only supported search providers yield a query', () => {
  for (const url of ['https://duckduckgo.com/?q=APC%2FC', 'https://www.google.nl/search?q=APC%2FC', 'https://html.duckduckgo.com/html/?q=APC%2FC']) assert.equal(C.searchQuery(url), 'APC/C');
  for (const url of ['https://duckduckgo.com.attacker.org/?q=secret', 'https://e.org/?q=x', 'https://www.google.com/maps?q=x']) assert.equal(C.searchQuery(url), '');
});
test('settings normalise and deduplicate site exceptions', () => {
  assert.deepEqual(C.settings({ excludedHosts: ['EXAMPLE.org', 'https://example.org/path', 'sub.example.org.'] }).excludedHosts, ['example.org', 'sub.example.org']);
  assert.throws(() => C.settings({ excludedHosts: ['*.example.org'] }));
  assert.throws(() => C.normaliseHost('javascript:alert(1)'));
  assert.equal(C.settings({ autoClean: 'no' }).autoClean, true);
});
