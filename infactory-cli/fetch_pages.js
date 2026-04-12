'use strict';

const fs     = require('fs');
const crypto = require('crypto');
const https  = require('https');

function b64url(str) { return Buffer.from(str).toString('base64url'); }

function generateJWT(keyId, keySecret) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: keyId }));
  const payload = b64url(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' }));
  const sig = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', Buffer.from(keySecret, 'hex')).update(sig).digest('base64url');
  return `${sig}.${signature}`;
}

function ghostGet(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, port: 443, path, method: 'GET', headers: {
      'Authorization': `Ghost ${token}`, 'Accept': 'application/json', 'Accept-Version': 'v5.0',
    }}, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function categorize(items) {
  const htmlOnly = [], native = [];
  for (const item of items) {
    if (!item.lexical) { htmlOnly.push(item); continue; }
    try {
      const lex = JSON.parse(item.lexical);
      const types = (lex.root?.children || []).map(c => c.type);
      (types.every(t => t === 'html') ? htmlOnly : native).push(item);
    } catch { htmlOnly.push(item); }
  }
  return { htmlOnly, native };
}

function printItem(label, item) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${label}: "${item.title}" (slug: ${item.slug})`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\n--- LEXICAL JSON ---`);
  if (item.lexical) {
    try { console.log(JSON.stringify(JSON.parse(item.lexical), null, 2)); }
    catch { console.log(item.lexical); }
  } else { console.log('(null/empty)'); }
  console.log(`\n--- HTML ---`);
  console.log(item.html || '(null/empty)');
}

async function main() {
  const keyRaw = fs.readFileSync('/tmp/.dev.ghost_key', 'utf8').trim();
  const [keyId, keySecret] = keyRaw.split(':');
  const token = generateJWT(keyId, keySecret);
  const host = 'dev.steirischursprung.at';

  // Fetch pages
  const pagesRes = await ghostGet(host, '/ghost/api/admin/pages/?limit=all&formats=lexical,html', token);
  console.log(`Pages: HTTP ${pagesRes.status}`);
  const pages = pagesRes.status === 200 ? JSON.parse(pagesRes.body).pages || [] : [];
  console.log(`Total pages: ${pages.length}`);

  const pc = categorize(pages);
  console.log(`Pages HTML-only: ${pc.htmlOnly.length}, Native Lexical: ${pc.native.length}`);

  for (let i = 0; i < pc.native.length; i++) printItem(`NATIVE PAGE ${i+1}`, pc.native[i]);
  for (let i = 0; i < Math.min(3, pc.htmlOnly.length); i++) printItem(`HTML PAGE ${i+1}/${pc.htmlOnly.length}`, pc.htmlOnly[i]);

  // Fetch posts
  const postsRes = await ghostGet(host, '/ghost/api/admin/posts/?limit=all&formats=lexical,html', token);
  console.log(`\n\nPosts: HTTP ${postsRes.status}`);
  const posts = postsRes.status === 200 ? JSON.parse(postsRes.body).posts || [] : [];
  console.log(`Total posts: ${posts.length}`);

  const ptc = categorize(posts);
  console.log(`Posts HTML-only: ${ptc.htmlOnly.length}, Native Lexical: ${ptc.native.length}`);

  for (let i = 0; i < ptc.native.length; i++) printItem(`NATIVE POST ${i+1}`, ptc.native[i]);

  if (ptc.native.length === 0 && ptc.htmlOnly.length > 0) {
    console.log('\nNo native Lexical posts. Showing first 2 HTML-only:');
    for (let i = 0; i < Math.min(2, ptc.htmlOnly.length); i++) printItem(`HTML POST ${i+1}/${ptc.htmlOnly.length}`, ptc.htmlOnly[i]);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
