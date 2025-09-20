// Load catalog (make sure data/dnd-diva.json exists)
import data from './data/dnd-diva.json' assert { type: 'json' };

// DOM refs
const grid = document.getElementById('grid');
const stats = document.getElementById('stats');
const search = document.getElementById('search');
const filterCollection = document.getElementById('filter-collection');
const ownedToggle = document.getElementById('owned-toggle');
const tpl = document.getElementById('card-tpl');

// Local storage
const LS_KEY = 'polish-stash-owned';
const ownedSet = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

// UI state
const state = {
  q: '',
  collection: (filterCollection && filterCollection.value) || 'diva',
  show: 'all', // all | owned | not
};

// Helpers
function normalize(str) {
  return (str || '').toString().toLowerCase();
}

function matches(item) {
  const hay = `${item.code} ${item.name} ${item.collection}`.toLowerCase();
  const okQ = hay.includes(state.q);
  const okCol = state.collection === 'all' || item.collection === state.collection;
  const isOwned = ownedSet.has(item.code);
  const okShow = state.show === 'all' || (state.show === 'owned' ? isOwned : !isOwned);
  return okQ && okCol && okShow;
}

function fmtStats(items) {
  const total = items.length;
  const owned = items.filter(i => ownedSet.has(i.code)).length;
  return `Showing ${total} shades · Owned: ${owned} · Not owned: ${total - owned}`;
}

function affiliateUrl(item) {
  // Centralized click-through for affiliate tagging via Netlify Function
  const dest = encodeURIComponent(item.product_url || 'https://www.dndgel.com/');
  const sku = encodeURIComponent(item.code);
  return `/.netlify/functions/go?sku=${sku}&dest=${dest}`;
}

function render(items) {
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  items.forEach(item => {
    const node = tpl.content.cloneNode(true);
    const swatch = node.querySelector('.swatch');
    const name = node.querySelector('.name');
    const code = node.querySelector('.code');
    const buy = node.querySelector('.buy');
    const owned = node.querySelector('.owned');

    // visual
    swatch.style.background = item.hex
      ? `linear-gradient(135deg, ${item.hex}, #f3f4f6)`
      : 'linear-gradient(135deg,#f3f4f6,#e5e7eb)';

    // meta
    name.textContent = item.name;
    code.textContent = `#${item.code} · ${item.collection.toUpperCase()}`;

    // buy link
    buy.href = affiliateUrl(item);

    // owned toggle
    owned.checked = ownedSet.has(item.code);
    owned.addEventListener('change', () => {
      if (owned.checked) ownedSet.add(item.code);
      else ownedSet.delete(item.code);
      localStorage.setItem(LS_KEY, JSON.stringify([...ownedSet]));
      stats.textContent = fmtStats(items.filter(matches));
    });

    frag.appendChild(node);
  });

  grid.appendChild(frag);
  stats.textContent = fmtStats(items.filter(matches));
}

// Events
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

if (ownedToggle) {
  ownedToggle.addEventListener('click', () => {
    state.show = state.show === 'all' ? 'owned' : state.show === 'owned' ? 'not' : 'all';
    ownedToggle.textContent = `Show: ${state.show[0].toUpperCase()}${state.show.slice(1)}`;
    render(data.filter(matches));
  });
}

// Initial paint
render(data.filter(matches));

// ---------------- Business Name injection (URL/localStorage; ready for backend later) --------------
(function setBusinessName() {
  const el = document.getElementById('custom-site-name');
  if (!el) return;

  // URL param: ?bn=Killer%20Nails
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('bn');

  // LocalStorage (remembered user setting)
  const fromStorage = localStorage.getItem('business_name');

  // Priority: URL > LocalStorage > default placeholder
  const name = (fromUrl && fromUrl.trim()) || (fromStorage && fromStorage.trim()) || 'Your Business Name';
  el.textContent = name;

  // If set via URL, persist it
  if (fromUrl) localStorage.setItem('business_name', name);
})();
