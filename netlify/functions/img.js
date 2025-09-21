// netlify/functions/img.js
// Returns: { image: "<url>" } for a given product page.
// Supports: Shopify (products/*.json), generic og:image, and Amazon (landingImage / data-a-dynamic-image).

exports.handler = async (event) => {
  try {
    const dest = decodeURIComponent(event.queryStringParameters?.dest || '').trim();
    if (!dest) {
      return json(400, { error: 'dest required' });
    }

    const url = new URL(dest);
    let image = '';

    // ---------- 1) Shopify shortcut (/products/<handle>.json) ----------
    try {
      const m = url.pathname.match(/\/products\/([^\/?#]+)/i);
      if (m) {
        const r = await fetch(`${url.origin}/products/${m[1]}.json`, {
          headers: uaHeaders()
        });
        if (r.ok) {
          const j = await r.json();
          const imgs = j?.product?.images || [];
          if (imgs.length) {
            image = imgs[0].src || '';
            if (image && image.startsWith('//')) image = 'https:' + image;
          }
        }
      }
    } catch (_) {}

    // ---------- 2) Generic fetch + parse (Amazon and others) ----------
    if (!image) {
      const r = await fetch(dest, { headers: uaHeaders() });
      if (!r.ok) return json(r.status, { error: `Fetch failed (${r.status})` });

      const html = await r.text();

      // (a) Prefer og:image
      image = getMetaContent(html, 'property', 'og:image')
           || getMetaContent(html, 'name', 'twitter:image');

      // (b) Amazon-specific fallbacks
      if ((!image || isAmazon(url.hostname)) && html) {
        // Try <img id="landingImage" ...>
        const landing = matchTag(html, /<img[^>]+id=["']landingImage["'][^>]*>/i);
        if (landing) {
          image = getAttr(landing, 'data-old-hires')
               || pickFromDynamic(landing)
               || getAttr(landing, 'src')
               || image;
        }

        // If still nothing, look anywhere for data-a-dynamic-image on an <img>
        if (!image) {
          const anyImg = matchTag(html, /<img[^>]+data-a-dynamic-image=["'][\s\S]*?["'][^>]*>/i);
          if (anyImg) image = pickFromDynamic(anyImg) || image;
        }

        // Last resort: Amazon meta variants
        if (!image) {
          image = getMetaContent(html, 'name', 'thumbnail')
               || getMetaContent(html, 'property', 'og:image:secure_url')
               || image;
        }
      }

      if (image && image.startsWith('//')) image = 'https:' + image;
    }

    if (!image) return json(404, { image: '' });
    return json(200, { image }, true);
  } catch (err) {
    return json(500, { error: err.message || String(err) });
  }
};

// ---------- helpers ----------
function uaHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9'
  };
}

function json(code, obj, cache = false) {
  return {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': cache ? 'public, max-age=86400' : 'no-store'
    },
    body: JSON.stringify(obj)
  };
}

function isAmazon(host) {
  return /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|com\.mx|com\.au|co\.jp)$/i.test(host);
}

function getMetaContent(html, attrName, attrValue) {
  const re = new RegExp(`<meta[^>]+${attrName}=["']${escapeRe(attrValue)}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? decodeHtml(m[1]) : '';
}

function matchTag(html, regex) {
  const m = html.match(regex);
  return m ? m[0] : '';
}

function getAttr(tag, name) {
  const re = new RegExp(`${name}=["']([^"']+)["']`, 'i');
  const m = tag.match(re);
  return m ? decodeHtml(m[1]) : '';
}

function pickFromDynamic(tag) {
  // data-a-dynamic-image="{"https://...jpg":[1000,1000], "...":[500,500]}"
  let raw = getAttr(tag, 'data-a-dynamic-image');
  if (!raw) return '';
  try {
    raw = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const obj = JSON.parse(raw);
    const urls = Object.entries(obj)
      .map(([u, wh]) => ({ u, w: Array.isArray(wh) ? wh[0] : 0 }))
      .sort((a, b) => b.w - a.w);
    return urls.length ? urls[0].u : '';
  } catch { return ''; }
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
