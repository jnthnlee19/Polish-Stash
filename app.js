// ==================== Data loader ====================
async function loadJson(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}
async function loadData() {
  const [diva, canni, dnd, extras] = await Promise.all([
    loadJson('./data/dnd-diva.json'),
    loadJson('./data/canni.json'),
    loadJson('./data/dnd.json'),       // <-- NEW
    loadJson('./data/extras.json')
  ]);
  return [...diva, ...canni, ...dnd, ...extras];
}

// ==================== Supabase (for cloud sync) ====================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- PASTE THE SAME VALUES YOU USED IN account.js ---
const SUPABASE_URL = 'https://kgghfsnawrddnvssxham.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2hmc25hd3JkZG52c3N4aGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzODkwMjgsImV4cCI6MjA3Mzk2NTAyOH0.RtTZhVPeoxhamYxczVf-crkG8_jIBBpIJlfz9rvjCIg';


const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function currentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch { return null; }
}
async function fetchCloudCodes(userId) {
  const { data, error } = await supabase.from('inventory').select('code').eq('user_id', userId);
  if (error) { console.warn('cloud fetch error', error); return []; }
  return Array.from(new Set((data || []).map(r => String(r.code))));
}
// Replace cloud set with current set (delete all, then insert)
async function replaceCloudCodes(userId, codesIterable) {
  const del = await supabase.from('inventory').delete().eq('user_id', userId);
  if (del.error) throw new Error(del.error.message || 'Delete failed');
  const rows = [...codesIterable].map(code => ({ user_id: userId, code: String(code) }));
  if (!rows.length) return;
  const ins = await supabase.from('inventory').insert(rows);
  if (ins.error) throw new Error(ins.error.message || 'Insert failed');
}
// Per-item helpers (when toggling)
async function upsertCloudCode(userId, code) {
  try { await supabase.from('inventory').upsert({ user_id: userId, code: String(code) }); } catch(e){ console.warn('cloud upsert error', e); }
}
async function deleteCloudCode(userId, code) {
  try { await supabase.from('inventory').delete().eq('user_id', userId).eq('code', String(code)); } catch(e){ console.warn('cloud delete error', e); }
}

// ==================== Local Storage (owned) ====================
const LS_OWNED = 'polish-stash-owned';
(function migrateOwned() {
  const raw = JSON.parse(localStorage.getItem(LS_OWNED) || '[]');
  const migrated = Array.from(new Set(raw.map(c => {
    const s = String(c || '').trim();
    return /^\d+$/.test(s) && s.length < 3 ? s.padStart(3, '0') : s; // only pad pure digits
  })));
  localStorage.setItem(LS_OWNED, JSON.stringify(migrated));
})();
const ownedSet = new Set(JSON.parse(localStorage.getItem(LS_OWNED) || '[]'));
function saveOwnedLocal() {
  localStorage.setItem(LS_OWNED, JSON.stringify([...ownedSet]));
}

// ==================== DOM ====================
const grid             = document.getElementById('grid');
const stats            = document.getElementById('stats');
const search           = document.getElementById('search');
const filterCollection = document.getElementById('filter-collection');
const showAllBtn       = document.getElementById('show-all');
const showOwnedBtn     = document.getElementById('show-owned');
const saveOwnedBtn     = document.getElementById('save-owned');
const tpl              = document.getElementById('card-tpl');

// ==================== UI State ====================
const state = {
  q: '',
  collection: (filterCollection && filterCollection.value) || 'diva',
  show: 'all', // 'all' | 'owned'
};

let catalog = [];
let user = null;

// ==================== Helpers / IDs ====================
const normalize = (s) => (s || '').toString().toLowerCase();

function slugifyName(name = '') {
  return name.toString().trim().toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function pad3(code) {
  const s = String(code || '').trim();
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s;
}
function asinFromUrl(url = '') {
  const m = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : '';
}
function idForItem(item) {
  if (item.code) return pad3(item.code);
  const url = item.product_url || '';
  const col = (item.collection || 'misc').toLowerCase();
  const asin = asinFromUrl(url);
  if (asin) return `${col}:${asin}`;
  const slug = slugifyName(item.name || '');
  return `${col}:${slug || 'item'}`;
}
function isOwnedItem(item) {
  return ownedSet.has(idForItem(item));
}

function matches(item) {
  const hay     = `${idForItem(item)} ${item.code || ''} ${item.name || ''} ${item.collection || ''}`.toLowerCase();
  const okQ     = hay.includes(state.q);
  const okCol   = state.collection === 'all' || item.collection === state.collection;
  const okShow  = state.show === 'all' || (state.show === 'owned' && isOwnedItem(item));
  return okQ && okCol && okShow;
}

const COLLECTION_LABELS = {
  diva: 'Diva Colors',
  gelx: 'Gel X',
  kupa: 'Kupa',
  canni: 'CANNI',        // <-- NEW
  dnd: 'DND Colors',
  dc: 'DC Colors',
  tools: 'Nail Tools',
  essentials: 'Essentials'
};
const collectionLabel = (key) => COLLECTION_LABELS[key] || (key ? key.toUpperCase() : '');

function fmtStats(items) {
  const total    = items.length;
  const owned    = items.filter(isOwnedItem).length;
  const notOwned = total - owned;
  return `Showing ${total} items · Owned: ${owned} · Not owned: ${notOwned}`;
}

// ==================== Affiliate helpers (Amazon) ====================
function ensureHttps(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
function isAmazonHost(hostname = "") {
  return /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|com\.mx|com\.au|co\.jp)$/i.test(hostname);
}
function withAffiliate(u, subtag) {
  try {
    const url = new URL(ensureHttps(u));
    if (isAmazonHost(url.hostname)) {
      if (!url.searchParams.has('tag')) {
        url.searchParams.set('tag', 'polishstash-20'); // <-- your tracking ID
      }
      if (subtag && !url.searchParams.has('ascsubtag')) {
        url.searchParams.set('ascsubtag', subtag);    // optional per-item tracker
      }
    }
    return url.toString();
  } catch {
    return u;
  }
}

// Direct product link (Diva fallback; Amazon gets affiliate applied)
function buildProductUrl(item) {
  const slug = slugifyName(item.name || '');
  const code = pad3(item.code || '');
  return slug && code ? `https://www.dndgel.com/products/${slug}-diva-${code}` : '#';
}
function productLink(item) {
  if (item.product_url) {
    return withAffiliate(item.product_url.trim(), idForItem(item));
  }
  if (item.collection === 'diva') return buildProductUrl(item);
  return '#';
}

// ==================== Product images (serverless) ====================
const imgCache = new Map();
async function fetchProductImage(productUrl) {
  if (!productUrl) return '';
  if (imgCache.has(productUrl)) return imgCache.get(productUrl);
  try {
    const r = await fetch(`/.netlify/functions/img?dest=${encodeURIComponent(productUrl)}`);
    if (!r.ok) throw new Error(`img ${r.status}`);
    const { image } = await r.json();
    const url = image || '';
    imgCache.set(productUrl, url);
    return url;
  } catch (e) {
    console.warn('Image fetch failed:', e);
    imgCache.set(productUrl, '');
    return '';
  }
}
function setSwatchImage(swatch, url) {
  swatch.style.backgroundImage = `url("${url}")`;
  swatch.style.backgroundSize = 'contain';
  swatch.style.backgroundRepeat = 'no-repeat';
  swatch.style.backgroundPosition = 'center';
}

// ==================== Render ====================
function render(items) {
  if (!grid || !tpl) return;

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  items.forEach(item => {
    const node   = tpl.content.cloneNode(true);
    const swatch = node.querySelector('.swatch');
    const nameEl = node.querySelector('.name');
    const codeEl = node.querySelector('.code');
    const buy    = node.querySelector('.buy');
    const owned  = node.querySelector('.owned');

    // Default visual (hex or neutral)
    if (item.hex) {
      swatch.style.background = `linear-gradient(135deg, ${item.hex}, #f3f4f6)`;
    } else {
      swatch.style.background = 'linear-gradient(135deg,#f3f4f6,#e5e7eb)';
    }

    // Prefer explicit image in JSON; else fetch from product page
    if (item.image) {
      setSwatchImage(swatch, item.image);
    } else if (item.product_url) {
      swatch.dataset.productUrl = item.product_url;
      fetchProductImage(item.product_url).then(url => {
        if (url && swatch.dataset.productUrl === item.product_url) setSwatchImage(swatch, url);
      });
    }

    // Meta
    nameEl.textContent = item.name || '';
    const parts = [];
    if (item.code) parts.push(`#${pad3(item.code)}`);
    const label = collectionLabel(item.collection);
    if (label) parts.push(label);
    codeEl.textContent = parts.join(' · ');

    // Buy link
    buy.href = productLink(item);

    // Owned toggle — uses stable id for ALL items
    const id = idForItem(item);
    owned.checked = ownedSet.has(id);
    owned.addEventListener('change', async () => {
      if (owned.checked) {
        ownedSet.add(id);
        if (user) await upsertCloudCode(user.id, id);
      } else {
        ownedSet.delete(id);
        if (user) await deleteCloudCode(user.id, id);
      }
      saveOwnedLocal();
      stats && (stats.textContent = fmtStats(items.filter(matches)));
    });

    frag.appendChild(node);
  });

  grid.appendChild(frag);
  stats && (stats.textContent = fmtStats(items.filter(matches)));
}

// ==================== Business Name injection ====================
function setBusinessName() {
  const target = document.getElementById('custom-site-name');
  if (!target) return;
  const params    = new URLSearchParams(location.search);
  const fromUrl   = params.get('bn');
  const fromStore = localStorage.getItem('business_name');
  const name = (fromUrl && fromUrl.trim()) || (fromStore && fromStore.trim()) || 'Your Business Name';
  target.textContent = name;
  if (fromUrl) localStorage.setItem('business_name', name);
}

// ==================== Events ====================
function wireEvents() {
  if (search) search.addEventListener('input', e => { state.q = normalize(e.target.value); render(catalog.filter(matches)); });
  if (filterCollection) filterCollection.addEventListener('change', e => { state.collection = e.target.value; render(catalog.filter(matches)); });
  if (showAllBtn) showAllBtn.addEventListener('click', () => { state.show = 'all'; render(catalog.filter(matches)); });
  if (showOwnedBtn) showOwnedBtn.addEventListener('click', () => { state.show = 'owned'; render(catalog.filter(matches)); });

  if (saveOwnedBtn) {
    saveOwnedBtn.addEventListener('click', async () => {
      const u = await currentUser();
      if (!u) return alert('Please log in on the Account page first.');
      const original = saveOwnedBtn.textContent;
      saveOwnedBtn.disabled = true;
      saveOwnedBtn.textContent = 'Saving…';
      try {
        await replaceCloudCodes(u.id, ownedSet);
        saveOwnedBtn.textContent = 'Saved';
      } catch (e) {
        console.warn('save error', e);
        saveOwnedBtn.textContent = 'Save';
        alert(e.message || 'Save failed. Try again.');
      } finally {
        setTimeout(() => { saveOwnedBtn.textContent = original; saveOwnedBtn.disabled = false; }, 800);
      }
    });
  }
}

// ==================== Boot ====================
(async function main(){
  setBusinessName();
  catalog = await loadData();
  user = await currentUser();

  // Cloud is the source of truth for all items (IDs may be codes or ASIN-based)
  if (user) {
    try {
      const cloud = await fetchCloudCodes(user.id);
      ownedSet.clear();
      cloud.forEach(c => ownedSet.add(c));
      saveOwnedLocal();
    } catch(e) { console.warn('initial cloud sync failed', e); }
  }

  wireEvents();
  render(catalog.filter(matches));
})();
