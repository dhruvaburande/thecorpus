(() => {
  'use strict';

  const database = Array.isArray(window.database) ? window.database : [];
  // Atlas contains a lightweight metadata index. Full poem text is fetched from
  // a small static chunk only when a reader opens an Atlas entry.
  const atlas = Array.isArray(window.ATLAS_POEMS) ? window.ATLAS_POEMS : [];
  const atlasChunkCache = new Map();
  const loadedAtlasItems = new Map();
  const countries = Array.isArray(window.COUNTRY_POINTS) ? window.COUNTRY_POINTS : [];
  const worldGeo = window.WORLD_GEOJSON && Array.isArray(window.WORLD_GEOJSON.features) ? window.WORLD_GEOJSON.features : [];
  const borrowedMeta = window.BORROWED_LEDGER_META || {};
  const readingPaths = Array.isArray(window.READING_PATHS) ? window.READING_PATHS : [];
  const allReadable = [...database, ...atlas];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const contrastForColors = (...colors) => {
    const luminances = colors.map(color => {
      const hex = String(color || '').replace('#', '');
      if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;
      const [r, g, b] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
      const linear = value => value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
      return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
    });
    const average = luminances.reduce((sum, value) => sum + value, 0) / Math.max(1, luminances.length);
    return average > .42 ? '#0b0d0c' : '#ffffff';
  };

  const collectionLabels = {
    all: 'All Works',
    'Written by Hand': 'Original Poems',
    'Borrowed Ledger': 'Borrowed Ledger',
    Research: 'Research Notes'
  };

  const eras = [
    { id: 'all', label: 'All Eras', range: 'Complete timeline', test: () => true },
    { id: 'ancient', label: 'Ancient / Classical', range: 'before 500 CE', test: y => Number.isFinite(y) && y < 500 },
    { id: 'medieval', label: 'Medieval', range: '500–1499', test: y => Number.isFinite(y) && y >= 500 && y < 1500 },
    { id: 'early-modern', label: 'Renaissance / Early Modern', range: '1500–1699', test: y => Number.isFinite(y) && y >= 1500 && y < 1700 },
    { id: 'romantic', label: 'Enlightenment / Romantic', range: '1700–1899', test: y => Number.isFinite(y) && y >= 1700 && y < 1900 },
    { id: 'modern', label: 'Modernist', range: '1900–1945', test: y => Number.isFinite(y) && y >= 1900 && y <= 1945 },
    { id: 'contemporary', label: 'Contemporary', range: '1946 onward', test: y => Number.isFinite(y) && y > 1945 }
  ];

  const latinCountries = new Set(['Argentina','Bolivia','Brazil','Chile','Colombia','Costa Rica','Cuba','Dominican Republic','Ecuador','El Salvador','Guatemala','Haiti','Honduras','Mexico','Nicaragua','Panama','Paraguay','Peru','Puerto Rico','Uruguay','Venezuela','Belize','Guyana','Suriname','French Guiana']);
  const aliases = new Map([
    ['United States', 'United States of America'],
    ['United States of America', 'United States of America'],
    ['USA', 'United States of America'],
    ['UK', 'United Kingdom'],
    ['Czechia', 'Czech Republic']
  ]);
  const canonicalCountry = name => aliases.get(name) || name;

  const themePalettes = [
    { id: 'corpus', name: 'Corpus Gold', dark: ['#c9a96e', '#66a5a0', '#8f5c6d'], light: ['#71683c', '#526b70', '#7d5f65'] },
    { id: 'pelagic', name: 'Pelagic Ink', dark: ['#6fb7d6', '#d69b6f', '#9f6fd6'], light: ['#4e6f7f', '#806449', '#6e5f86'] },
    { id: 'verdigris', name: 'Verdigris Ash', dark: ['#67b99a', '#b96786', '#8667b9'], light: ['#557468', '#7b5d66', '#665f7f'] },
    { id: 'ember', name: 'Ember Manuscript', dark: ['#d98262', '#62d9c0', '#8062d9'], light: ['#80604f', '#4d7770', '#615a83'] },
    { id: 'nocturne', name: 'Nocturne Violet', dark: ['#9b8cff', '#ffcf8c', '#8cffbc'], light: ['#636488', '#85704b', '#5f7d6a'] },
    { id: 'moss', name: 'Moss & Copper', dark: ['#9fba6a', '#6a85ba', '#ba6a85'], light: ['#697457', '#5e6b83', '#7d5f69'] },
    { id: 'rose', name: 'Rose Circuit', dark: ['#d4779f', '#9fd477', '#779fd4'], light: ['#7f5d68', '#687a55', '#5d6f86'] },
    { id: 'solar', name: 'Solar Tide', dark: ['#e0b84f', '#4fe0b8', '#b84fe0'], light: ['#7b6e45', '#4f7770', '#725c7b'] },
    { id: 'slate', name: 'Slate Orchard', dark: ['#8aa3b8', '#b88a9f', '#9fb88a'], light: ['#5f6f78', '#78636a', '#6b7860'] },
    { id: 'indigo', name: 'Indigo Marigold', dark: ['#7f9cff', '#ffdf7f', '#ff7fe2'], light: ['#5c668c', '#86784f', '#82627a'] }
  ];

  const state = {
    collection: 'Written by Hand',
    mood: 'all',
    sort: 'archive',
    query: '',
    currentId: null,
    currentItem: null,
    originalMode: false,
    visible: [],
    featuredId: 'WBH-004',
    readerSize: Number(localStorage.getItem('corpus_reader_size') || 1.35),
    country: null,
    era: 'all',
    poet: 'all',
    countryQuery: '',
    eraQuery: '',
    countryVisible: [],
    countryLimit: 120,
    eraLimit: 220,
    globe: { rotation: -0.65, tilt: 0.18, zoom: 1, dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, downAt: 0, moved: 0, projected: [], hover: null },
    poetIndexSelected: null
  };

  function isAtlas(item) { return Boolean(item && item.atlas_id); }
  function itemId(item) { return item.atlas_id || item.id; }
  function findItem(id) {
    return database.find(i => i.id === id)
      || loadedAtlasItems.get(id)
      || atlas.find(i => i.atlas_id === id || i.id === id);
  }
  function wordCount(item) { return String(item.content || item.fulltext || item.excerpt || '').trim().split(/\s+/).filter(Boolean).length; }
  function readingTime(item) { return `${Math.max(1, Math.ceil(wordCount(item) / 180))} min read`; }
  function contentOf(item) { return item.content || item.fulltext || (Array.isArray(item.text) ? item.text.join('\n') : '') || item.excerpt || 'Text unavailable.'; }
  function languageOf(item) { const meta = borrowedMeta[item && item.id] || {}; return meta.language || item.language || 'English'; }
  function dateOf(item) {
    const meta = borrowedMeta[item && item.id] || {};
    if (meta.publication_date) return meta.publication_date;
    if (item.publication_date && !String(item.publication_date).toLowerCase().includes('corpus') && !String(item.publication_date).toLowerCase().includes('author life')) return item.publication_date;
    if (Number.isFinite(item.year)) return `${item.approx ? 'c. ' : 'c. '}${item.year < 0 ? Math.abs(item.year) + ' BCE' : item.year}`;
    return item.collection === 'Written by Hand' ? 'Contemporary / author archive' : 'Unknown';
  }
  function authorOf(item) {
    const meta = borrowedMeta[item && item.id] || {};
    if (meta.author) return meta.author;
    if (item.author || item.poet) return item.author || item.poet;
    if (item.collection === 'Written by Hand') return 'Dhruva Burande';
    const first = String(item.content || '').split('\n')[0] || '';
    if (first.includes('—')) return first.split('—').pop().trim();
    if (item.title === 'Simulacra and Simulation') return 'Jean Baudrillard';
    return 'Unknown / attributed source';
  }
  function originalCollectionOf(item) {
    const meta = borrowedMeta[item && item.id] || {};
    if (meta.original_collection) return meta.original_collection;
    if (isAtlas(item)) return item.original_collection || item.place || `${item.country || 'World'} literary tradition`;
    return item.collection === 'Written by Hand' ? 'The Corpus — Written by Hand' : item.collection || 'The Corpus';
  }
  function publisherOf(item) {
    const meta = borrowedMeta[item && item.id] || {};
    if (meta.publisher) return meta.publisher;
    if (isAtlas(item)) return item.publisher || item.credit || 'Source details unavailable';
    if (item.collection === 'Written by Hand') return 'The Corpus — author archive / unpublished';
    if (item.pdfUrl) return item.pdfUrl;
    return 'Borrowed Ledger — source verification recommended';
  }
  function countryOf(item) {
    const meta = borrowedMeta[item && item.id] || {};
    return meta.country || item.country || '';
  }
  function poetOf(item) {
    return authorOf(item);
  }
  function isWorldLiterature(item) {
    return isAtlas(item) || item.collection === 'Borrowed Ledger';
  }
  function worldLiteratureItems() {
    return [...database.filter(item => item.collection === 'Borrowed Ledger'), ...atlas];
  }
  function previewLines(item, count = 2) {
    return contentOf(item).split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, count).join('\n');
  }
  function eraForItem(item) {
    const meta = borrowedMeta[item && item.id] || {};
    const raw = clean(meta.era || item.era || '');
    const explicit = eras.find(era => era.id === raw || clean(era.label) === raw);
    if (explicit && explicit.id !== 'all') return explicit;
    const year = eraYear(item);
    return eras.find(era => era.id !== 'all' && era.test(year)) || null;
  }
  function itemHaystack(item) {
    const themes = Array.isArray(item.themes) ? item.themes.join(' ') : '';
    return clean([
      item.title, poetOf(item), countryOf(item), languageOf(item), item.mood,
      item.era, themes, dateOf(item), originalCollectionOf(item), publisherOf(item),
      previewLines(item, 6), contentOf(item)
    ].join(' '));
  }
  function tagsForItem(item) {
    const tags = [];
    const add = (label, value, action = 'search', filterValue = value) => {
      const shown = String(value || '').trim();
      if (!shown || /^unknown/i.test(shown)) return;
      if (!tags.some(tag => tag.label === label && tag.value === shown)) {
        tags.push({ label, value: shown, action, filterValue: String(filterValue || shown) });
      }
    };
    const era = eraForItem(item);
    add('Poet', poetOf(item), 'poet');
    add('Country', countryOf(item), 'country');
    add('Mood', item.mood, 'search');
    add('Language', languageOf(item), 'search');
    if (era) add('Publication Era', era.label, 'era', era.id);
    add('Collection', originalCollectionOf(item), 'search');
    const themes = Array.isArray(item.themes) ? item.themes : [];
    themes.slice(0, 6).forEach(theme => add('Theme', theme, 'search'));
    return tags;
  }
  function contentNote(item) {
    const text = clean(`${item.title} ${item.mood || ''} ${item.excerpt || ''} ${item.content || ''} ${item.fulltext || ''}`);
    const notes = [];
    if (/suicide|self-harm|self harm|blade|wrist/.test(text)) notes.push('self-harm imagery');
    if (/blood|corpse|guts|kill|murder|death|dying|wound|violence/.test(text)) notes.push('violence/death imagery');
    if (/god|sermon|prayer|cathedral|faith|christ/.test(text)) notes.push('religious imagery');
    return notes.length ? `Content note: ${[...new Set(notes)].join(', ')}.` : '';
  }

  function getFavorites() { try { return JSON.parse(localStorage.getItem('corpus_favorites') || '[]'); } catch { return []; } }
  function setFavorites(ids) { localStorage.setItem('corpus_favorites', JSON.stringify([...new Set(ids)])); updateFavoriteCount(); }
  function getRecent() { try { return JSON.parse(localStorage.getItem('corpus_recent') || '[]'); } catch { return []; } }
  function setRecent(ids) { localStorage.setItem('corpus_recent', JSON.stringify(ids.slice(0, 8))); }

  function filteredData() {
    let rows = database.filter(item => item.collection === 'Written by Hand');
    if (state.mood !== 'all') rows = rows.filter(item => item.mood === state.mood);
    if (state.query) {
      const q = clean(state.query);
      rows = rows.filter(item => [item.title, item.id, item.collection, item.mood, item.language, item.excerpt, item.content].some(field => clean(field).includes(q)));
    }
    rows.sort((a, b) => {
      if (state.sort === 'title') return a.title.localeCompare(b.title);
      if (state.sort === 'collection') return a.collection.localeCompare(b.collection) || a.id.localeCompare(b.id);
      if (state.sort === 'mood') return a.mood.localeCompare(b.mood) || a.title.localeCompare(b.title);
      if (state.sort === 'reading') return wordCount(a) - wordCount(b);
      return database.indexOf(a) - database.indexOf(b);
    });
    return rows;
  }

  function updateStats() {
    const original = database.filter(i => i.collection === 'Written by Hand').length;
    const borrowed = database.filter(i => i.collection === 'Borrowed Ledger').length;
    $('#statTotal').textContent = String(database.length).padStart(2, '0');
    $('#statOriginal').textContent = String(original).padStart(2, '0');
    $('#statBorrowed').textContent = String(borrowed).padStart(2, '0');
    $('#statShowing').textContent = String(state.visible.length).padStart(2, '0');
    const atlasActive = Boolean(state.country) || state.era !== 'all' || state.poet !== 'all';
    if ($('#statManuscripts')) $('#statManuscripts').textContent = String(allReadable.length).padStart(3, '0');
    if ($('#statActiveSegments')) $('#statActiveSegments').textContent = String(atlasActive ? state.countryVisible.length : state.visible.length).padStart(3, '0');
    if ($('#statAtlasDepth')) $('#statAtlasDepth').textContent = String(atlas.length).padStart(3, '0');
  }

  function updateFavoriteCount() { if ($('#favoriteCount')) $('#favoriteCount').textContent = String(getFavorites().length); }

  function renderMoodSelect() {
    const select = $('#moodSelect');
    const scoped = database.filter(i => i.collection === 'Written by Hand');
    const moods = ['all', ...new Set(scoped.map(item => item.mood).filter(Boolean).sort((a, b) => a.localeCompare(b)))];
    if (!moods.includes(state.mood)) state.mood = 'all';
    select.innerHTML = moods.map(mood => `<option value="${escapeHTML(mood)}">${mood === 'all' ? 'All moods' : escapeHTML(mood)}</option>`).join('');
    select.value = state.mood;
  }

  function syncControls() {
    state.collection = 'Written by Hand';
    $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.collection === 'Written by Hand'));
    setTopNavActive('collection');
    $('#sortSelect').value = state.sort;
    $('#archiveTitle').textContent = 'Written by Hand';
    const parts = [`${state.visible.length} original poem${state.visible.length === 1 ? '' : 's'}`];
    if (state.mood !== 'all') parts.push(state.mood);
    if (state.query) parts.push(`“${state.query}”`);
    $('#resultSummary').textContent = `Showing ${parts.join(' · ')}.`;
  }

  function renderArchive(list = null) {
    const grid = $('#archiveGrid');
    state.visible = list || filteredData();
    updateStats();
    syncControls();
    if (!state.visible.length) {
      grid.innerHTML = `<div class="empty-state"><h3>No works found</h3><p>Try clearing the mood or search filter.</p><button class="primary-btn" id="emptyClear">Clear filters</button></div>`;
      $('#emptyClear').addEventListener('click', clearFilters);
      return;
    }
    const favorites = getFavorites();
    grid.innerHTML = state.visible.map(item => {
      const id = itemId(item);
      const note = contentNote(item);
      const isFav = favorites.includes(id);
      return `
        <article class="poem-card" data-open="${escapeHTML(id)}" tabindex="0" role="button" aria-label="Open ${escapeHTML(item.title)}">
          <div class="poem-top">
            <span class="poem-id">${escapeHTML(id)}</span>
            <button class="favorite-mini ${isFav ? 'active' : ''}" data-favorite="${escapeHTML(id)}" aria-label="${isFav ? 'Remove favorite' : 'Save favorite'}">♥</button>
          </div>
          <p class="poem-mood">${escapeHTML(item.mood || (isAtlas(item) ? item.country : 'Poem'))}</p>
          <h3>${escapeHTML(item.title)}</h3>
          <p class="excerpt">${escapeHTML(item.excerpt || 'Open this entry to read more.')}</p>
          ${note ? `<span class="content-chip">Content note</span>` : ''}
          <div class="poem-bottom">
            <span class="poem-collection">${escapeHTML(isAtlas(item) ? 'World Atlas' : (collectionLabels[item.collection] || item.collection))}</span>
            <span class="reading-time">${readingTime(item)}</span>
          </div>
        </article>`;
    }).join('');
  }

  function renderFeatured() {
    const pool = database.filter(p => p.collection === 'Written by Hand');
    if (!pool.length) return;
    const preferred = pool[Math.floor(Math.random() * pool.length)];
    state.featuredId = preferred.id;
    $('#featuredTitle').textContent = preferred.title;
    $('#featuredExcerpt').textContent = `${preferred.mood} · ${readingTime(preferred)} — ${String(preferred.excerpt || '').replace(/\n/g, ' ')}`;
  }

  function renderMoodMap() {
    const map = $('#moodMap');
    const groups = new Map();
    database.forEach(item => {
      const primary = String(item.mood || 'Unsorted').split('/')[0].trim();
      if (!groups.has(primary)) groups.set(primary, []);
      groups.get(primary).push(item);
    });
    const topGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
    map.innerHTML = topGroups.map(([mood, items]) => `
      <article class="mood-group">
        <h3>${escapeHTML(mood)}</h3>
        ${items.slice(0, 4).map(item => `<button data-open="${escapeHTML(item.id)}">${escapeHTML(item.title)}</button>`).join('')}
      </article>`).join('');
  }

  function sourceLabel(item) {
    if (item.collection === 'Written by Hand') return 'Written by Hand';
    if (item.collection === 'Borrowed Ledger') return `${countryOf(item) || 'World Literature'} · ${poetOf(item)}`;
    if (isAtlas(item)) return `${countryOf(item) || 'Atlas'} · ${poetOf(item)}`;
    return item.collection || 'The Corpus';
  }
  function renderHeroSearchResults() {
    const panel = $('#heroSearchResults');
    if (!panel) return;
    const q = clean(state.query);
    if (!q) {
      panel.classList.remove('active');
      panel.innerHTML = '';
      return;
    }
    const pool = [...database.filter(item => item.collection === 'Written by Hand'), ...worldLiteratureItems(), ...database.filter(item => item.collection === 'Research')];
    const seen = new Set();
    const matches = [];
    for (const item of pool) {
      const id = itemId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      if (itemHaystack(item).includes(q)) matches.push(item);
      if (matches.length >= 18) break;
    }
    panel.classList.add('active');
    panel.innerHTML = matches.length
      ? `<div class="hero-search-head"><span>${matches.length} result${matches.length === 1 ? '' : 's'}</span><span>Click to read</span></div><div class="hero-search-list">${matches.map(item => `<button class="hero-search-item" data-open="${escapeHTML(itemId(item))}"><span>${escapeHTML(sourceLabel(item))} · ${escapeHTML(dateOf(item))}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(previewLines(item, 2))}</small></button>`).join('')}</div>`
      : `<div class="hero-search-empty">No poems match “${escapeHTML(state.query)}”. Try a title, poet, country, mood, or line.</div>`;
  }


  function renderReadingPaths() {
    const root = $('#pathsGrid');
    if (!root) return;
    
    let cardsHTML = readingPaths.map((path, index) => {
      const poems = (path.poems || []).map(id => findItem(id)).filter(Boolean);
      const first = poems[0];
      return `<article class="path-card" style="--path-index:${index + 1}">
        <div class="path-orb" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
        <p class="eyebrow">${escapeHTML(path.title)}</p>
        <h3>${escapeHTML(path.description || 'Curated path')}</h3>
        <div class="path-poems compact">${poems.slice(0, 2).map(item => `<button data-open="${escapeHTML(itemId(item))}"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(poetOf(item))}</span></button>`).join('')}</div>
        ${first ? `<button class="path-start" data-open="${escapeHTML(itemId(first))}">Begin path · ${poems.length} poem${poems.length === 1 ? '' : 's'}</button>` : ''}
      </article>`;
    });

    const customIDs = getCustomPath();
    if (customIDs.length > 0) {
      const customPoems = customIDs.map(id => findItem(id)).filter(Boolean);
      if (customPoems.length > 0) {
        const firstCustom = customPoems[0];
        const index = readingPaths.length;
        const shareURL = `${location.origin}${location.pathname}?path=${customIDs.join(',')}`;
        const customCardHTML = `<article class="path-card custom-path-card" style="--path-index:${index + 1}">
          <div class="path-orb" aria-hidden="true">★</div>
          <p class="eyebrow">My Curated Route</p>
          <h3>A personalized reading path across global poetry</h3>
          <div class="path-poems compact" style="max-height:120px; overflow-y:auto; scrollbar-width:thin;">
            ${customPoems.map(item => `<button data-open="${escapeHTML(itemId(item))}"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(poetOf(item))}</span></button>`).join('')}
          </div>
          <div style="display:flex; gap:0.4rem; margin-top:0.85rem; flex-wrap:wrap; width:100%;">
            <button class="path-start" data-open="${escapeHTML(itemId(firstCustom))}" style="flex:1; margin-top:0;">Begin Path</button>
            <button class="secondary-btn" style="padding-inline:0.6rem; min-height:36px; font-size:0.75rem;" onclick="event.stopPropagation(); navigator.clipboard.writeText('${shareURL}').then(() => alert('Shareable Path Link Copied!'))">Share</button>
            <button class="secondary-btn" style="padding-inline:0.45rem; min-height:36px;" onclick="event.stopPropagation(); localStorage.removeItem('corpus_custom_path'); location.reload();">×</button>
          </div>
        </article>`;
        cardsHTML.push(customCardHTML);
      }
    }

    root.innerHTML = cardsHTML.join('') || '<p class="empty-mini">No reading paths yet.</p>';
  }

  function poetRows() {
    const map = new Map();
    for (const item of [...database.filter(p => p.collection === 'Written by Hand'), ...worldLiteratureItems()]) {
      const name = poetOf(item);
      if (!map.has(name)) map.set(name, { name, countries: new Set(), collections: new Set(), poems: [] });
      const row = map.get(name);
      row.poems.push(item);
      if (countryOf(item)) row.countries.add(countryOf(item));
      row.collections.add(item.collection === 'Written by Hand' ? 'Written by Hand' : 'World Literature');
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderPoetIndex() {
    const root = $('#poetIndexGrid');
    if (!root) return;
    const q = clean($('#poetIndexSearch')?.value || '');
    const rowsAll = poetRows();
    const selected = state.poetIndexSelected ? rowsAll.find(row => row.name === state.poetIndexSelected) : null;

    if (selected) {
      if ($('#poetIndexCount')) $('#poetIndexCount').textContent = `${selected.poems.length} poem${selected.poems.length === 1 ? '' : 's'} by ${selected.name}`;
      root.innerHTML = `<article class="poet-detail-card">
        <div class="poet-detail-head">
          <button class="secondary-btn" data-poet-back type="button">← Back to poets</button>
          <div><p class="eyebrow">Selected Poet</p><h3>${escapeHTML(selected.name)}</h3><span>${escapeHTML([...selected.countries].join(', ') || 'The Corpus')} · ${escapeHTML([...selected.collections].join(' / '))}</span></div>
        </div>
        <div class="poet-poem-list">${selected.poems.map(item => `<button data-open="${escapeHTML(itemId(item))}"><span>${escapeHTML(dateOf(item))}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(previewLines(item, 2))}</small></button>`).join('')}</div>
      </article>`;
      return;
    }

    if (!q) {
      if ($('#poetIndexCount')) $('#poetIndexCount').textContent = 'Search poets';
      root.innerHTML = '';
      return;
    }

    const rows = rowsAll.filter(row => clean([row.name, [...row.countries].join(' '), [...row.collections].join(' ')].join(' ')).includes(q));
    if ($('#poetIndexCount')) $('#poetIndexCount').textContent = `${rows.length} poet${rows.length === 1 ? '' : 's'} found`;
    root.innerHTML = rows.map(row => `<button class="poet-select-card" data-poet-select="${escapeHTML(row.name)}"><h3>${escapeHTML(row.name)}</h3><p>${escapeHTML([...row.countries].join(', ') || 'The Corpus')}</p><span>${row.poems.length} available poem${row.poems.length === 1 ? '' : 's'}</span></button>`).join('') || '<p class="empty-mini">No poets match this search.</p>';
  }

  function setCollection(collection) {
    state.collection = 'Written by Hand';
    state.mood = 'all';
    renderMoodSelect();
    renderArchive();
    setTopNavActive('collection');
    closeMenu();
    location.hash = '#archive';
  }

  function clearFilters() {
    state.collection = 'Written by Hand'; state.mood = 'all'; state.sort = 'archive'; state.query = '';
    $('#archiveSearch').value = '';
    renderMoodSelect(); renderArchive(); renderHeroSearchResults();
  }

  function isLatinCountry(name, subregion = '') { return latinCountries.has(canonicalCountry(name)) || /Latin|Caribbean|South America|Central America/i.test(subregion); }
  function selectedRegionInfo(country) {
    if (!country) return { type: 'World', depth: 100, label: 'Standard' };
    const name = canonicalCountry(country.name);
    if (name === 'United States' || name === 'United States of America') return { type: 'United States', depth: 180, label: 'US deep field' };
    if (country.region === 'Europe') return { type: 'Europe', depth: 180, label: 'European deep field' };
    if (isLatinCountry(name, country.subregion)) return { type: 'Latin America', depth: 170, label: 'Latin American deep field' };
    return { type: country.region || 'World', depth: 100, label: 'Standard' };
  }
  function scorePoemForCountry(poem, country) {
    if (!country) return 50 + (poem.year || 0) / 100000;
    const selected = canonicalCountry(country.name);
    const poemCountry = canonicalCountry(poem.country || '');
    let score = 0;
    if (poemCountry === selected) score += 1200;
    if (clean(poem.place).includes(clean(selected)) || clean(poem.note).includes(clean(selected))) score += 350;
    if (country.region && poem.continent && clean(country.region) === clean(poem.continent)) score += 240;
    const info = selectedRegionInfo(country);
    if (info.type === 'Europe' && poem.continent === 'Europe') score += 420;
    if (info.type === 'Latin America' && (poem.continent === 'Americas' || isLatinCountry(poem.country || ''))) score += 420;
    if (info.type === 'United States' && (poemCountry === 'United States of America' || poemCountry === 'United States' || poem.place === 'Hawaiʻi')) score += 520;
    if (poem.kind === 'classic') score += 55;
    score += (poem.year || 0) / 100000;
    return score;
  }
  function codeForCountryName(name) {
    const canon = canonicalCountry(name || '');
    const match = countries.find(c => canonicalCountry(c.name) === canon || clean(c.name) === clean(name));
    if (match && match.code) return match.code;
    return String(name || 'WW').split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() || 'WW';
  }

  function countryCollection(country = state.country) {
    if (!country) return [];
    const selected = canonicalCountry(country.name);
    let list = worldLiteratureItems().filter(p => canonicalCountry(countryOf(p)) === selected);
    if (state.era !== 'all') {
      const era = eras.find(e => e.id === state.era);
      if (era) list = list.filter(p => era.test(eraYear(p)));
    }
    if (state.poet !== 'all') list = list.filter(p => poetOf(p) === state.poet);
    return list.sort((a, b) => (eraYear(a) || 9999) - (eraYear(b) || 9999) || a.title.localeCompare(b.title));
  }

  function renderCountryPanel() {
    const allForCountry = countryCollection();
    const q = clean(state.countryQuery);
    state.countryVisible = q ? allForCountry.filter(p => itemHaystack(p).includes(q)) : allForCountry;
    const renderedCountryPoems = state.countryVisible.slice(0, state.countryLimit);
    const country = state.country;
    const info = selectedRegionInfo(country);
    const atlasSection = $('#worldAtlas');
    if (atlasSection) atlasSection.classList.toggle('has-country', Boolean(country));
    $('#countryTitle').textContent = country ? country.name : 'Select a nation';
    $('#countryDescription').textContent = country
      ? `${country.name} · ${state.countryVisible.length} shown from ${allForCountry.length} filed poem${allForCountry.length === 1 ? '' : 's'}.`
      : 'Click a nation on the globe or use the country selector.';
    $('#countryCount').textContent = String(state.countryVisible.length).padStart(3, '0');
    $('#countryDepth').textContent = country ? info.label : '—';
    if ($('#countryScope')) {
      $('#countryScope').textContent = country
        ? `Displaying ${renderedCountryPoems.length} of ${state.countryVisible.length} matching poem${state.countryVisible.length === 1 ? '' : 's'} (${allForCountry.length} filed)${state.poet !== 'all' ? ` by ${state.poet}` : ''}${state.countryQuery ? ` for “${state.countryQuery}”` : ''}.`
        : 'Select a country to begin.';
    }

    if (!country) {
      $('#countryResults').innerHTML = '';
      updateStats();
      return;
    }

    const code = codeForCountryName(country.name);
    $('#countryResults').innerHTML = state.countryVisible.length
      ? `<div class="country-initial-group"><h4>${escapeHTML(code)}</h4>${renderedCountryPoems.map((p, index) => `<button class="country-result" data-open="${escapeHTML(itemId(p))}">
          <span>${escapeHTML(code)}-${String(index + 1).padStart(3, '0')} · ${escapeHTML(dateOf(p))}</span>
          <strong>${escapeHTML(p.title)}</strong>
          <small>${escapeHTML(previewLines(p, 2))}</small>
          <em>${escapeHTML(poetOf(p))} · ${escapeHTML(languageOf(p))}</em>
        </button>`).join('')}${renderedCountryPoems.length < state.countryVisible.length ? `<button class="secondary-btn atlas-load-more" data-country-more type="button">Load ${Math.min(120, state.countryVisible.length - renderedCountryPoems.length)} more</button>` : ''}</div>`
      : `<div class="empty-country"><strong>${escapeHTML(code)}</strong><p>${allForCountry.length ? 'No poems match this search.' : `No poems are filed under ${escapeHTML(country.name)} yet.`}</p></div>`;
    updateStats();
  }
  function renderEraRail() {
    const root = $('#eraList');
    if (!root) return;
    root.innerHTML = eras.map(e => `<button class="era-button ${state.era === e.id ? 'active' : ''}" data-era="${e.id}"><strong>${escapeHTML(e.label)}</strong><span>${escapeHTML(e.range)}</span></button>`).join('');
  }
  function eraYear(item) {
    const meta = borrowedMeta[item && item.id] || {};
    if (Number.isFinite(meta.year)) return meta.year;
    if (Number.isFinite(item.year)) return item.year;
    return NaN;
  }
  function eraLabelForItem(item) {
    return `${poetOf(item)} · ${countryOf(item) || 'World Literature'}`;
  }
  function renderEraResults() {
    const era = eras.find(e => e.id === state.era) || eras[0];
    const allForEra = worldLiteratureItems()
      .filter(p => era.test(eraYear(p)))
      .sort((a, b) => (eraYear(a) || 9999) - (eraYear(b) || 9999) || a.title.localeCompare(b.title));
    const q = clean(state.eraQuery);
    const filteredForEra = q ? allForEra.filter(p => itemHaystack(p).includes(q)) : allForEra;
    const list = filteredForEra.slice(0, state.eraLimit);
    if ($('#eraTitle')) $('#eraTitle').textContent = era.label;
    if ($('#eraDescription')) $('#eraDescription').textContent = `${era.range}. ${allForEra.length} poem${allForEra.length === 1 ? '' : 's'} available in this timeline.`;
    if ($('#eraScope')) $('#eraScope').textContent = `Displaying ${list.length} of ${filteredForEra.length} matching poem${filteredForEra.length === 1 ? '' : 's'}${state.eraQuery ? ` for “${state.eraQuery}”` : ''}.`;
    if ($('#eraResults')) {
      $('#eraResults').innerHTML = (list.map(p => `<button class="era-poem-card" data-open="${escapeHTML(itemId(p))}"><span>${escapeHTML(dateOf(p))}</span><strong>${escapeHTML(p.title)}</strong><p>${escapeHTML(previewLines(p, 2))}</p><em>${escapeHTML(eraLabelForItem(p))}</em></button>`).join('') + (list.length < filteredForEra.length ? `<button class="secondary-btn atlas-load-more" data-era-more type="button">Load ${Math.min(220, filteredForEra.length - list.length)} more</button>` : '')) || '<p class="empty-mini">No poems match this era search.</p>';
    }
  }
  function renderPoetNav() {
    const root = $('#poetNav');
    if (!root) return;
    if (!state.country) {
      state.poet = 'all';
      root.innerHTML = '';
      return;
    }
    const selected = canonicalCountry(state.country.name);
    const countryPoems = worldLiteratureItems().filter(p => canonicalCountry(countryOf(p)) === selected);
    const poets = [...new Set(countryPoems.map(p => poetOf(p)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (!poets.length) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `<button class="${state.poet === 'all' ? 'active' : ''}" data-poet="all">All Poets</button>` + poets.map(poet => `<button class="${state.poet === poet ? 'active' : ''}" data-poet="${escapeHTML(poet)}">${escapeHTML(poet)}</button>`).join('');
  }
  function renderCountrySelect() {
    const select = $('#countrySelect');
    if (!select) return;
    select.innerHTML = `<option value="">World Field</option>` + countries.map(c => `<option value="${escapeHTML(c.code)}">${escapeHTML(c.name)}</option>`).join('');
  }
  function scrollToCountryResults() {
    const panel = $('.atlas-results-panel');
    if (!panel || !state.country) return;
    panel.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.focus({ preventScroll: true });
        const first = $('#countryResults [data-open]');
        if (first) first.classList.add('country-result-ready');
        setTimeout(() => first && first.classList.remove('country-result-ready'), 1300);
      });
    });
  }
  function selectCountry(country, shouldScroll = true) {
    state.country = country || null;
    if ($('#countrySelect')) $('#countrySelect').value = country ? country.code : '';
    state.poet = 'all';
    state.countryQuery = '';
    state.countryLimit = 120;
    if ($('#countryPoemSearch')) $('#countryPoemSearch').value = '';
    renderPoetNav();
    renderCountryPanel();
    if (country && shouldScroll) scrollToCountryResults();
  }

  function initGlobe() {
    const canvas = $('#globeCanvas');
    if (!canvas || !countries.length) return;
    const ctx = canvas.getContext('2d');
    let dpr = window.devicePixelRatio || 1;
    const exactCountries = new Set(worldLiteratureItems().map(p => canonicalCountry(countryOf(p))).filter(Boolean));
    let activePointers = [];
    let startPinchDist = 0;
    let startZoom = 1;

    function rgb(hex, fallback = [102, 165, 160]) {
      const value = String(hex || '').trim().replace('#', '');
      if (!/^[0-9a-f]{6}$/i.test(value)) return fallback;
      return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
    }
    function rgba(hex, alpha, fallback) {
      const [r, g, b] = rgb(hex, fallback);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    function mix(hex, base, amount = .7) {
      const source = rgb(hex);
      const target = rgb(base, [244, 239, 227]);
      const values = source.map((value, index) => Math.round(value * (1 - amount) + target[index] * amount));
      return `rgb(${values[0]},${values[1]},${values[2]})`;
    }
    function globePalette() {
      const light = document.body.getAttribute('data-theme') === 'light';
      const a = document.body.style.getPropertyValue('--theme-vivid-a') || '#c9a96e';
      const b = document.body.style.getPropertyValue('--theme-vivid-b') || '#66a5a0';
      const c = document.body.style.getPropertyValue('--theme-vivid-c') || '#8f5c6d';
      return { light, a, b, c };
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      const size = Math.max(320, Math.floor(rect.width * dpr));
      canvas.width = size; canvas.height = size;
    }
    function setGlobeZoom(next) {
      state.globe.zoom = Math.max(0.82, Math.min(2.35, next));
    }
    function project(lat, lon, r, cx, cy) {
      const phi = lat * Math.PI / 180;
      const theta = lon * Math.PI / 180 + state.globe.rotation;
      const x0 = Math.cos(phi) * Math.sin(theta);
      const y0 = Math.sin(phi);
      const z0 = Math.cos(phi) * Math.cos(theta);
      const tilt = state.globe.tilt;
      const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
      const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      return { x: cx + r * x0, y: cy - r * y, z };
    }
    function draw() {
      const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, r = Math.min(w, h) * .39 * state.globe.zoom;
      ctx.clearRect(0, 0, w, h);
      const palette = globePalette();
      const grd = ctx.createRadialGradient(cx - r * .34, cy - r * .34, r * .08, cx, cy, r);
      if (palette.light) {
        grd.addColorStop(0, '#fdfaf5'); // Core paper glow
        grd.addColorStop(.35, mix(palette.b, '#cbdbe6', .45)); // Soft watercolor azure
        grd.addColorStop(.75, mix(palette.b, '#92b3c2', .55)); // Deep ocean wash
        grd.addColorStop(1, mix(palette.c, '#5c7b8c', .6)); // Rich edge shading
      } else {
        grd.addColorStop(0, 'rgba(49,101,130,.42)');
        grd.addColorStop(.48, 'rgba(18,47,71,.86)');
        grd.addColorStop(1, 'rgba(6,15,25,.98)');
      }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
      ctx.strokeStyle = palette.light ? rgba(palette.b, .52) : 'rgba(94,143,166,.42)';
      ctx.lineWidth = Math.max(1, 1.4 * dpr); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = palette.light ? 'rgba(48,67,66,.12)' : 'rgba(255,255,255,.085)';
      ctx.lineWidth = dpr;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); let first = true;
        for (let lon = -180; lon <= 180; lon += 4) {
          const p = project(lat, lon, r, cx, cy);
          if (p.z > -0.2) { first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false; }
        }
        ctx.stroke();
      }
      for (let lon = -150; lon <= 180; lon += 30) {
        ctx.beginPath(); let first = true;
        for (let lat = -88; lat <= 88; lat += 3) {
          const p = project(lat, lon, r, cx, cy);
          if (p.z > -0.2) { first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false; }
        }
        ctx.stroke();
      }

      // Draw country boundaries from embedded GeoJSON so the globe reads as a political atlas, not just points.
      const selectedName = state.country ? canonicalCountry(state.country.name) : '';
      function drawRing(ring, fillMode) {
        ctx.beginPath();
        let open = false;
        for (let i = 0; i < ring.length; i += 1) {
          const coord = ring[i];
          const p = project(coord[1], coord[0], r, cx, cy);
          if (p.z <= -0.03) { open = false; continue; }
          if (!open) { ctx.moveTo(p.x, p.y); open = true; }
          else ctx.lineTo(p.x, p.y);
        }
        if (fillMode) ctx.fill();
        ctx.stroke();
      }
      for (const feature of worldGeo) {
        const geo = feature.geometry;
        if (!geo) continue;
        const name = canonicalCountry(feature.properties && feature.properties.name || '');
        const selectedFeature = selectedName && (name === selectedName || clean(name).includes(clean(selectedName)) || clean(selectedName).includes(clean(name)));
        ctx.strokeStyle = selectedFeature
          ? (palette.light ? palette.c : 'rgba(108,176,195,.95)')
          : (palette.light ? 'rgba(49,70,69,.46)' : 'rgba(202,224,232,.42)');
        ctx.lineWidth = selectedFeature ? 1.25 * dpr : .62 * dpr;
        ctx.fillStyle = selectedFeature
          ? (palette.light ? rgba(palette.b, .3) : 'rgba(82,151,173,.18)')
          : (palette.light ? 'rgba(255, 255, 255, 0.42)' : 'rgba(130,187,176,.025)');
        const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
        for (const poly of polys) {
          for (const ring of poly) drawRing(ring, selectedFeature);
        }
      }
      ctx.restore();
      state.globe.projected = [];
      const selected = state.country && state.country.code;
      for (const c of countries) {
        const p = project(c.lat, c.lon, r, cx, cy);
        if (p.z <= -0.05) continue;
        const exact = exactCountries.has(canonicalCountry(c.name));
        const isSelected = c.code === selected;
        const size = (isSelected ? 6.5 : exact ? 4.1 : 2.5) * dpr;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = palette.light
          ? (isSelected ? palette.c : exact ? palette.b : 'rgba(61,82,80,.55)')
          : (isSelected ? 'rgba(124,199,220,1)' : exact ? 'rgba(130,187,176,.98)' : 'rgba(202,224,232,.62)');
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = palette.light ? rgba(palette.c, .3) : 'rgba(124,199,220,.28)';
          ctx.lineWidth = 5 * dpr;
          ctx.stroke();
        }
        state.globe.projected.push({ ...c, x: p.x / dpr, y: p.y / dpr, size: size / dpr });
      }
      if (state.globe.hover) {
        const hpt = state.globe.hover;
        ctx.font = `${12 * dpr}px system-ui, sans-serif`;
        const tw = ctx.measureText(hpt.name).width;
        ctx.fillStyle = palette.light ? 'rgba(255,248,235,.94)' : 'rgba(0,0,0,.74)';
        ctx.fillRect(hpt.x * dpr - tw/2 - 8*dpr, hpt.y*dpr - 31*dpr, tw + 16*dpr, 23*dpr);
        ctx.fillStyle = palette.light ? 'rgba(39,47,44,.96)' : 'rgba(244,239,230,.96)';
        ctx.fillText(hpt.name, hpt.x*dpr - tw/2, hpt.y*dpr - 15*dpr);
      }
    }
    function insideGlobe(evt) {
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const radius = Math.min(rect.width, rect.height) * .39 * state.globe.zoom;
      return Math.hypot(x - rect.width / 2, y - rect.height / 2) <= radius;
    }
    function nearest(evt) {
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
      let best = null, dist = Infinity;
      for (const p of state.globe.projected) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < dist) { dist = d; best = p; }
      }
      return dist < Math.max(18, 30 / state.globe.zoom) ? best : null;
    }
    function animate() { if (!state.globe.dragging) state.globe.rotation += 0.0012; draw(); requestAnimationFrame(animate); }
    canvas.addEventListener('pointerdown', e => {
      activePointers.push(e);
      if (activePointers.length === 1) {
        if (!insideGlobe(e)) { activePointers = []; return; }
        state.globe.dragging = true;
        state.globe.lastX = e.clientX;
        state.globe.lastY = e.clientY;
        state.globe.downX = e.clientX;
        state.globe.downY = e.clientY;
        state.globe.downAt = performance.now();
        state.globe.moved = 0;
        canvas.setPointerCapture(e.pointerId);
      } else if (activePointers.length === 2) {
        state.globe.dragging = false;
        startPinchDist = Math.hypot(
          activePointers[0].clientX - activePointers[1].clientX,
          activePointers[0].clientY - activePointers[1].clientY
        );
        startZoom = state.globe.zoom;
      }
    });
    canvas.addEventListener('pointermove', e => {
      const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
      if (idx !== -1) activePointers[idx] = e;

      if (activePointers.length === 1 && state.globe.dragging) {
        const dx = e.clientX - state.globe.lastX;
        const dy = e.clientY - state.globe.lastY;
        state.globe.moved += Math.hypot(dx, dy);
        state.globe.rotation += dx * 0.006;
        state.globe.tilt += dy * 0.003;
        state.globe.tilt = Math.max(-0.8, Math.min(0.8, state.globe.tilt));
        state.globe.lastX = e.clientX; state.globe.lastY = e.clientY;
      } else if (activePointers.length === 2) {
        const dist = Math.hypot(
          activePointers[0].clientX - activePointers[1].clientX,
          activePointers[0].clientY - activePointers[1].clientY
        );
        if (startPinchDist > 0) {
          const factor = dist / startPinchDist;
          setGlobeZoom(startZoom * factor);
        }
      } else if (!state.globe.dragging) {
        state.globe.hover = insideGlobe(e) ? nearest(e) : null;
      }
    });
    canvas.addEventListener('pointerup', e => {
      const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
      if (idx !== -1) activePointers.splice(idx, 1);

      if (activePointers.length < 2) {
        startPinchDist = 0;
      }
      if (activePointers.length === 0) {
        if (!state.globe.dragging) return;
        const movedFromStart = Math.hypot(e.clientX - state.globe.downX, e.clientY - state.globe.downY);
        const elapsed = performance.now() - state.globe.downAt;
        state.globe.dragging = false;
        const deliberateTap = movedFromStart < 7 && state.globe.moved < 10 && elapsed < 650;
        if (deliberateTap) {
          const n = nearest(e);
          if (n) selectCountry(countries.find(c => c.code === n.code));
        }
      }
    });
    canvas.addEventListener('pointercancel', e => {
      const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
      if (idx !== -1) activePointers.splice(idx, 1);
      if (activePointers.length === 0) {
        state.globe.dragging = false;
        startPinchDist = 0;
      }
    });
    canvas.addEventListener('pointerleave', () => {
      activePointers = [];
      state.globe.dragging = false;
      state.globe.hover = null;
      startPinchDist = 0;
    });
    canvas.addEventListener('wheel', e => {
      if (!insideGlobe(e)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setGlobeZoom(state.globe.zoom + delta);
    }, { passive: false });
    canvas.addEventListener('dblclick', e => { if (insideGlobe(e)) setGlobeZoom(state.globe.zoom < 1.45 ? 1.65 : 1); });
    $('#globeZoomIn')?.addEventListener('click', () => setGlobeZoom(state.globe.zoom + 0.18));
    $('#globeZoomOut')?.addEventListener('click', () => setGlobeZoom(state.globe.zoom - 0.18));
    window.addEventListener('resize', resize);
    window.drawGlobeInstance = draw;
    resize(); animate();
  }

  async function loadAtlasItem(item) {
    if (!item || !isAtlas(item)) return item;
    const id = itemId(item);
    if (loadedAtlasItems.has(id)) return loadedAtlasItems.get(id);
    if (!item.data_file || item.content || item.fulltext || Array.isArray(item.text)) return item;

    let pending = atlasChunkCache.get(item.data_file);
    if (!pending) {
      // Revalidate generated chunks after a deployment. Reusing a stale chunk
      // with a newer atlas-data.js index makes the requested poem appear absent.
      pending = fetch(item.data_file, { cache: 'no-cache' }).then(async response => {
        if (!response.ok) throw new Error(`Atlas request failed (${response.status})`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Atlas chunk is not an array');
        rows.forEach(row => {
          const rowId = itemId(row);
          if (rowId) loadedAtlasItems.set(rowId, row);
          if (row.id) loadedAtlasItems.set(row.id, row);
        });
        return rows;
      }).catch(error => {
        atlasChunkCache.delete(item.data_file);
        throw error;
      });
      atlasChunkCache.set(item.data_file, pending);
    }

    await pending;
    const loaded = loadedAtlasItems.get(id);
    if (!loaded) throw new Error(`Poem ${id} was not found in its Atlas chunk`);
    return loaded;
  }

  function originalLanguageText(item) {
    if (!item) return '';
    return item.original_text || item.originalText || item.native_text || item.nativeText || item.original || contentOf(item);
  }

  function readerFilterButton(label, value, action, filterValue = value) {
    return `<button type="button" class="reader-filter-link" data-reader-filter="${escapeHTML(action)}" data-filter-value="${escapeHTML(filterValue)}" aria-label="Browse ${escapeHTML(label)}: ${escapeHTML(value)}">${escapeHTML(value)}</button>`;
  }

  function setPublicationFacet(selector, label, value, action, filterValue = value, sourceUrl = '') {
    const root = $(selector);
    if (!root) return;
    const shown = String(value || 'Unknown').trim();
    const canFilter = shown && !/^unknown/i.test(shown);
    const filter = canFilter ? readerFilterButton(label, shown, action, filterValue) : escapeHTML(shown || 'Unknown');
    let source = '';
    if (sourceUrl) {
      try {
        const url = new URL(String(sourceUrl), location.href);
        if (['http:', 'https:'].includes(url.protocol)) {
          source = `<a class="reader-source-link" href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`;
        }
      } catch (_) { /* no external source URL */ }
    }
    root.innerHTML = `${filter}${source}`;
  }

  async function openItem(id, options = {}) {
    let item = findItem(id);
    if (!item) return;
    if (isAtlas(item) && item.data_file && !item.content && !item.fulltext && !Array.isArray(item.text)) {
      showToast('Loading poem…');
      try {
        item = await loadAtlasItem(item);
      } catch (error) {
        console.error(error);
        showToast(location.protocol === 'file:'
          ? 'Run the site through a local web server to load poem data.'
          : 'This poem could not be loaded. Please try again.');
        return;
      }
    }
    if (item.pdfUrl && !options.forceModal) { window.open(item.pdfUrl, '_blank', 'noopener'); return; }
    state.currentId = itemId(item);
    state.currentItem = item;
    state.originalMode = false;
    $('#readerTitle').textContent = item.title;
    $('#readerMood').textContent = isAtlas(item) ? `${item.country} · ${languageOf(item)}` : item.mood;
    $('#readerMeta').innerHTML = [itemId(item), isAtlas(item) ? 'World Atlas' : (collectionLabels[item.collection] || item.collection), languageOf(item), readingTime(item)].map(piece => `<span>${escapeHTML(piece)}</span>`).join('');
    if ($('#readerTagCloud')) {
      $('#readerTagCloud').innerHTML = tagsForItem(item).map(tag => `<button type="button" class="reader-tag" data-reader-filter="${escapeHTML(tag.action)}" data-filter-value="${escapeHTML(tag.filterValue)}"><em>${escapeHTML(tag.label)}</em><span>${escapeHTML(tag.value)}</span></button>`).join('');
    }
    const publicationEra = eraForItem(item);
    setPublicationFacet('#pubDate', 'publication era', dateOf(item), publicationEra ? 'era' : 'search', publicationEra ? publicationEra.id : dateOf(item));
    setPublicationFacet('#pubAuthor', 'poet', authorOf(item), 'poet');
    setPublicationFacet('#pubCollection', 'collection', originalCollectionOf(item), 'search');
    setPublicationFacet('#pubPublisher', 'publisher or source', publisherOf(item), 'search', publisherOf(item), item.source_url || item.pdfUrl || '');
    $('#readerContent').textContent = contentOf(item);
    $('#readerOriginalLanguage').textContent = languageOf(item) !== 'English' ? `Translate to ${languageOf(item)}` : 'Original language view';
    const note = contentNote(item);
    $('#contentNote').hidden = !note;
    $('#contentNote').textContent = note;
    $('#readerCopyright').textContent = isAtlas(item)
      ? 'World Atlas entry. Verify source, translation, and copyright before reuse.'
      : item.collection === 'Written by Hand'
        ? 'Original work. Please do not reproduce without permission. Use Copy Link to share the entry instead.'
        : 'Borrowed Ledger / Research entry. Verify author, translation, source, and copyright status before reuse.';
    updateReaderFavorite();
    
    // Load Private Marginalia
    if ($('#marginaliaText')) {
      $('#marginaliaText').value = localStorage.getItem('marginalia_' + state.currentId) || '';
    }
    // Update Custom Path Button
    updateReaderPathButton();

    renderRelated(item);
    applyReaderPrefs();
    setRecent([state.currentId, ...getRecent().filter(x => x !== state.currentId)]);
    const reader = $('#reader');
    const panel = $('.reader-panel');
    reader.classList.add('open');
    reader.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    panel.focus();
    $('#readerScroll').scrollTop = 0;
    if (location.hash !== `#${state.currentId}`) history.pushState({ poem: state.currentId }, '', `#${state.currentId}`);
  }

  function closeReader({ clearHash = true } = {}) {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const voiceBtn = $('#readerPlayVoice');
    if (voiceBtn) voiceBtn.textContent = '▶';
    const voiceBtnMobile = $('#readerPlayVoiceMobile');
    if (voiceBtnMobile) voiceBtnMobile.textContent = '▶ Recite Poem';
    $('#readerPlayVoice')?.classList.remove('active');
    $('#readerPlayVoiceMobile')?.classList.remove('active');

    $('#reader').classList.remove('open');
    $('#reader').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.currentId = null; state.currentItem = null; state.originalMode = false;
    if (clearHash && location.hash && allReadable.some(i => `#${itemId(i)}` === location.hash)) history.pushState('', document.title, location.pathname + location.search);
  }
  function currentPool() { return state.currentItem && isAtlas(state.currentItem) ? (state.countryVisible.length ? state.countryVisible : atlas) : (state.visible.length ? state.visible : database); }
  function openAdjacent(direction) {
    const pool = currentPool();
    const index = pool.findIndex(i => itemId(i) === state.currentId);
    if (index === -1) return;
    openItem(itemId(pool[(index + direction + pool.length) % pool.length]));
  }
  function renderRelated(item) {
    let related;
    if (isAtlas(item)) related = atlas.filter(i => itemId(i) !== itemId(item) && (i.country === item.country || i.language === item.language || i.continent === item.continent)).slice(0, 4);
    else related = database.filter(i => i.id !== item.id && (i.collection === item.collection || i.mood.split('/')[0].trim() === item.mood.split('/')[0].trim())).slice(0, 4);
    $('#relatedList').innerHTML = related.length
      ? related.map(i => `<button data-open="${escapeHTML(itemId(i))}"><strong>${escapeHTML(i.title)}</strong><br><span>${escapeHTML(isAtlas(i) ? `${i.poet || i.author} · ${i.country}` : `${i.mood} · ${collectionLabels[i.collection] || i.collection}`)}</span></button>`).join('')
      : '<p>No related readings yet.</p>';
  }
  function toggleFavorite(id) {
    const favorites = getFavorites();
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(next); renderArchive(); renderCountryPanel(); updateReaderFavorite();
    showToast(next.includes(id) ? 'Saved to favorites on this device.' : 'Removed from favorites.');
  }
  function updateReaderFavorite() {
    const btn = $('#readerFavorite');
    if (!state.currentId || !btn) return;
    btn.textContent = getFavorites().includes(state.currentId) ? 'Remove Favorite' : 'Save Favorite';
  }
  function showFavorites() {
    const favs = getFavorites();
    state.collection = 'Written by Hand'; state.mood = 'all'; state.query = '';
    $('#archiveSearch').value = '';
    renderMoodSelect(); renderArchive(allReadable.filter(i => favs.includes(itemId(i)))); renderHeroSearchResults();
    $('#archiveTitle').textContent = 'Favorites';
    $('#resultSummary').textContent = `Showing ${state.visible.length} favorite${state.visible.length === 1 ? '' : 's'} saved on this device.`;
    closeMenu(); $('#archive').scrollIntoView({ behavior: 'smooth' });
  }
  function showRecent() {
    const first = getRecent().map(id => findItem(id)).find(Boolean);
    closeMenu(); first ? openItem(itemId(first)) : showToast('No recent readings yet.');
  }
  function randomItem() { const pool = state.countryVisible.length ? state.countryVisible : (state.visible.length ? state.visible : allReadable); return pool[Math.floor(Math.random() * pool.length)]; }
  function applyReaderPrefs() {
    document.documentElement.style.setProperty('--reader-size', `${state.readerSize}rem`);
    document.documentElement.style.setProperty('--reader-size-mobile', `${Math.max(1, state.readerSize - .13)}rem`);
  }
  function closeMenu() {
    $('.site-header').classList.remove('menu-open');
    $('#menuButton').setAttribute('aria-expanded', 'false');
    $('#siteMenu').setAttribute('aria-hidden', 'true');
  }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message; toast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function currentPalette() {
    const id = localStorage.getItem('corpus_palette') || 'corpus';
    return themePalettes.find(p => p.id === id) || themePalettes[0];
  }
  function applyPalette(id = null) {
    if (id) localStorage.setItem('corpus_palette', id);
    const palette = currentPalette();
    const mode = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    // The dark triad is the canonical identity of every theme. Light mode does
    // not substitute a muted/pastel palette; it changes only the page canvas.
    const [a, b, c] = palette.dark;
    const [vividA, vividB, vividC] = mode === 'light' ? palette.light : palette.dark;
    const onAccent = contrastForColors(vividB, vividC);

    // Both modes receive the same saturated theme identity. Only selectors
    // scoped to body[data-theme="light"] alter the surrounding canvas.
    const targets = [document.documentElement, document.body];
    targets.forEach(target => {
      target.style.setProperty('--gold', a);
      target.style.setProperty('--gold-2', c);
      target.style.setProperty('--teal', b);
      target.style.setProperty('--accent-third', c);
      target.style.setProperty('--theme-vivid-a', vividA);
      target.style.setProperty('--theme-vivid-b', vividB);
      target.style.setProperty('--theme-vivid-c', vividC);
      target.style.setProperty('--theme-on-accent', onAccent);
      target.style.setProperty('--line-strong', `${a}55`);
      target.style.setProperty('--border-strong', `${a}55`);
      target.style.setProperty('--border-glow', `${a}33`);
      target.style.setProperty('--highlight-border', `${b}66`);
    });

    if (mode === 'light') {
      document.body.style.setProperty('--light-accent', vividC);
      document.body.style.setProperty('--light-accent-strong', vividC);
      document.body.style.setProperty('--light-accent-soft', `${vividC}2b`);
      document.body.style.setProperty('--light-teal-accent', vividB);
      document.body.style.setProperty('--light-teal-soft', `${vividB}2b`);
      document.body.style.setProperty('--light-warm-muted', vividA);
    }

    $$('.theme-choice').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeId === palette.id);
      btn.setAttribute('aria-selected', String(btn.dataset.themeId === palette.id));
    });
  }
  function renderThemeStudio() {
    const grid = $('#themeGrid');
    if (!grid) return;
    const mode = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    grid.innerHTML = themePalettes.map(p => {
      const colors = mode === 'light' ? p.dark : p[mode];
      return `<button class="theme-choice" type="button" data-theme-id="${escapeHTML(p.id)}" role="option" aria-selected="${currentPalette().id === p.id}"><strong>${escapeHTML(p.name)}</strong><span class="theme-swatches">${colors.map(color => `<i style="background:${color}"></i>`).join('')}</span></button>`;
    }).join('');
    applyPalette();
  }
  function closeThemeStudio() {
    $('.site-header')?.classList.remove('theme-open');
    $('#logoThemeButton')?.setAttribute('aria-expanded', 'false');
    $('#themeStudio')?.setAttribute('aria-hidden', 'true');
  }

  function initTheme() {
    const saved = localStorage.getItem('corpus_theme_base_atlas') || 'dark';
    document.body.setAttribute('data-theme', saved);
    $('.theme-icon').textContent = saved === 'light' ? '☀' : '☾';
    renderThemeStudio();
    applyPalette();
  }
  function toggleOriginalLanguage() {
    if (!state.currentItem) return;
    state.originalMode = !state.originalMode;
    $('#readerContent').textContent = state.originalMode ? originalLanguageText(state.currentItem) : contentOf(state.currentItem);
    $('#readerOriginalLanguage').textContent = state.originalMode ? 'Return to archive text' : (languageOf(state.currentItem) !== 'English' ? `Translate to ${languageOf(state.currentItem)}` : 'Original language view');
  }

  function navigateReaderFilter(action, value) {
    const target = String(value || '').trim();
    if (!target) return;
    closeReader();

    if (action === 'country') {
      const canonicalTarget = canonicalCountry(target);
      const country = countries.find(item => canonicalCountry(item.name) === canonicalTarget || clean(item.name) === clean(target));
      if (country) {
        selectCountry(country, false);
        location.hash = '#worldAtlas'; // Redirects first!
        requestAnimationFrame(() => $('#worldAtlas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        setTimeout(scrollToCountryResults, 420);
        return;
      }
    }

    if (action === 'poet') {
      state.poetIndexSelected = target;
      if ($('#poetIndexSearch')) $('#poetIndexSearch').value = target;
      renderPoetIndex();
      location.hash = '#poets'; // Redirects first!
      requestAnimationFrame(() => $('#poets')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }

    if (action === 'era' && eras.some(era => era.id === target && era.id !== 'all')) {
      state.era = target;
      state.eraQuery = '';
      state.eraLimit = 220;
      if ($('#eraPoemSearch')) $('#eraPoemSearch').value = '';
      renderEraRail();
      renderEraResults();
      renderCountryPanel();
      location.hash = '#eras'; // Redirects first!
      requestAnimationFrame(() => $('#eras')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }

    // Mood, language, theme, collection, publisher, and unmatched facets use
    // the global archive search, which now indexes those metadata fields.
    state.query = target;
    state.mood = 'all';
    if ($('#archiveSearch')) $('#archiveSearch').value = target;
    renderMoodSelect();
    renderArchive();
    renderHeroSearchResults();
    location.hash = '#worldAtlas'; // Redirects first to show search bar!
    requestAnimationFrame(() => $('.hero-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function setTopNavActive(target) {
    $$('.desktop-nav .nav-pill').forEach(el => el.classList.remove('active', 'active-anchor'));
    if (target === 'atlas') $('.desktop-nav a[href="#worldAtlas"]')?.classList.add('active-anchor');
    else if (target === 'eras') $('.desktop-nav a[href="#eras"]')?.classList.add('active-anchor');
    else if (target === 'collection') {
      const btn = $(`.desktop-nav [data-collection="${state.collection}"]`);
      if (btn) btn.classList.add('active');
    }
  }

  function bindEvents() {
    $$('.nav-pill[data-collection], .tab, .menu-item[data-collection]').forEach(btn => btn.addEventListener('click', () => setCollection(btn.dataset.collection)));
    $('.desktop-nav a[href="#worldAtlas"]')?.addEventListener('click', () => setTopNavActive('atlas'));
    $('.desktop-nav a[href="#eras"]')?.addEventListener('click', () => setTopNavActive('eras'));
    $('#moodSelect').addEventListener('change', e => { state.mood = e.target.value; renderArchive(); });
    $('#sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderArchive(); });
    $('#clearFilters').addEventListener('click', clearFilters);
    $('#clearSearch').addEventListener('click', () => { state.query = ''; $('#archiveSearch').value = ''; renderArchive(); renderHeroSearchResults(); });
    $('#archiveSearch').addEventListener('input', e => { state.query = e.target.value.trim(); renderArchive(); renderHeroSearchResults(); });
    $('#archiveSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#heroSearchResults [data-open]'); if (first) openItem(first.dataset.open); else $('#archive')?.scrollIntoView({ behavior: 'smooth' }); } });
    $('#themeToggle').addEventListener('click', () => {
      const next = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem('corpus_theme_base_atlas', next);
      $('.theme-icon').textContent = next === 'light' ? '☀' : '☾';
      renderThemeStudio();
      applyPalette();
    });
    $('#logoThemeButton')?.addEventListener('click', e => {
      e.stopPropagation();
      const open = !$('.site-header').classList.contains('theme-open');
      $('.site-header').classList.toggle('theme-open', open);
      $('#logoThemeButton').setAttribute('aria-expanded', String(open));
      $('#themeStudio').setAttribute('aria-hidden', String(!open));
      closeMenu();
    });
    $('#closeThemeStudio')?.addEventListener('click', closeThemeStudio);
    $('#themeGrid')?.addEventListener('click', e => {
      const choice = e.target.closest('[data-theme-id]');
      if (!choice) return;
      applyPalette(choice.dataset.themeId);
      renderThemeStudio();
    });
    $('#menuButton').addEventListener('click', e => {
      e.stopPropagation();
      closeThemeStudio();
      const open = !$('.site-header').classList.contains('menu-open');
      $('.site-header').classList.toggle('menu-open', open);
      $('#menuButton').setAttribute('aria-expanded', String(open));
      $('#siteMenu').setAttribute('aria-hidden', String(!open));
    });
    document.addEventListener('click', e => { if (!$('.site-header').contains(e.target)) { closeMenu(); closeThemeStudio(); } });
    $('#poetIndexSearch')?.addEventListener('input', () => { state.poetIndexSelected = null; renderPoetIndex(); });
    $('#countrySelect').addEventListener('change', e => selectCountry(countries.find(c => c.code === e.target.value) || null));
    $('#countryPoemSearch')?.addEventListener('input', e => { state.countryQuery = e.target.value.trim(); state.countryLimit = 120; renderCountryPanel(); });
    $('#clearCountrySearch')?.addEventListener('click', () => { state.countryQuery = ''; state.countryLimit = 120; if ($('#countryPoemSearch')) $('#countryPoemSearch').value = ''; renderCountryPanel(); });
    $('#eraPoemSearch')?.addEventListener('input', e => { state.eraQuery = e.target.value.trim(); state.eraLimit = 220; renderEraResults(); });
    $('#clearEraSearch')?.addEventListener('click', () => { state.eraQuery = ''; state.eraLimit = 220; if ($('#eraPoemSearch')) $('#eraPoemSearch').value = ''; renderEraResults(); });
    $('#resetAtlas').addEventListener('click', () => { state.country = null; state.era = 'all'; state.poet = 'all'; state.countryQuery = ''; state.countryLimit = 120; state.eraLimit = 220; state.globe.zoom = 1; state.globe.rotation = -0.65; state.globe.tilt = 0.18; if ($('#countryPoemSearch')) $('#countryPoemSearch').value = ''; renderEraRail(); renderEraResults(); renderPoetNav(); renderCountrySelect(); renderCountryPanel(); });
    document.addEventListener('click', e => {
      const readerFilter = e.target.closest('[data-reader-filter]');
      if (readerFilter) {
        e.preventDefault();
        e.stopPropagation();
        navigateReaderFilter(readerFilter.dataset.readerFilter, readerFilter.dataset.filterValue);
        return;
      }
      const countryMore = e.target.closest('[data-country-more]');
      if (countryMore) { state.countryLimit += 120; renderCountryPanel(); return; }
      const eraMore = e.target.closest('[data-era-more]');
      if (eraMore) { state.eraLimit += 220; renderEraResults(); return; }
      const era = e.target.closest('[data-era]');
      if (era) { state.era = era.dataset.era; state.eraLimit = 220; state.countryLimit = 120; renderEraRail(); renderEraResults(); renderCountryPanel(); }
      const poet = e.target.closest('[data-poet]');
      if (poet) { state.poet = poet.dataset.poet; state.countryLimit = 120; renderPoetNav(); renderCountryPanel(); }
      const poetSelect = e.target.closest('[data-poet-select]');
      if (poetSelect) { state.poetIndexSelected = poetSelect.dataset.poetSelect; renderPoetIndex(); return; }
      const poetBack = e.target.closest('[data-poet-back]');
      if (poetBack) { state.poetIndexSelected = null; renderPoetIndex(); return; }
      const favorite = e.target.closest('[data-favorite]');
      if (favorite) { e.preventDefault(); e.stopPropagation(); toggleFavorite(favorite.dataset.favorite); return; }
      const opener = e.target.closest('[data-open]');
      if (opener) openItem(opener.dataset.open);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const opener = e.target.closest('[data-open]'); if (opener) openItem(opener.dataset.open); }
      if (e.key === 'Escape') { if ($('#reader').classList.contains('open')) closeReader(); else { closeMenu(); closeThemeStudio(); } }
      if ($('#reader').classList.contains('open') && e.key === 'ArrowRight') openAdjacent(1);
      if ($('#reader').classList.contains('open') && e.key === 'ArrowLeft') openAdjacent(-1);
    });
    $('#readFeatured').addEventListener('click', () => openItem(state.featuredId));
    $('#randomFeatured').addEventListener('click', () => { const item = randomItem(); if (item) openItem(itemId(item)); });
    $('#menuSurprise').addEventListener('click', () => { const item = randomItem(); closeMenu(); if (item) openItem(itemId(item)); });
    $('#menuFavorites').addEventListener('click', showFavorites);
    $('#menuRecent').addEventListener('click', showRecent);
    $$('[data-begin]').forEach(btn => btn.addEventListener('click', () => openItem(btn.dataset.begin)));
    $$('[data-footer-collection]').forEach(link => link.addEventListener('click', () => setCollection(link.dataset.footerCollection)));
    $$('[data-close-reader]').forEach(el => el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeReader();
    }));
    $('#readerPrev')?.addEventListener('click', () => openAdjacent(-1));
    $('#readerNext').addEventListener('click', () => openAdjacent(1));
    $('#readerDecrease').addEventListener('click', () => { state.readerSize = Math.max(.9, Number((state.readerSize - .1).toFixed(2))); localStorage.setItem('corpus_reader_size', String(state.readerSize)); applyReaderPrefs(); });
    $('#readerIncrease').addEventListener('click', () => { state.readerSize = Math.min(2.1, Number((state.readerSize + .1).toFixed(2))); localStorage.setItem('corpus_reader_size', String(state.readerSize)); applyReaderPrefs(); });
    $('#readerFavorite').addEventListener('click', () => { if (state.currentId) toggleFavorite(state.currentId); });
    $('#readerOriginalLanguage').addEventListener('click', toggleOriginalLanguage);
    $('#readerPlayVoice')?.addEventListener('click', togglePoemVoice);
    $('#readerPlayVoiceMobile')?.addEventListener('click', togglePoemVoice);
    $('#readerTogglePath')?.addEventListener('click', () => { if (state.currentId) toggleCustomPath(state.currentId); });
    $('#saveMarginalia')?.addEventListener('click', () => {
      if (state.currentId) {
        const text = $('#marginaliaText')?.value || '';
        if (text.trim()) {
          localStorage.setItem('marginalia_' + state.currentId, text.trim());
          showToast('Marginalia saved.');
        } else {
          localStorage.removeItem('marginalia_' + state.currentId);
          showToast('Marginalia cleared.');
        }
      }
    });
    $('#readerCopyLink').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#${state.currentId}`;
      try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast(url); }
    });
    window.addEventListener('popstate', () => {
      const id = location.hash.replace('#', '');
      if (id && allReadable.some(i => itemId(i) === id)) openItem(id, { forceModal: true }); else closeReader({ clearHash: false });
    });
    // Automatically slide mobile menu closed when clicking any navigation link
    $$('.site-menu a[href^="#"], .desktop-nav a[href^="#"], .mobile-tabs a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', () => {
        closeMenu();
        closeThemeStudio();
      });
    });
  }


  function initContentProtection() {
    document.body.classList.add('protect-copy');

    const protectedMessage = 'Copying is disabled on The Corpus.';
    const shouldIgnoreTarget = target => target && target.closest && target.closest('input, textarea, select');

    document.addEventListener('contextmenu', event => {
      event.preventDefault();
      showToast(protectedMessage);
    }, { capture: true });

    document.addEventListener('copy', event => {
      event.preventDefault();
      if (event.clipboardData) event.clipboardData.setData('text/plain', '');
      showToast(protectedMessage);
    }, { capture: true });

    document.addEventListener('cut', event => {
      event.preventDefault();
      if (event.clipboardData) event.clipboardData.setData('text/plain', '');
      showToast(protectedMessage);
    }, { capture: true });

    document.addEventListener('selectstart', event => {
      if (!shouldIgnoreTarget(event.target)) event.preventDefault();
    }, { capture: true });

    document.addEventListener('dragstart', event => {
      event.preventDefault();
    }, { capture: true });

    document.addEventListener('keydown', event => {
      const key = String(event.key || '').toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && ['c', 'x', 'a', 's', 'p', 'u'].includes(key)) {
        if (shouldIgnoreTarget(event.target) && ['a', 'c', 'x'].includes(key)) return;
        event.preventDefault();
        showToast('This action is disabled on The Corpus.');
      }
      if (key === 'f12' || (mod && event.shiftKey && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault();
        showToast('Protected reading mode is active.');
      }
    }, { capture: true });
  }

  function initViewportPrivacy() {
    const overlay = $('#privacyOverlay');
    const minWidth = 980;
    const minHeight = 620;

    function isLikelyMobileOrSmallDevice() {
      return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    }

    function evaluateViewport() {
      const desktopContext = !isLikelyMobileOrSmallDevice();
      const tooSmall = window.innerWidth < minWidth || window.innerHeight < minHeight;
      const locked = desktopContext && tooSmall;
      document.body.classList.toggle('viewport-locked', locked);
      if (overlay) overlay.setAttribute('aria-hidden', String(!locked));
    }

    window.addEventListener('resize', evaluateViewport, { passive: true });
    window.addEventListener('orientationchange', evaluateViewport, { passive: true });
    evaluateViewport();
  }


  function updatePenScroll() {
    const line = $('#penInkLine');
    if (!line) return;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.max(0, Math.min(100, (window.scrollY / max) * 100));
    line.style.height = `${pct}%`;
  }
  function getCustomPath() {
    try {
      return JSON.parse(localStorage.getItem('corpus_custom_path') || '[]');
    } catch (_) { return []; }
  }
  function toggleCustomPath(id) {
    let path = getCustomPath();
    const idx = path.indexOf(id);
    if (idx !== -1) {
      path.splice(idx, 1);
      localStorage.setItem('corpus_custom_path', JSON.stringify(path));
      showToast('Removed from My Custom Path');
    } else {
      path.push(id);
      localStorage.setItem('corpus_custom_path', JSON.stringify(path));
      showToast('Added to My Custom Path');
    }
    renderReadingPaths();
    updateReaderPathButton();
  }
  function updateReaderPathButton() {
    const btn = $('#readerTogglePath');
    if (!state.currentId || !btn) return;
    btn.textContent = getCustomPath().includes(state.currentId) ? 'Remove from My Path' : 'Add to My Path';
  }

  let synthUtterance = null;
  function togglePoemVoice() {
    if (!window.speechSynthesis) {
      showToast('Speech synthesis is not supported on this browser.');
      return;
    }
    const btn = $('#readerPlayVoice');
    const mBtn = $('#readerPlayVoiceMobile');

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (btn) btn.textContent = '▶';
      if (mBtn) mBtn.textContent = '▶ Recite Poem';
      btn?.classList.remove('active');
      mBtn?.classList.remove('active');
      showToast('Recitation stopped.');
    } else {
      const title = $('#readerTitle')?.textContent || '';
      const poet = $('#pubAuthor')?.textContent || 'Unknown author';
      const text = $('#readerContent')?.textContent || '';
      if (!text.trim()) return;

      const cleanedText = text.replace(/[\n\r]+/g, '\n');
      const utteranceText = `Reading ${title} by ${poet}. \n\n ${cleanedText}`;
      
      synthUtterance = new SpeechSynthesisUtterance(utteranceText);
      const voices = window.speechSynthesis.getVoices();
      
      const preferred = voices.find(v => v.lang.startsWith('en') && 
        (v.name.includes('Natural') || v.name.includes('Premium') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Karen') || v.name.includes('Siri'))
      );
      if (preferred) {
        synthUtterance.voice = preferred;
      }
      
      synthUtterance.rate = 0.81; 
      synthUtterance.pitch = 0.98; 
      
      const resetButtons = () => {
        if (btn) btn.textContent = '▶';
        if (mBtn) mBtn.textContent = '▶ Recite Poem';
        btn?.classList.remove('active');
        mBtn?.classList.remove('active');
      };

      synthUtterance.onend = resetButtons;
      synthUtterance.onerror = resetButtons;

      window.speechSynthesis.speak(synthUtterance);
      if (btn) btn.textContent = '⏹';
      if (mBtn) mBtn.textContent = '⏹ Stop Recitation';
      btn?.classList.add('active');
      mBtn?.classList.add('active');
      showToast('Reciting poem...');
    }
  }

  function applyRouting() {
    let hash = location.hash.replace('#', '') || 'worldAtlas';
    const targetHash = location.hash;

    if (hash === 'top' || hash === 'home') {
      hash = 'worldAtlas';
    }

    const routes = {
      'worldAtlas': ['.hero-shell', '.atlas-section'],
      'eras': ['.eras-section'],
      'poets': ['.poet-index-section'],
      'research': ['.research-section'],
      'archive': [
        '.manuscript-status', '.feature-section', '.paths-section', 
        '.controls-section', '.mood-section', '.about-section'
      ],
      'about': ['.about-section']
    };

    const activeRoute = routes[hash] ? hash : 'worldAtlas';

    const allViews = [
      '.hero-shell', '.manuscript-status', '.feature-section', '.paths-section',
      '.atlas-section', '.eras-section', '.poet-index-section', '.about-section',
      '.research-section', '.controls-section', '.mood-section'
    ];
    allViews.forEach(sel => {
      $$(sel).forEach(el => el.classList.remove('active-page'));
    });

    routes[activeRoute].forEach(sel => {
      $$(sel).forEach(el => el.classList.add('active-page'));
    });

    document.body.classList.add('routing-active');
    
    if (activeRoute === 'archive') {
      renderFeatured();
    }

    if (targetHash && (targetHash === '#worldAtlas' || targetHash === '#archive' || targetHash === '#about')) {
      const el = $(targetHash);
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } else {
      window.scrollTo({ top: 0 });
    }

    $$('.desktop-nav .nav-pill, .site-menu .menu-item').forEach(pill => {
      pill.classList.remove('active');
    });

    let activePillSelector = `.desktop-nav a[href="#${activeRoute}"]`;
    if (activeRoute === 'archive') {
      activePillSelector = `.desktop-nav button[data-collection]`;
    }
    const activePill = $(activePillSelector);
    if (activePill) activePill.classList.add('active');

    // Trigger globe drawing if entering the World Atlas page
    if ((activeRoute === 'worldAtlas') && window.drawGlobeInstance) {
      requestAnimationFrame(window.drawGlobeInstance);
    }
  }

  function initPenScroll() {
    window.addEventListener('scroll', updatePenScroll, { passive: true });
    window.addEventListener('resize', updatePenScroll, { passive: true });
    updatePenScroll();
  }

  function init() {
    initTheme();
    initContentProtection();
    initViewportPrivacy();
    initPenScroll();

    // Parse shared path from query
    const params = new URLSearchParams(location.search);
    const sharedPath = params.get('path');
    if (sharedPath) {
      const ids = sharedPath.split(',').filter(Boolean);
      if (ids.length > 0) {
        localStorage.setItem('corpus_custom_path', JSON.stringify(ids));
        // Clear query from URL for clean look
        history.replaceState('', document.title, location.pathname);
      }
    }

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
      });
    }

    renderMoodSelect(); renderArchive(); renderFeatured(); renderMoodMap(); renderReadingPaths(); renderPoetIndex();
    renderEraRail(); renderEraResults(); renderPoetNav(); renderCountrySelect(); renderCountryPanel();
    
    // Lazy-initialize Globe on mobile to make startup lightning-fast
    const isLikelyMobileOrSmall = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const currentHash = location.hash.replace('#', '') || 'worldAtlas';
    if (isLikelyMobileOrSmall && currentHash !== 'worldAtlas') {
      setTimeout(initGlobe, 1200); // Deferred load
    } else {
      initGlobe();
    }

    updateFavoriteCount(); applyReaderPrefs(); bindEvents(); 
    
    // Apply multi-page routing initially
    applyRouting();
    window.addEventListener('hashchange', applyRouting);

    const hashId = location.hash.replace('#', '');
    if (hashId && allReadable.some(i => itemId(i) === hashId)) setTimeout(() => openItem(hashId, { forceModal: true }), 50);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
