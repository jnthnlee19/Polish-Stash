// Load catalog (ensure data/dnd-diva.json exists)
import data from './data/dnd-diva.json' assert { type: 'json' };

// ---------- DOM ----------
const grid = document.getElementById('grid');
const stats = document.getElementById('stats');
const search = document.getElementById('search');
const filterCollection = document.getElementById('filter-collection');
const showAllBtn = document.getElementById('show-all');
const showOwnedBtn = document.getElementById('show-owned');
const tpl = document.getElementById('card-tpl');

// ---------- Local Storage for "owned" ----------
const LS_KEY = 'polish-stash-owned';
const ownedSet = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

// ---------- UI State ----------
const state = {
  q: '',
  collection: (filterCollection && filterCollection.value) || 'all',
  show: 'all', // 'all' | 'owned'
};

// ---------- Helpers ----------
function normalize(str) {
  return (str || '').toString().toLowerCase();
}

function matches(item) {
  const hay = `${item.code} ${item.name} ${item.collection}`.toLowerCase();
  const okQ = hay.includes(state.q);
  const okCol = state.collection === 'all' || item.collection === state.collection;
  const isOwned = ownedSet.has(item.code);
  const okShow = state.show === 'all' || (state.show === 'owned' && isOwned);
  return okQ && okCol && okShow;
}

function fmtStats(items) {
  const total = items.length;
  const owned = items.filter(i => ownedSet.has(i.code)).length;
  const notOwned = total - owned;
  return `Showing ${total} shades · Owned: ${owned} · Not owned: ${notOwned}`;
}

function affiliateUrl(item) {
  // Central redirect for affiliate tagging via Netlify Function
  const dest = encodeURIComponent(item.product_url || 'https://www.dndgel.com/');
  const sku = encodeURIComponent(item.code);
  return `/.netlify/functions/go?sku=${sku}&dest=${dest}`;
}

// ---------- Render ----------
function render(items) {
  if (!grid || !tpl) return;

  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  items.forEach(item => {
    const node = tpl.content.cloneNode(true);
    const swatch = node.querySelector('.swatch');
    const name = node.querySelector('.name');
    const code = node.querySelector('.code');
    const buy = node.querySelector('.buy');
    const owned = node.querySelector('.owned');

    // Visual
    swatch.style.background = item.hex
      ? `linear-gradient(135deg, ${item.hex}, #f3f4f6)`
      : 'linear-gradient(135deg,#f3f4f6,#e5e7eb)';

    // Meta
    name.textContent = item.name;
    code.textContent = `#${item.code} · ${item.collection.toUpperCase()}`;

    // Buy link
    buy.href = affiliateUrl(item);

    // Owned toggle
    owned.checked = ownedSet.has(item.code);
    owned.addEventListener('change', () => {
      if (owned.checked) ownedSet.add(item.code);
      else ownedSet.delete(item.code);
      localStorage.setItem(LS_KEY, JSON.stringify([...ownedSet]));
      // Update stats based on current filters
      stats && (stats.textContent = fmtStats(items.filter(matches)));
    });

    frag.appendChild(node);
  });

  grid.appendChild(frag);
  stats && (stats.textContent = fmtStats(items.filter(matches)));
}

// ---------- Events ----------
if (search) {
  search.addEventListener('input', e => {
    state.q = normalize(e.target.value);
    render(data.filter(matches));
  });
}

if (filterCollection) {
  filterCollection.addEventListener('change', e => {
    state.collection = e.target.value;
    render(data.filter(matches));
  });
}

if (showAllBtn) {
  showAllBtn.addEventListener('click', () => {
    state.show = 'all';
    render(data.filter(matches));
  });
}

if (showOwnedBtn) {
  showOwnedBtn.addEventListener('click', () => {
    state.show = 'owned'; // “On Hand”
    render(data.filter(matches));
  });
}

// ---------- Initial Paint ----------
render(data.filter(matches));

// ---------- Business Name injection (URL > localStorage > default) ----------
(function setBusinessName() {
  const el = document.getElementById('custom-site-name');
  if (!el) return;

  // URL param: ?bn=Killer%20Nails
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('bn');

  // LocalStorage preference
  const fromStorage = localStorage.getItem('business_name');

  const name =
    (fromUrl && fromUrl.trim()) ||
    (fromStorage && fromStorage.trim()) ||
    'Your Business Name';

  el.textContent = name;

  if (fromUrl) localStorage.setItem('business_name', name);
})();
