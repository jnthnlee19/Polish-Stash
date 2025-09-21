// account.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- SET THESE from your Supabase project (Project Settings → API)
const SUPABASE_URL = 'https://kgghfsnawrddnvssxham.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2hmc25hd3JkZG52c3N4aGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzODkwMjgsImV4cCI6MjA3Mzk2NTAyOH0.RtTZhVPeoxhamYxczVf-crkG8_jIBBpIJlfz9rvjCIg';


// ---- Init
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- DOM
const el = (id) => document.getElementById(id);

// Sign in (existing users)
const inEmail = el('in-email');
const inPassword = el('in-password');
const signinBtn = el('signin');
const signinMsg = el('signin-msg');

// Sign up (new users)
const upEmail = el('up-email');
const upPassword = el('up-password');
const upBizname = el('up-bizname');
const signupBtn = el('signup');
const signupMsg = el('signup-msg');

// Dashboard
const dash = el('dash');
const who = el('who');
const logoutBtn = el('logout');
const bizname = el('bizname');
const bizMsg = el('biz-msg');

// Enter buttons/link
const enterBtn = el('enter');
const enterTop = el('enter-top');

// Local storage keys
const LS_OWNED = 'polish-stash-owned';
const LS_BIZ   = 'business_name';
const LS_PENDING_BIZ = 'pending_business_name';

// ---- Helpers
const ok = (m) => `<span class="ok">${m}</span>`;
const err = (m) => `<span class="err">${m}</span>`;
function zpad3(code) { const s = String(code || '').trim(); return /^\d+$/.test(s) ? s.padStart(3,'0') : s; }
function debounce(fn, ms = 500) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function buildCatalogUrl() {
  const name = (bizname && bizname.value.trim()) || (localStorage.getItem(LS_BIZ) || '').trim();
  return name ? `./index.html?bn=${encodeURIComponent(name)}` : './index.html';
}
function wireEnterLinks() {
  const url = buildCatalogUrl();
  if (enterTop) enterTop.href = url;
  if (enterBtn) enterBtn.onclick = () => { location.href = url; };
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

// ---- Auth: Sign up
signupBtn.addEventListener('click', async () => {
  signupMsg.innerHTML = 'Creating account…';
  try {
    const email = upEmail.value.trim();
    const pwd   = upPassword.value;
    const bn    = upBizname.value.trim();

    // Save business name locally for after confirmation & login
    if (bn) {
      localStorage.setItem(LS_BIZ, bn);
      localStorage.setItem(LS_PENDING_BIZ, bn); // apply to profile after first login
    }

    const { error } = await supabase.auth.signUp({
      email,
      password: pwd,
      options: {
        emailRedirectTo: `${location.origin}/account.html`, // send back to this page
        data: { signup_business_name: bn } // optional metadata
      }
    });
    if (error) throw error;

    signupMsg.innerHTML = ok('Check your email to confirm, then log in.');
  } catch (e) {
    signupMsg.innerHTML = err(e.message || 'Sign up failed');
  }
});

// ---- Auth: Sign in
signinBtn.addEventListener('click', async () => {
  signinMsg.innerHTML = 'Signing in…';
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: inEmail.value.trim(),
      password: inPassword.value
    });
    if (error) throw error;
    await onAuthed();
  } catch (e) {
    signinMsg.innerHTML = err(e.message || 'Log in failed');
  }
});

// ---- Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    dash.style.display = 'none';
    // Keep the two auth cards visible (they’re the default UI in account.html)
    document.querySelectorAll('.grid2, .cardish').forEach(el => el.style.display = '');
    wireEnterLinks(); // keep Enter pointing somewhere sensible
  });
}

// ---- After login: show dashboard + auto-sync
async function onAuthed() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Hide the two auth cards and show dashboard
  document.querySelectorAll('.grid2, .cardish').forEach((el, i) => {
    // only hide the first grid (auth cards); dash is separate
    if (i === 0) el.style.display = 'none';
  });
  dash.style.display = '';

  who.textContent = user.email || user.id;

  await ensureProfile(user.id);

  // BUSINESS NAME — prefer pending (from signup) > cloud > local
  try {
    const pending = localStorage.getItem(LS_PENDING_BIZ) || '';
    const profile = await loadProfile(user.id);
    const cloudName = (profile && profile.business_name) || '';
    const localName = localStorage.getItem(LS_BIZ) || '';

    let finalName = '';
    if (pending) {
      await saveProfile(user.id, pending);
      finalName = pending;
      localStorage.removeItem(LS_PENDING_BIZ);
    } else if (cloudName) {
      finalName = cloudName;
    } else if (localName) {
      await saveProfile(user.id, localName);
      finalName = localName;
    }

    bizname.value = finalName || '';
    if (finalName) {
      localStorage.setItem(LS_BIZ, finalName);
      bizMsg.innerHTML = ok('Business name synced.');
    } else {
      bizMsg.innerHTML = '';
    }
  } catch (e) {
    bizMsg.innerHTML = err('Could not sync business name.');
  }

  // INVENTORY — merge cloud + local and write both (union)
  try {
    const cloud = new Set(await fetchCloudCodes(user.id));
    const local = new Set(JSON.parse(localStorage.getItem(LS_OWNED) || '[]').map(zpad3));
    const union = new Set([...cloud, ...local]);
    localStorage.setItem(LS_OWNED, JSON.stringify([...union]));
    await upsertManyCodes(user.id, union);
  } catch (e) {
    console.warn('inventory sync failed', e);
  }

  wireEnterLinks();
}

// Business Name: auto-save to cloud (debounced)
bizname.addEventListener('input', debounce(async () => {
  const val = bizname.value.trim();
  localStorage.setItem(LS_BIZ, val);
  wireEnterLinks();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { bizMsg.innerHTML = ok('Saved on this device.'); return; }
  try {
    await saveProfile(user.id, val);
    bizMsg.innerHTML = ok('Saved to cloud.');
  } catch (e) {
    bizMsg.innerHTML = err('Save failed.');
  }
}, 600));

// Handle email-confirm redirect
(function handleEmailLink(){
  const p = new URLSearchParams(location.search);
  if (p.get('type') === 'signup') {
    const el = signupMsg || signinMsg;
    if (el) el.innerHTML = ok('Email confirmed! You can log in now.');
  }
})();

// Boot: wire Enter + auto-open dashboard if already logged in
(async function boot(){
  wireEnterLinks();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await onAuthed();
})();
