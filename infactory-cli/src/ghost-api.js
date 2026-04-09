/**
 * ghost-api.js — Ghost Admin API Client für inFactory CLI
 *
 * Erstellt Pages, Posts, lädt Bilder hoch.
 * Nutzt den JWT-Generator aus deploy.js.
 */

'use strict';

const https = require('https');
const http  = require('http');
const { generateJWT } = require('./deploy');
const { htmlToLexical } = require('./html-to-lexical');

/**
 * Ghost Admin API Request
 */
function ghostRequest(method, baseUrl, adminKey, endpoint, body = null) {
  const [keyId, keySecret] = adminKey.split(':');
  const token = generateJWT(keyId, keySecret);
  const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;

  const headers = {
    'Authorization':  `Ghost ${token}`,
    'Content-Type':   'application/json',
    'Accept':         'application/json',
    'Accept-Version': 'v5.0',
  };

  const bodyStr = body ? JSON.stringify(body) : null;
  if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed_data;
        try { parsed_data = JSON.parse(data); } catch { parsed_data = data; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed_data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed_data, null, 2)}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Ghost Page erstellen oder aktualisieren
 */
async function createPage(baseUrl, adminKey, pageData) {
  const { title, slug, html, feature_image, custom_excerpt, status, meta_title, meta_description, tags } = pageData;

  // Prüfe ob Page mit diesem Slug bereits existiert
  try {
    const existing = await ghostRequest('GET', baseUrl, adminKey,
      `/ghost/api/admin/pages/slug/${slug}/`);

    if (existing && existing.pages && existing.pages[0]) {
      const page = existing.pages[0];
      console.log(`  ↻  Page "${slug}" existiert — Update (id: ${page.id})`);

      const updateBody = {
        pages: [{
          title,
          ...htmlToLexical(html),
          feature_image: feature_image || page.feature_image,
          custom_excerpt: custom_excerpt || page.custom_excerpt,
          status: status || page.status,
          meta_title: meta_title || page.meta_title,
          meta_description: meta_description || page.meta_description,
          tags: tags || page.tags,
          updated_at: page.updated_at,
        }]
      };

      const result = await ghostRequest('PUT', baseUrl, adminKey,
        `/ghost/api/admin/pages/${page.id}/`, updateBody);
      return result.pages[0];
    }
  } catch (e) {
    // Page existiert nicht — erstellen
  }

  console.log(`  +  Page "${slug}" erstellen...`);
  const createBody = {
    pages: [{
      title,
      slug,
      ...htmlToLexical(html),
      feature_image: feature_image || null,
      custom_excerpt: custom_excerpt || null,
      status: status || 'draft',
      meta_title: meta_title || title,
      meta_description: meta_description || custom_excerpt || null,
      tags: tags || [],
    }]
  };

  const result = await ghostRequest('POST', baseUrl, adminKey,
    '/ghost/api/admin/pages/', createBody);
  return result.pages[0];
}

/**
 * Ghost Post erstellen
 */
async function createPost(baseUrl, adminKey, postData) {
  const { title, slug, html, feature_image, custom_excerpt, status, featured, tags } = postData;

  try {
    const existing = await ghostRequest('GET', baseUrl, adminKey,
      `/ghost/api/admin/posts/slug/${slug}/`);
    if (existing && existing.posts && existing.posts[0]) {
      const post = existing.posts[0];
      console.log(`  ↻  Post "${slug}" existiert — Update (id: ${post.id})`);
      const updateBody = {
        posts: [{
          title, ...htmlToLexical(html),
          feature_image: feature_image || post.feature_image,
          custom_excerpt: custom_excerpt || post.custom_excerpt,
          status: status || post.status,
          featured: featured !== undefined ? featured : post.featured,
          tags: tags || post.tags,
          updated_at: post.updated_at,
        }]
      };
      const result = await ghostRequest('PUT', baseUrl, adminKey,
        `/ghost/api/admin/posts/${post.id}/`, updateBody);
      return result.posts[0];
    }
  } catch (e) {}

  console.log(`  +  Post "${slug}" erstellen...`);
  const createBody = {
    posts: [{
      title, slug, ...htmlToLexical(html),
      feature_image: feature_image || null,
      custom_excerpt: custom_excerpt || null,
      status: status || 'draft',
      featured: featured || false,
      tags: tags || [],
    }]
  };

  const result = await ghostRequest('POST', baseUrl, adminKey,
    '/ghost/api/admin/posts/', createBody);
  return result.posts[0];
}

// htmlToLexical() imported from ./html-to-lexical.js
// Converts HTML to proper Lexical nodes (paragraph, heading, image, list, etc.)
// instead of the old Monoblock-Hack (entire HTML in one html-Card).

module.exports = { ghostRequest, createPage, createPost, htmlToLexical };
