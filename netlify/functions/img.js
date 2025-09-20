// netlify/functions/img.js
// Returns { image: "<url>" } for a given product page (Shopify store pages supported)

exports.handler = async (event) => {
  try {
    const dest = decodeURIComponent(event.queryStringParameters?.dest || '');
    if (!dest) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'dest required' }) };
    }

    const url = new URL(dest);
    let image = '';

    // Try Shopify product JSON first: /products/<handle>.json
    try {
      const handleMatch = url.pathname.match(/\/products\/([^\/?#]+)/i);
      if (handleMatch) {
        const jsonUrl = `${url.origin}/products/${handleMatch[1]}.json`;
        const r = await fetch(jsonUrl, { headers: { 'user-agent': 'Mozilla/5.0' } });
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

    // Fallback: parse <meta property="og:image" content="...">
    if (!image) {
      const r = await fetch(dest, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const html = await r.text();
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (m) {
        image = m[1];
        if (image.startsWith('//')) image = 'https:' + image;
      }
    }

    if (!image) {
      return { statusCode: 404, headers: cors({ cache: false }), body: JSON.stringify({ image: '' }) };
    }

    return {
      statusCode: 200,
      headers: cors({ json: true }),
      body: JSON.stringify({ image }),
    };
  } catch (err) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
  }
};

function cors({ json = false, cache = true } = {}) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cache ? 'public, max-age=86400' : 'no-store',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
