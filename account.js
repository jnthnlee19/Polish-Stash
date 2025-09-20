// account.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- SET THESE from your Supabase project (Project Settings → API)
const SUPABASE_URL = 'https://kgghfsnawrddnvssxham.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2hmc25hd3JkZG52c3N4aGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzODkwMjgsImV4cCI6MjA3Mzk2NTAyOH0.RtTZhVPeoxhamYxczVf-crkG8_jIBBpIJlfz9rvjCIg';

// ---- Init
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- DOM
const el = (id) => document.getElementById(id);
const email = el('email');
const password = el('password');
const signupBtn = el('signup');
const signinBtn = el('signin');
const authMsg = el('auth-msg');

const dash = el('dash');
const authCard = el('auth-card');
const who = el('who');
const logoutBtn = el('logout');

const bizname = el('bizname');
const bizMsg = el('biz-msg');

// Same key used by catalog app
const LS_OWNED = 'polish-stash-owned';

// ---- Helpers
const ok = (m) => `<span class="ok">${m}</span>`;
const err = (m) => `<span class="err">${m}</span>`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function zpad3(code) {
  const s = String(code || '').trim();
  return /^\d+$/.test(s) ? s.padStart(3, '0') : s;
}

// Debounce helper for auto-save
function debounce(fn, ms = 500) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---- DB helpers
async function ensureProfile(userId) {
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
}
async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('business_name').eq('id', userId).single();
  if (error && error.code !== 'PGRST116') throw error; // ignore not-found
  return data || { business_name: '' };
}
async function saveProfile(userId, businessName) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, business_name: businessName });
  if (error) throw error;
}
async function fetchCloudCodes(userId) {
  const { data, error } = await supabase.from('inventory').select('code').eq('user_id', userId);
  if (error) { console.warn('cloud fetch error', error); return []; }
  return Array.from(new Set((data || []).map(r => zpad3(r.code))));
}
async function upsertManyCodes(userId, codesSet) {
  const rows = [...codesSet].map(code => ({ user_id: userId, code: zpad3(code) }));
  if (!rows.length) return;
  const { error } = await supabase.from('inventory').upsert(rows, { onConflict: 'user_id,code' });
  if (error) console.warn('upsert error', error);
}

// ---- Auth actions
signupBtn.addEventListener('click', async () => {
  authMsg.innerHTML = 'Creating account…';
  try {
    const { error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value
    });
    if (error) throw error;
    authMsg.innerHTML = ok('Check your email to confirm, then log in.');
  } catch (e) {
    authMsg.innerHTML = err(e.message || 'Sign up failed');
  }
});

signinBtn.addEventListener('click', async () => {
  authMsg.innerHTML = 'Signing in…';
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    });
    if (error) throw error;
    await onAuthed();
  } catch (e) {
    authMsg.innerHTML = err(e.message || 'Log in failed');
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  dash.style.display = 'none';
  authCard.style.display = '';
  authMsg.innerHTML = ok('Logged out');
});

// ---- After login: SHOW dashboard + AUTO SYNC everything
async function onAuthed() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  who.textContent = user.email || user.id;
  authCard.style.display = 'none';
  dash.style.display = '';

  await ensureProfile(user.id);

  // 1) BUSINESS NAME — apply from cloud if present; else push local up
  try {
    const profile = await loadProfile(user.id);
    const cloudName = (profile && profile.business_name) || '';
    const localName = localStorage.getItem('business_name') || '';
    if (cloudName) {
      // prefer cloud
      localStorage.setItem('business_name', cloudName);
      bizname.value = cloudName;
      bizMsg.innerHTML = ok('Loaded business name from cloud.');
    } else if (localName) {
      await saveProfile(user.id, localName);
      bizname.value = localName;
      bizMsg.innerHTML = ok('Saved your business name to cloud.');
    } else {
      bizname.value = '';
      bizMsg.innerHTML = '';
    }
  } catch (e) {
    bizMsg.innerHTML = err('Could not sync business name.');
  }

  // 2) INVENTORY — merge cloud + local (union), write both places
  try {
    const cloud = new Set(await fetchCloudCodes(user.id));
    const local = new Set(JSON.parse(localStorage.getItem(LS_OWNED) || '[]').map(zpad3));
    const union = new Set([...cloud, ...local]);
    localStorage.setItem(LS_OWNED, JSON.stringify([...union]));
    await upsertManyCodes(user.id, union);
    // small UX hint
    authMsg.innerHTML = ok('Inventory synced. Open the catalog to see your On-Hand items.');
  } catch (e) {
    console.warn('inventory sync failed', e);
  }
}

// ---- BUSINESS NAME: auto-save on edit (debounced)
bizname.addEventListener('input', debounce(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  const val = bizname.value.trim();
  localStorage.setItem('business_name', val);
  if (!user) { bizMsg.innerHTML = ok('Saved on this device.'); return; }
  try {
    await saveProfile(user.id, val);
    bizMsg.innerHTML = ok('Saved to cloud.');
  } catch (e) {
    bizMsg.innerHTML = err('Save failed.');
  }
}, 600));

// ---- Auto-show dashboard if already logged in
(async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await onAuthed();
})();
