// ---------- Data loader (works everywhere) ----------
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

// ---------- Local Storage (owned set) ----------
const LS_OWNED = 'polish-stash-owned';
const ownedSet = new Set(JSON.parse(localStorage.getItem(LS_OWNED) || '[]'));

// ---------- DOM ----------
const grid             = document.getElementById('grid');
const stats            = document.getElementById('stats');
const search           = document.getElementById('search');
const filterCollection = document.getElementById('filter-collection');
const showAllBtn       = document.getElementById('show-all');
const showOwnedBtn     = document.getElementById('show-owned');
const tpl              = document.getElementById('card-tpl');

// ---------- UI State ----------
const state = {
  q: '',
  collection: (filterCollection && filterCollection.value) || 'all', // 'all' | 'diva' | ...
  show: 'all', // 'all' | 'owned'  (On Hand)
};

// ---------- Helpers ----------
const normalize = (s) => (s || '').toString().toLowerCase();

function matches(item) {
  const hay     = `${item.code} ${item.name} ${item.collection}`.toLowerCase();
  const okQ     = hay.includes(state.q);
  const okCol   = state.collection === 'all' || item.collection === state.collection;
  const isOwned = ownedSet.has(item.code);
  const okShow  = state.show === 'all' || (state.show === 'owned' && isOwned);
  return okQ && okCol && okShow;
}

function fmtStats(items) {
  const total   = items.length;
  const owned   = items.filter(i => ownedSet.has(i.code)).length;
  const notOwned = total - owned;
  return `Showing ${total} shades · Owned: ${owned} · Not owned: ${notOwned}`;
}

function affiliateUrl(item) {
  // Central redirect for affiliate tagging via Netlify Function
  const dest = encodeURIComponent(item.product_url || 'https://www.dndgel.com/');
  const sku  = encodeURIComponent(item.code || '');
  return `/.netlify/functions/go?sku=${sku}&dest=${dest}`;
}

// ---------- Render ----------
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

    // Visual swatch: prefer image if provided, else hex gradient fallback
    if (item.image) {
      swatch.style.background = `center / cover no-repeat url("${item.image}")`;
    } else if (item.hex) {
      swatch.style.background = `linear-gradient(135deg, ${item.hex}, #f3f4f6)`;
    } else {
      swatch.style.background = 'linear-gradient(135deg,#f3f4f6,#e5e7eb)';
    }

    // Meta
    nameEl.textContent = item.name || '';
    codeEl.textContent = `#${item.code || ''} · ${String(item.collection || '').toUpperCase()}`;

    // Buy link
    buy.href = affiliateUrl(item);

    // Owned toggle
    const isOwned = ownedSet.has(item.code);
    owned.checked = isOwned;
    owned.addEventListener('change', () => {
      if (owned.checked) ownedSet.add(item.code);
      else ownedSet.delete(item.code);
      localStorage.setItem(LS_OWNED, JSON.stringify([...ownedSet]));
      stats && (stats.textContent = fmtStats(items.filter(matches)));
    });

    frag.appendChild(node);
  });

  grid.appendChild(frag);
  stats && (stats.textContent = fmtStats(items.filter(matches)));
}

// ---------- Business Name injection (URL > localStorage > default) ----------
function setBusinessName() {
  const el = document.getElementById('custom-site-name') || document.getElementById('custom-site-name') || document.getElementById('custom-site-name');
  // Above line ensures we don't crash if element id changes; kept for safety though redundant
  const target = document.getElementById('custom-site-name');
  if (!target) return;

  const params     = new URLSearchParams(location.search);
  const fromUrl    = params.get('bn');
  const fromStore  = localStorage.getItem('business_name');

  const name = (fromUrl && fromUrl.trim())
            || (fromStore && fromStore.trim())
            || 'Your Business Name';

  target.textContent = name;
  if (fromUrl) localStorage.setItem('business_name', name);
}

// ---------- Events ----------
function wireEvents(data) {
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
      state.show = 'owned'; // On Hand
      render(data.filter(matches));
    });
  }
}

// ---------- Boot ----------
(async function main(){
  setBusinessName();
  const data = await loadData();
  wireEvents(data);
  render(data.filter(matches));
})();
