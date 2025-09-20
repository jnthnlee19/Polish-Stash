import data from './data/dnd-diva.json' assert { type: 'json' };

const grid = document.getElementById('grid');
const stats = document.getElementById('stats');
const search = document.getElementById('search');
const filterCollection = document.getElementById('filter-collection');
const ownedToggle = document.getElementById('owned-toggle');
const tpl = document.getElementById('card-tpl');

const LS_KEY = 'polish-stash-owned';
const ownedSet = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

const state = { q: '', collection: 'diva', show: 'all' };

function normalize(str){ return (str||'').toString().toLowerCase(); }

function matches(item){
  const hay = `${item.code} ${item.name} ${item.collection}`.toLowerCase();
  const okQ = hay.includes(state.q);
  const okCol = state.collection==='all' || item.collection===state.collection;
  const isOwned = ownedSet.has(item.code);
  const okShow = state.show==='all' || (state.show==='owned' ? isOwned : !isOwned);
  return okQ && okCol && okShow;
}

function fmtStats(items){
  const total = items.length;
  const owned = items.filter(i=>ownedSet.has(i.code)).length;
  return `Showing ${total} shades · Owned: ${owned} · Not owned: ${total - owned}`;
}

function affiliateUrl(item){
  const dest = encodeURIComponent(item.product_url || 'https://www.dndgel.com/');
  const sku = encodeURIComponent(item.code);
  return `/.netlify/functions/go?sku=${sku}&dest=${dest}`;
}

function render(items){
  grid.innerHTML='';
  const frag = document.createDocumentFragment();
  items.forEach(item => {
    const node = tpl.content.cloneNode(true);
    const swatch = node.querySelector('.swatch');
    const name = node.querySelector('.name');
    const code = node.querySelector('.code');
    const buy = node.querySelector('.buy');
    const owned = node.querySelector('.owned');

    swatch.style.background = item.hex ? `linear-gradient(135deg, ${item.hex}, #f3f4f6)` : '';
    name.textContent = item.name;
    code.textContent = `#${item.code} · ${item.collection.toUpperCase()}`;
    buy.href = affiliateUrl(item);

    owned.checked = ownedSet.has(item.code);
    owned.addEventListener('change', () => {
      if(owned.checked) ownedSet.add(item.code); else ownedSet.delete(item.code);
      localStorage.setItem(LS_KEY, JSON.stringify([...ownedSet]));
      stats.textContent = fmtStats(items.filter(matches));
    });

    frag.appendChild(node);
  });
  grid.appendChild(frag);
  stats.textContent = fmtStats(items.filter(matches));
}

search.addEventListener('input', e => { state.q = normalize(e.target.value); render(data.filter(matches)); });
filterCollection.addEventListener('change', e => { state.collection = e.target.value; render(data.filter(matches)); });
ownedToggle.addEventListener('click', () => {
  state.show = state.show==='all' ? 'owned' : state.show==='owned' ? 'not' : 'all';
  ownedToggle.textContent = `Show: ${state.show[0].toUpperCase()}${state.show.slice(1)}`;
  render(data.filter(matches));
});

render(data.filter(matches));
