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
// NEW: replace cloud set with current set (delete all, then insert)
async function replaceCloudCodes(userId, codesIterable) {
  // delete everything first
  const del = await supabase.from('inventory').delete().eq('user_id', userId);
  if (del.error) throw new Error(del.error.message || 'Delete failed');
  // insert current set
  const rows = [...codesIterable].map(code => ({ user_id: userId, code: String(code) }));
  if (!rows.length) return;
  const ins = await supabase.from('inventory').insert(rows);
  if (ins.error) throw new Error(ins.error.message || 'Insert failed');
}

// (kept for per-item live sync while toggling)
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
const saveOwnedBtn     = document.getElementById('save-owned');   // Save button exists in your HTML
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
function pad3(code)
