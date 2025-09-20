// ==================== Data loader ====================
async function loadData() {
  try {
    const res = await fetch('./data/dnd-diva.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to load catalog:', err);
    return [];
  }
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
async function upsertCloudCode(userId, code) {
  try { await supabase.from('inventory').upsert({ user_id: userId, code: String(code) }); } catch(e){ console.warn('cloud upsert error', e); }
}
async function deleteCloudCode(userId, code) {
  try { await supabase.from('inventory').delete().eq('user_id', userId).eq('code', String(code)); } catch(e){ console.warn('cloud delete error', e); }
}

// ==================== Local Storage (owned) ====================
const LS_OWNED = 'polish-stash-owned';

// Migrate any old short numeric codes to 3 digits (e.g., "2" -> "002")
(function migrateOwned() {
  const raw = JSON.parse(localStorage.getItem(LS_OWNED) || '[]');
  const migrated = Array.from(new Set(raw.map(c => {
    const s = String(c || '').trim();
    return /^\d+$/.test(s) && s.length < 3 ? s.padStart(3, '0') : s;
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
const tpl              = document.getElementById('card-tpl');

// ==================== UI State ====================
const state = {
  q: '',
  collection: (filterCollection && filterCollection.value) || 'diva', // default to Diva
  show: 'all', // 'all' | 'owned'
};

let catalog = []; // filled in main()
let user = null;  // supabase user if logged in

// ==================== Helpers ====================
const normalize = (s) => (s || '').toString().toLowerCase();

function matches(item) {
  const hay     = `${item.code} ${item.name} ${item.collection}`.toLowerCase();
  const okQ     = hay.includes(state.q);
  const okCol   = state.collection === 'all' || item.collection === state.collection;
  const isOwned = ownedSet.has(item.code);
  const okShow  = state.show === 'all' || (state.show === 'owned' && isOwned);
  return okQ && okCol && okShow;
}

const COLLECTION_LABELS = {
  diva: 'Diva Colors',
  dnd: 'DND Colors',
  dc: 'DC Colors',
  tools: 'Nail Tools',
  essentials: 'Essentials'
};
const collectionLabel = (key) => COLLECTION_LABELS[key] || (key ? key.toUpperCase() : '');

function fmtStats(items) {
  const total    = items.length;
  const owned    = items.filter(i => ownedSet.has(i.code)).length;
  const notOwned = total - owned;
  return `Showing ${total} shades · Owned: ${owned} · Not owned: ${notOwned}`;
}

// Direct product link (from JSON; fallback builder)
function productLink(item) {
  return (item.product_url && item.product_url.trim()) || buildProductUrl(item);
}
function slugifyName(name = '') {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-?diva$/, '')      // avoid double '-diva'
    .replace(/^-|-$/g, '');
}
function pad3(code) {
  const s = String(code || '').trim();
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s;
}
function buildProductUrl(item) {
  const slug = slugifyName(item.name || '');
  const code = pad3(item.code || '');
  return slug && code ? `https://www.dndgel.com/products/${slug}-diva-${code}` : '#';
}

// ==================== Product images via Netlify Function ====================
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

// Swatch image setter: show full image (not cropped)
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
        if (url && swatch.dataset.productUrl === item.product_url) {
          setSwatchImage(swatch, url);
        }
      });
    }

    // Meta
    nameEl.textContent = item.name || '';
    codeEl.textContent = `#${item.code || ''} · ${collectionLabel(item.collection)}`;

    // Buy link (direct)
    buy.href = productLink(item);

    // Owned toggle (+ cloud sync if logged in)
    const isOwned = ownedSet.has(item.code);
    owned.checked = isOwned;
    owned.addEventListener('change', async () => {
      if (owned.checked) {
        ownedSet.add(item.code);
        if (user) await upsertCloudCode(user.id, item.code);
      } else {
        ownedSet.delete(item.code);
        if (user) await deleteCloudCode(user.id, item.code);
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

  const name = (fromUrl && fromUrl.trim())
            || (fromStore && fromStore.trim())
            || 'Your Business Name';

  target.textContent = name;
  if (fromUrl) localStorage.setItem('business_name', name);
}

// ==================== Events ====================
function wireEvents() {
  if (search) {
    search.addEventListener('input', e => {
      state.q = normalize(e.target.value);
      render(catalog.filter(matches));
    });
  }

  if (filterCollection) {
    filterCollection.addEventListener('change', e => {
      state.collection = e.target.value;
      render(catalog.filter(matches));
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      state.show = 'all';
      render(catalog.filter(matches));
    });
  }

  if (showOwnedBtn) {
    showOwnedBtn.addEventListener('click', () => {
      state.show = 'owned'; // On Hand
      render(catalog.filter(matches));
    });
  }
}

// ==================== Boot (with cloud sync) ====================
(async function main(){
  setBusinessName();
  catalog = await loadData();
  user = await currentUser();

  // If logged in, merge cloud + local and render
  if (user) {
    try {
      const cloud = await fetchCloudCodes(user.id);     // from DB
