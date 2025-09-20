// account.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- 1) SET THESE from your Supabase project (Project Settings → API)
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ---- 2) Init
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 3) DOM
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
const saveBiz = el('save-biz');
const applyBiz = el('apply-biz');
const bizMsg = el('biz-msg');

const saveCloud = el('save-cloud');
const loadCloud = el('load-cloud');
const resetCloud = el('reset-cloud');
const invMsg = el('inv-msg');

// Local storage key (same as catalog)
const LS_OWNED = 'polish-stash-owned';

// ---- 4) Helpers
const ok = (m) => `<span class="ok">${m}</span>`;
const err = (m) => `<span class="err">${m}</span>`;

// Ensure tables exist in Supabase (see SQL below). We assume RLS is on.
async function ensureProfile(userId) {
  // create row if missing
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
}

async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('business_name').eq('id', userId).single();
  if (error && error.code !== 'PGRST116') throw error; // ignore "not found" when no row yet
  return data || { business_name: '' };
}

async function saveProfile(userId, businessName) {
  const { error } = await supabase.from('profiles').upsert({ id: userId, business_name: businessName });
  if (error) throw error;
}

async function saveOwnedToCloud(userId) {
  const owned = JSON.parse(localStorage.getItem(LS_OWNED) || '[]');
  // Upsert owned codes as rows; we store *only* owned items.
  if (!owned.length) {
    return { count: 0 };
  }
  const rows = owned.map(code => ({ user_id: userId, code: String(code) }));
  const { error } = await supabase.from('inventory').upsert(rows, { onConflict: 'user_id,code' });
  if (error) throw error;
  return { count: rows.length };
}

async function loadOwnedFromCloud(userId) {
  const { data, error } = await supabase.from('inventory').select('code').eq('user_id', userId).order('code');
  if (error) throw error;
  const codes = [...new Set((data || []).map(r => String(r.code)))];
  localStorage.setItem(LS_OWNED, JSON.stringify(codes));
  return { count: codes.length };
}

async function resetCloudInventory(userId) {
  const { error } = await supabase.from('inventory').delete().eq('user_id', userId);
  if (error) throw error;
}

// ---- 5) Auth wiring
signupBtn.addEventListener('click', async () => {
  authMsg.innerHTML = 'Creating account…';
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value
    });
    if (error) throw error;
    authMsg.innerHTML = ok('Check your email to confirm your account. Then log in.');
  } catch (e) {
    authMsg.innerHTML = err(e.message || 'Sign up failed');
  }
});

signinBtn.addEventListener('click', async () => {
  authMsg.innerHTML = 'Signing in…';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
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

// ---- 6) Post-auth dashboard init
async function onAuthed() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  who.textContent = user.email || user.id;
  authCard.style.display = 'none';
  dash.style.display = '';

  await ensureProfile(user.id);

  // Load profile → fill biz name
  try {
    const p = await loadProfile(user.id);
    bizname.value = p.business_name || (localStorage.getItem('business_name') || '');
  } catch (e) {
    bizMsg.innerHTML = err('Could not load business name');
  }
}

// ---- 7) Profile + inventory actions
saveBiz.addEventListener('click', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bizMsg.innerHTML = err('Please log in first.');
  try {
    await saveProfile(user.id, bizname.value.trim());
    bizMsg.innerHTML = ok('Saved to cloud.');
  } catch (e) {
    bizMsg.innerHTML = err('Save failed.');
  }
});

applyBiz.addEventListener('click', () => {
  localStorage.setItem('business_name', bizname.value.trim());
  bizMsg.innerHTML = ok('Applied to this device. Refresh your catalog to see it.');
});

saveCloud.addEventListener('click', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return invMsg.innerHTML = err('Please log in first.');
  invMsg.innerHTML = 'Saving…';
  try {
    const { count } = await saveOwnedToCloud(user.id);
    invMsg.innerHTML = ok(`Saved ${count} on-hand items to cloud.`);
  } catch (e) {
    invMsg.innerHTML = err('Save failed.');
  }
});

loadCloud.addEventListener('click', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return invMsg.innerHTML = err('Please log in first.');
  invMsg.innerHTML = 'Loading…';
  try {
    const { count } = await loadOwnedFromCloud(user.id);
    invMsg.innerHTML = ok(`Loaded ${count} on-hand items to this device. Refresh your catalog to see them.`);
  } catch (e) {
    invMsg.innerHTML = err('Load failed.');
  }
});

resetCloud.addEventListener('click', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return invMsg.innerHTML = err('Please log in first.');
  if (!confirm('This will remove all your On-Hand entries from the cloud. Continue?')) return;
  invMsg.innerHTML = 'Resetting…';
  try {
    await resetCloudInventory(user.id);
    invMsg.innerHTML = ok('Cloud On-Hand inventory cleared.');
  } catch (e) {
    invMsg.innerHTML = err('Reset failed.');
  }
});

// ---- 8) Bootstrap: show dashboard if already logged in
(async function boot(){
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await onAuthed();
})();
