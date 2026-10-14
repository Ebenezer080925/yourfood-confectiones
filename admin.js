// ===========================================================
// ADMIN PAGE LOGIC
// What this file does, in plain terms:
//   1. Shows a login form, or the dashboard if already signed in
//   2. Uploads photos to Supabase (shrinking them first so the
//      website stays fast)
//   3. Lists uploaded photos per section, with a delete button
// ===========================================================

// The four gallery sections. The word on the left ("cakes") is what gets
// saved in the database, so it must match the ?category= names used by
// gallery.js. The word on the right is what people see on screen.
const CATEGORIES = {
  cakes: 'Cakes',
  bread: 'Bread',
  snacks: 'Snacks',
  catering: 'Catering'
};

// ---------- Grab the page elements we need to update ----------
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginStatus = document.getElementById('login-status');
const userEmailEl = document.getElementById('user-email');
const signoutBtn = document.getElementById('signout-btn');

const uploadForm = document.getElementById('upload-form');
const categorySelect = document.getElementById('category-select');
const fileInput = document.getElementById('file-input');
const captionInput = document.getElementById('caption-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');

const tabsEl = document.getElementById('tabs');
const manageStatus = document.getElementById('manage-status');
const adminGrid = document.getElementById('admin-grid');

let currentTab = 'cakes';       // which section's photos are being managed
let signedInUserId = null;      // remembers who is signed in

// Small helper: writes a message and colours it (type = 'error' or 'ok')
function setStatus(el, message, type) {
  el.textContent = message;
  el.className = 'status' + (type ? ' ' + type : '');
}

// ===========================================================
// SIGN IN / SIGN OUT
// ===========================================================

// If the keys in supabase-config.js are still empty, stop here
// and explain, instead of failing silently.
if (!sb) {
  loginView.hidden = false;
  loginForm.hidden = true;
  const note = document.createElement('p');
  note.className = 'status error';
  note.textContent = 'Not connected yet: add your Supabase URL and anon key in supabase-config.js.';
  loginView.appendChild(note);
} else {
  startApp();
}

async function startApp() {
  // Is someone already signed in from an earlier visit?
  const { data } = await sb.auth.getSession();
  showCorrectView(data.session);

  // Runs again whenever someone signs in or out
  sb.auth.onAuthStateChange(function (_event, session) {
    showCorrectView(session);
  });
}

function showCorrectView(session) {
  if (session) {
    // Already showing this user's dashboard? Do nothing.
    if (signedInUserId === session.user.id) return;
    signedInUserId = session.user.id;

    loginView.hidden = true;
    dashboardView.hidden = false;
    userEmailEl.textContent = session.user.email;
    buildTabs();
    loadImages();
  } else {
    signedInUserId = null;
    loginView.hidden = false;
    dashboardView.hidden = true;
  }
}

loginForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  loginBtn.disabled = true;
  setStatus(loginStatus, 'Signing in…');

  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById('login-email').value.trim(),
    password: document.getElementById('login-password').value
  });

  if (error) {
    setStatus(loginStatus, 'Could not sign in: ' + error.message, 'error');
  } else {
    setStatus(loginStatus, '');
    loginForm.reset();
  }
  loginBtn.disabled = false;
});

signoutBtn.addEventListener('click', function () {
  sb.auth.signOut();
});

// ===========================================================
// SHRINKING PHOTOS BEFORE UPLOAD
// Phone photos are often 4-8 MB. This resizes each one to at most
// 1600 pixels on its longest side, which looks sharp on a website
// but loads fast and saves storage space.
// If anything goes wrong, the original file is uploaded instead.
// ===========================================================
function compressImage(file) {
  const MAX_SIZE = 1600;   // pixels, longest side
  const QUALITY = 0.85;    // 0 to 1, higher = better quality but bigger file

  return new Promise(function (resolve) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function () {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIZE / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';       // white behind transparent PNGs
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(function (blob) {
        resolve(blob || file);
      }, 'image/jpeg', QUALITY);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

// ===========================================================
// UPLOADING
// For each chosen photo:
//   a) shrink it
//   b) save the file into the Storage bucket
//   c) add a row to the gallery_items table (category + link)
// ===========================================================
uploadForm.addEventListener('submit', async function (e) {
  e.preventDefault();

  const files = Array.from(fileInput.files);
  if (files.length === 0) {
    setStatus(uploadStatus, 'Please choose at least one photo first.', 'error');
    return;
  }

  const category = categorySelect.value;
  const caption = captionInput.value.trim();

  uploadBtn.disabled = true;
  let succeeded = 0;
  let failed = 0;
  let lastError = '';

  for (let i = 0; i < files.length; i++) {
    setStatus(uploadStatus, 'Uploading photo ' + (i + 1) + ' of ' + files.length + '…');

    try {
      const blob = await compressImage(files[i]);
      const isJpeg = blob.type === 'image/jpeg';
      const ext = isJpeg ? 'jpg' : (files[i].name.split('.').pop() || 'jpg').toLowerCase();

      // A unique file name so photos never overwrite each other
      const path = category + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

      const upload = await sb.storage.from(GALLERY_BUCKET).upload(path, blob, {
        contentType: blob.type || files[i].type,
        cacheControl: '31536000'
      });
      if (upload.error) throw upload.error;

      const publicUrl = sb.storage.from(GALLERY_BUCKET).getPublicUrl(path).data.publicUrl;

      const insert = await sb.from('gallery_items').insert({
        category: category,
        image_url: publicUrl,
        caption: caption || null
      });

      if (insert.error) {
        // Table save failed, so remove the file we just uploaded (no orphans)
        await sb.storage.from(GALLERY_BUCKET).remove([path]);
        throw insert.error;
      }

      succeeded++;
    } catch (err) {
      console.error('Upload failed:', err);
      lastError = err.message || String(err);
      failed++;
    }
  }

  if (failed === 0) {
    setStatus(uploadStatus, succeeded + ' photo(s) uploaded to ' + CATEGORIES[category] + '.', 'ok');
  } else {
    setStatus(uploadStatus, succeeded + ' uploaded, ' + failed + ' failed. Last error: ' + lastError, 'error');
  }

  uploadForm.reset();
  uploadBtn.disabled = false;

  // Jump the "Manage" list to the section we just uploaded into
  currentTab = category;
  buildTabs();
  loadImages();
});

// ===========================================================
// MANAGING UPLOADED PHOTOS (tabs, list, delete)
// ===========================================================
function buildTabs() {
  tabsEl.innerHTML = '';
  Object.keys(CATEGORIES).forEach(function (key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (key === currentTab ? ' active' : '');
    btn.textContent = CATEGORIES[key];
    btn.addEventListener('click', function () {
      currentTab = key;
      buildTabs();
      loadImages();
    });
    tabsEl.appendChild(btn);
  });
}

async function loadImages() {
  adminGrid.innerHTML = '';
  setStatus(manageStatus, 'Loading…');

  const { data, error } = await sb
    .from('gallery_items')
    .select('id, image_url, caption, is_cover')
    .eq('category', currentTab)
    .order('created_at', { ascending: false });

  if (error) {
    setStatus(manageStatus, 'Could not load photos: ' + error.message, 'error');
    return;
  }

  if (data.length === 0) {
    setStatus(manageStatus, 'No uploaded photos in ' + CATEGORIES[currentTab] + ' yet.');
    return;
  }

  setStatus(manageStatus, data.length + ' photo(s) in ' + CATEGORIES[currentTab] + '.');

  data.forEach(function (item) {
    const card = document.createElement('div');
    card.className = 'admin-item';

    const img = document.createElement('img');
    img.src = item.image_url;
    img.alt = item.caption || CATEGORIES[currentTab];
    img.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = item.caption || '';

        const coverBtn = document.createElement('button');
    coverBtn.type = 'button';
    coverBtn.className = 'cover-btn' + (item.is_cover ? ' active' : '');
    coverBtn.textContent = item.is_cover ? '★ Homepage cover' : 'Set as homepage cover';
    coverBtn.addEventListener('click', function () {
      setCover(item);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete-btn';
    del.textContent = 'Delete';
    del.addEventListener('click', function () {
      deleteItem(item);
    });

    meta.appendChild(cap);
    meta.appendChild(coverBtn);
    meta.appendChild(del);
    card.appendChild(img);
    card.appendChild(meta);
    adminGrid.appendChild(card);
  });
}

async function deleteItem(item) {
  if (!confirm('Delete this photo from the website? This cannot be undone.')) return;

  // 1) Remove the database row. ".select()" lets us confirm a row really went.
  const result = await sb
    .from('gallery_items')
    .delete()
    .eq('id', item.id)
    .select();

  if (result.error) {
    alert('Could not delete: ' + result.error.message);
    return;
  }
  if (!result.data || result.data.length === 0) {
    alert('Could not delete this photo (permission problem). Check the security rules in Supabase.');
    return;
  }

  // 2) Remove the actual image file from storage too.
  // The file path is everything after the bucket name in the photo's link.
  const marker = '/' + GALLERY_BUCKET + '/';
  const position = item.image_url.indexOf(marker);
  if (position !== -1) {
    const path = decodeURIComponent(item.image_url.slice(position + marker.length));
    await sb.storage.from(GALLERY_BUCKET).remove([path]);
  }

  loadImages();
}

async function setCover(item) {
  // First, unset any existing cover photo for this category (only one allowed)
  const clear = await sb
    .from('gallery_items')
    .update({ is_cover: false })
    .eq('category', currentTab);

  if (clear.error) {
    alert('Could not update: ' + clear.error.message);
    return;
  }

  // Then mark this one as the cover
  const set = await sb
    .from('gallery_items')
    .update({ is_cover: true })
    .eq('id', item.id);

  if (set.error) {
    alert('Could not update: ' + set.error.message);
    return;
  }

  loadImages();
}