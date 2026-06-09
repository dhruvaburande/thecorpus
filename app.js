/* DATA ARCHIVE LOADED FROM poems.js */
const database = Array.isArray(window.database) ? window.database : [];
const poemCollections = window.POEM_COLLECTIONS || {};

/* GLOBAL STATE MANAGER APP ARCHITECTURE */
let globalActiveCollection = 'all';
let globalActiveMood = 'all';
let globalActiveLanguage = 'all';
let fontSizeScalar = 1.35; 

/* INTERACTIVE DISPLAY MATRIX GENERATION ENGINE */
function buildInterfaceGrids() {
  const grid = document.getElementById('manifestGrid');
  const searchBar = document.getElementById('dashboardSearch');
  if(!grid) return;

  const query = searchBar ? searchBar.value.toLowerCase().trim() : '';
  grid.innerHTML = '';
  let dataset = database;
  
  if (globalActiveCollection !== 'all') {
    dataset = dataset.filter(item => item.collection === globalActiveCollection);
  }
  if (globalActiveMood !== 'all') {
    dataset = dataset.filter(item => item.mood === globalActiveMood);
  }
  if (globalActiveLanguage !== 'all') {
    dataset = dataset.filter(item => item.language === globalActiveLanguage);
  }
  if (query) {
    dataset = dataset.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.content.toLowerCase().includes(query) ||
      item.mood.toLowerCase().includes(query) ||
      (item.language && item.language.toLowerCase().includes(query))
    );
  }

  document.getElementById('totalCount').textContent = String(database.length).padStart(2, '0');
  document.getElementById('collectionCount').textContent = String(dataset.length).padStart(2, '0');
  if(dataset.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 4rem; text-align: center; color: var(--ink-dark); font-size: 0.9rem;">No entries match the structural query rules active.</div>`;
    return;
  }

  dataset.forEach(item => {
    const card = document.createElement('div');
    card.className = 'poem-card';
    card.setAttribute('role', 'article');
    const langDisplay = item.language || 'English';
    card.innerHTML = `
      <div class="card-mood-badge">
        <span>${item.mood}</span>
        <span class="card-lang">${langDisplay}</span>
      </div>
      <div class="card-title-row"><h4 class="card-title">${item.title}</h4><button class="heart-btn ${JSON.parse(localStorage.getItem('anthology_likes') || '[]').includes(item.id) ? 'liked' : ''}" onclick="event.stopPropagation(); toggleHeart('${item.id}')" aria-label="Like"><svg width="16" height="16" viewBox="0 0 24 24" fill="${JSON.parse(localStorage.getItem('anthology_likes') || '[]').includes(item.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></button></div>
      <p class="card-excerpt">${item.excerpt}</p>
      <div class="card-meta">
        <span>${item.id}</span>
        <span>${item.collection}</span>
      </div>
    `;
    
    // Mouse move parallax light tracker simulation
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--y', `${e.clientY - rect.top}px`);
    });

    if (item.pdfUrl) {
      card.addEventListener('click', () => window.open(item.pdfUrl, '_blank'));
    } else {
      card.addEventListener('click', () => triggerImmersiveReader(item.id));
    }
    grid.appendChild(card);
  });
}

/* DYNAMIC METADATA MOOD EXTRACTION AND AGGREGATION LAYER */
function rebuildMoodSelectorTags() {
  const container = document.getElementById('moodFilterContainer');
  if(!container) return;
  let targetedData = database;
  if(globalActiveCollection !== 'all') {
    targetedData = database.filter(i => i.collection === globalActiveCollection);
  }

  const moods = ['all', ...new Set(targetedData.map(item => item.mood))];
  container.innerHTML = moods.map(mood => `
    <div class="tag ${mood === globalActiveMood ? 'active' : ''}" onclick="filterByMood('${mood}')">${mood}</div>
  `).join('');
}

function rebuildLanguageSelectorTags() {
  const container = document.getElementById('languageFilterContainer');
  if(!container) return;

  const languages = ['all', ...new Set(database.map(item => item.language || 'English'))];
  container.innerHTML = languages.map(lang => `
    <div class="tag ${lang === globalActiveLanguage ? 'active' : ''}" onclick="filterByLanguage('${lang}')">${lang}</div>
  `).join('');
}

/* INTERACTIVE ENGINE LOGIC */
function switchGridCollection(col, el, ev) {
  if (ev) ev.preventDefault();
  globalActiveCollection = col;
  globalActiveMood = 'all';
  
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('gridTitleLabel').textContent = col;
  buildInterfaceGrids();
  rebuildMoodSelectorTags();
  rebuildLanguageSelectorTags();

  // Close hamburger menu after selection
  var siteNavbar = document.getElementById('siteNavbar');
  var menuToggle = document.getElementById('menuToggle');
  if (siteNavbar) siteNavbar.classList.remove('menu-open');
  if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
}

function filterByMood(mood) {
  globalActiveMood = mood;
  buildInterfaceGrids();
  rebuildMoodSelectorTags();
}

function filterByLanguage(lang) {
  globalActiveLanguage = lang;
  buildInterfaceGrids();
  rebuildLanguageSelectorTags();
}

function triggerImmersiveReader(id) {
  const item = database.find(i => i.id === id);
  if(!item) return;

  document.getElementById('modalTitle').textContent = item.title;
  document.getElementById('modalMood').textContent = item.mood;
  document.getElementById('modalContent').textContent = item.content;
  document.getElementById('modalMetaId').textContent = item.id;
  document.getElementById('modalMetaCollection').textContent = item.collection;
  document.getElementById('modalMetaLanguage').textContent = item.language || 'English';

  document.getElementById('immersiveReader').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeImmersiveReader() {
  document.getElementById('immersiveReader').classList.remove('active');
  document.body.style.overflow = '';
}

// Click outside the drawer to close
document.getElementById('immersiveReader').addEventListener('click', function(e) {
  const drawer = this.querySelector('.modal-drawer');
  if (!drawer.contains(e.target)) {
    closeImmersiveReader();
  }
});

// Contact link: phone → Gmail app, laptop → Gmail in browser
function handleContact(e) {
  var isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
  if (isMobile) {
    e.preventDefault();
    window.location.href = 'mailto:dburande0124@gmail.com';
  }
}

function triggerSurpriseMe(ev) {
  if (ev) ev.preventDefault();

  // Close hamburger menu
  var siteNavbar = document.getElementById('siteNavbar');
  var menuToggle = document.getElementById('menuToggle');
  if (siteNavbar) siteNavbar.classList.remove('menu-open');
  if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');

  if (!database.length) {
    showToast('Poem archive missing. Please check poems.js.');
    return;
  }

  const randomItem = database[Math.floor(Math.random() * database.length)];
  
  if (randomItem.pdfUrl) {
    window.open(randomItem.pdfUrl, '_blank');
  } else {
    triggerImmersiveReader(randomItem.id);
  }
  
  showToast(`Manifesting: ${randomItem.title}`);
}

function showToast(msg) {
  const toast = document.getElementById('toastBox');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// Text resizing controls
document.getElementById('modalTextIncrease').addEventListener('click', () => {
  fontSizeScalar += 0.1;
  document.getElementById('modalContent').style.fontSize = `${fontSizeScalar}rem`;
});
document.getElementById('modalTextDecrease').addEventListener('click', () => {
  fontSizeScalar = Math.max(0.8, fontSizeScalar - 0.1);
  document.getElementById('modalContent').style.fontSize = `${fontSizeScalar}rem`;
});

// Search functionality
document.getElementById('dashboardSearch').addEventListener('input', buildInterfaceGrids);

// Theme Toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  const body = document.body;
  const current = body.getAttribute('data-theme');
  body.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
});
// Mobile hamburger dropdown toggle
const siteNavbar = document.getElementById('siteNavbar');
const menuToggle = document.getElementById('menuToggle');

if (siteNavbar && menuToggle) {
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNavbar.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      siteNavbar.classList.remove('menu-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.addEventListener('click', event => {
    const clickedInsideNavbar = siteNavbar.contains(event.target);
    if (!clickedInsideNavbar) {
      siteNavbar.classList.remove('menu-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });
}


// Pen Ink Scroll Effect Calculation
window.addEventListener('scroll', () => {
  const inkLine = document.getElementById('inkLine');
  if(!inkLine) return;
  // Calculate scroll percentage
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
  if(scrollHeight <= 0) return; // Prevent division by zero
  const scrolled = Math.min(100, Math.max(0, (window.scrollY / scrollHeight) * 100));
  inkLine.style.height = `${scrolled}%`;
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  buildInterfaceGrids();
  rebuildMoodSelectorTags();
  rebuildLanguageSelectorTags();

  // Trigger initial scroll calculate
    window.dispatchEvent(new Event('scroll'));
});

// Disable right-click context menu
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  showToast('Content is protected. Copying is not allowed.');
});

// Disable copy/select/save/print/view-source AND devtools shortcuts
document.addEventListener('keydown', function(e) {
  const k = (e.key || '').toLowerCase();

  // Ctrl/Cmd + C, A, X, U, S, P
  if ((e.ctrlKey || e.metaKey) && ['c', 'a', 'x', 'u', 's', 'p'].includes(k)) {
    e.preventDefault();
    showToast('Content is protected.');
    return;
  }

  // F12 (DevTools)
  if (k === 'f12') {
    e.preventDefault();
    showToast('Content is protected.');
    return;
  }

  // Ctrl/Cmd + Shift + I / J / C  and  Cmd + Opt + I / J / C  (DevTools / inspector)
  if ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey) && ['i', 'j', 'c'].includes(k)) {
    e.preventDefault();
    showToast('Content is protected.');
    return;
  }

  // Cmd/Ctrl + Shift + S / 3 / 4 / 5  (macOS & browser screenshot capture)
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['s', '3', '4', '5'].includes(k)) {
    e.preventDefault();
    triggerProtectionBlur();
    showToast('Screenshots are not permitted on this site.');
    return;
  }
});

// Disable copy event
document.addEventListener('copy', function(e) {
  e.preventDefault();
  showToast('Copying is disabled on this site.');
});

// Disable cut event
document.addEventListener('cut', function(e) {
  e.preventDefault();
});

// Disable selectstart (extra layer over CSS user-select: none)
document.addEventListener('selectstart', function(e) {
  e.preventDefault();
});

// Disable dragging of images/text (prevents drag-to-save and drag-to-copy)
document.addEventListener('dragstart', function(e) {
  e.preventDefault();
});

// Shared blur/overlay helper for screenshot deterrence
let __protectTimer = null;
function showProtectionOverlay() {
  const overlay = document.getElementById('screenshotOverlay');
  if (overlay) overlay.style.display = 'flex';
  document.body.style.filter = 'blur(14px)';
}
function hideProtectionOverlay() {
  const overlay = document.getElementById('screenshotOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.filter = '';
}
function triggerProtectionBlur(duration) {
  showProtectionOverlay();
  if (__protectTimer) clearTimeout(__protectTimer);
  __protectTimer = setTimeout(hideProtectionOverlay, duration || 2500);
}

// Screenshot / screen capture deterrent
(function() {
  // Blur content when window loses focus (e.g. Alt+Tab, screenshot tools)
  window.addEventListener('blur', showProtectionOverlay);

  // Restore when window regains focus
  window.addEventListener('focus', hideProtectionOverlay);

  // Detect Print Screen key (Windows) - limited browser support
  document.addEventListener('keyup', function(e) {
    if (e.key === 'PrintScreen') {
      // Attempt to blank the clipboard so a captured image isn't pasteable
      navigator.clipboard.writeText('').catch(() => {});
      triggerProtectionBlur(2500);
      showToast('Screenshots are not permitted on this site.');
    }
  });

  // Detect visibility change (tab switch, screen recording apps on some devices)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      showProtectionOverlay();
    } else {
      hideProtectionOverlay();
    }
  });
})();


// Logo Dropdown Toggle
(function() {
  const toggle = document.getElementById('logoDropdownToggle');
  const panel = document.getElementById('logoDropdownPanel');
  if (!toggle || !panel) return;

  function positionPanel() {
    if (window.innerWidth <= 900) {
      var rect = toggle.getBoundingClientRect();
      panel.style.top = (rect.bottom + 10 + window.scrollY) + 'px';
    } else {
      panel.style.top = '';
    }
  }

  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = panel.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) positionPanel();
  });

  // Close when clicking outside
  document.addEventListener('click', function(e) {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) {
      panel.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();


// Sign-In via Logo Dropdown
function handleLogoSignInClick() {
  var user = getUser();
  if (user) {
    // Signed in — sign out
    handleSignOut();
  } else {
    openSignInModal();
  }
}

// Heart / Like Toggle
function toggleHeart(poemId) {
  var user = JSON.parse(localStorage.getItem('anthology_user') || 'null');
  if (!user) {
    showToast('Please sign in to like poems.');
    openSignInModal();
    return;
  }
  var likes = JSON.parse(localStorage.getItem('anthology_likes') || '[]');
  var idx = likes.indexOf(poemId);
  if (idx > -1) {
    likes.splice(idx, 1);
  } else {
    likes.push(poemId);
  }
  localStorage.setItem('anthology_likes', JSON.stringify(likes));
  buildInterfaceGrids();
}

// Sign-In State
const GOOGLE_CLIENT_ID = '766198434917-afp4sa1nq6f5otme8cc5rmttfdiagiu3.apps.googleusercontent.com';
const BACKEND_URL = 'http://localhost:3000'; // Change to your production URL

function getUser() {
  return JSON.parse(localStorage.getItem('anthology_user') || 'null');
}

function updateSignInButton() {
  var user = getUser();
  var btn = document.getElementById('logoSignInBtn');
  if (!btn) return;
  if (user) {
    btn.classList.add('signed-in');
    const avatar = user.picture 
      ? `<img src="${user.picture}" class="logo-signin-avatar" style="object-fit: cover;">`
      : `<span class="logo-signin-avatar">${user.name.charAt(0).toUpperCase()}</span>`;
    btn.innerHTML = avatar + '<span class="logo-signin-text">' + user.name + '</span>';
  } else {
    btn.classList.remove('signed-in');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span class="logo-signin-text">Sign In</span>';
  }
}

function openSignInModal() {
  var modal = document.getElementById('signInModal');
  if (modal) {
    modal.classList.add('active');
    initGoogleAuth();
  }
}

function closeSignInModal() {
  var modal = document.getElementById('signInModal');
  if (modal) {
    modal.classList.remove('active');
    const errorMsg = document.getElementById('authErrorMessage');
    if (errorMsg) errorMsg.style.display = 'none';
  }
}

function initGoogleAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initGoogleAuth, 100);
    return;
  }
  
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  
  const parent = document.getElementById('g_id_signin');
  if (parent) {
    parent.innerHTML = ''; // Clear previous button
    google.accounts.id.renderButton(parent, {
      theme: document.body.getAttribute('data-theme') === 'light' ? 'outline' : 'filled_blue',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: '280'
    });
  }
}

async function handleCredentialResponse(response) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: response.credential })
    });

    if (!res.ok) throw new Error('Backend verification failed');

    const data = await res.json();
    localStorage.setItem('anthology_user', JSON.stringify({ ...data.user, signedIn: true }));
    
    closeSignInModal();
    updateSignInButton();
    showToast('Welcome, ' + data.user.name + '!');
    if (typeof buildInterfaceGrids === 'function') buildInterfaceGrids();

    const panel = document.getElementById('logoDropdownPanel');
    const toggle = document.getElementById('logoDropdownToggle');
    if (panel) panel.classList.remove('open');
    if (toggle) { toggle.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }

  } catch (error) {
    console.error('Auth Error:', error);
    const errorMsg = document.getElementById('authErrorMessage');
    if (errorMsg) {
      errorMsg.textContent = 'Authentication failed. Please check your connection or Client ID.';
      errorMsg.style.display = 'block';
    }
  }
}

function handleSignOut() {
  var user = getUser();
  var name = user ? user.name : '';
  localStorage.removeItem('anthology_user');
  updateSignInButton();
  showToast('Signed out' + (name ? ', ' + name : '') + '.');
  if (typeof buildInterfaceGrids === 'function') buildInterfaceGrids();
}

// Close sign-in modal on backdrop click
document.getElementById('signInModal').addEventListener('click', function(e) {
  if (e.target === this) closeSignInModal();
});

// Initialize sign-in button on load
updateSignInButton();

// Scroll-to-Top Button Logic
(function() {
  const btn = document.getElementById('scrollTopBtn');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
