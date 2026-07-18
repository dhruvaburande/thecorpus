(() => {
  'use strict';

  const PAGE_SIZE = 9;
  const state = { query: '', country: 'all', discipline: 'all', page: 0 };
  const rows = Array.isArray(window.RESEARCH_LIBRARY) ? window.RESEARCH_LIBRARY : [];
  const $ = selector => document.querySelector(selector);
  const clean = value => String(value || '').toLowerCase().trim();
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (_) { /* older browser */ }

  function countryName(item) {
    if (item.country) return item.country;
    const code = String(item.country_code || '').toUpperCase();
    if (!code || code === 'ZZ') return 'Global / unspecified';
    try { return regionNames ? regionNames.of(code) : code; } catch (_) { return code; }
  }

  function safePDF(url) {
    try {
      const parsed = new URL(String(url || ''), location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function authorsOf(item) {
    const authors = Array.isArray(item.authors) ? item.authors.filter(Boolean) : [];
    return authors.length ? authors.join(', ') : 'Unknown authors';
  }

  function haystack(item) {
    return clean([
      item.title, authorsOf(item), countryName(item), item.discipline,
      item.field, item.topic, item.source, item.year, item.license
    ].join(' '));
  }

  function filteredRows() {
    return rows.filter(item => {
      if (!safePDF(item.pdf_url)) return false;
      if (state.country !== 'all' && countryName(item) !== state.country) return false;
      if (state.discipline !== 'all' && String(item.discipline || 'Other') !== state.discipline) return false;
      return !state.query || haystack(item).includes(clean(state.query));
    });
  }

  function optionHTML(value, label) {
    return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
  }

  function renderFilters() {
    const countrySelect = $('#researchCountry');
    const disciplineSelect = $('#researchDiscipline');
    if (!countrySelect || !disciplineSelect) return;

    const countries = [...new Set(rows.map(countryName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const disciplines = [...new Set(rows.map(item => String(item.discipline || 'Other')).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    countrySelect.innerHTML = optionHTML('all', 'All countries') + countries.map(value => optionHTML(value, value)).join('');
    disciplineSelect.innerHTML = optionHTML('all', 'All fields') + disciplines.map(value => optionHTML(value, value)).join('');
    countrySelect.value = countries.includes(state.country) ? state.country : 'all';
    disciplineSelect.value = disciplines.includes(state.discipline) ? state.discipline : 'all';
  }

  function cardHTML(item, index) {
    const pdf = safePDF(item.pdf_url);
    const country = countryName(item);
    const citations = Number(item.citations || 0);
    const citationText = citations ? `${citations.toLocaleString()} citations` : 'Open-access record';
    const license = String(item.license || 'Open access').replace(/-/g, ' ');
    return `<article class="research-card" style="--research-index:${index + 1}">
      <div class="research-card-top">
        <span>${escapeHTML(country)}</span>
        <span>${escapeHTML(item.year || 'Undated')}</span>
      </div>
      <p class="research-field">${escapeHTML(item.discipline || 'Research')}</p>
      <h3><a href="${escapeHTML(pdf)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHTML(item.title || 'Untitled Research')}</a></h3>
      <p class="research-authors">${escapeHTML(authorsOf(item))}</p>
      <p class="research-topic">${escapeHTML(item.topic || item.source || 'Open Scholarship')}</p>
      <div class="research-card-bottom">
        <span>${escapeHTML(citationText)}</span>
        <span>${escapeHTML(license)}</span>
        <a href="${escapeHTML(pdf)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Open PDF: ${escapeHTML(item.title || 'research')}">PDF ↗</a>
      </div>
    </article>`;
  }

  function animatePage(direction) {
    const grid = $('#researchGrid');
    if (!grid || typeof grid.animate !== 'function' || !direction) return;
    const from = direction === 'next' ? '12%' : '-12%';
    grid.animate(
      [
        { transform: `translateX(${from})`, opacity: 0.25 },
        { transform: 'translateX(0)', opacity: 1 }
      ],
      { duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)' }
    );
  }

  function render(direction = '') {
    const grid = $('#researchGrid');
    const count = $('#researchCount');
    const pageStatus = $('#researchPageStatus');
    const previous = $('#researchPrev');
    const next = $('#researchNext');
    if (!grid || !count || !pageStatus || !previous || !next) return;

    if (!rows.length) {
      count.textContent = 'The literature and philosophy index has not been generated yet.';
      pageStatus.textContent = '';
      grid.innerHTML = '<div class="research-empty"><h3>Research Index Pending</h3><p>Run the literature and philosophy scraper, then upload the generated research-data.js file.</p></div>';
      previous.disabled = true;
      next.disabled = true;
      return;
    }

    const filtered = filteredRows();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pageCount - 1));
    const start = state.page * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    if (!filtered.length) {
      count.textContent = 'No research links match the selected search and filters.';
      pageStatus.textContent = '';
      grid.innerHTML = '<div class="research-empty"><h3>No Research Found</h3><p>Try clearing the search or changing the country and field filters.</p></div>';
      previous.disabled = true;
      next.disabled = true;
      return;
    }

    count.textContent = `${filtered.length} literature and philosophy research link${filtered.length === 1 ? '' : 's'} found.`;
    pageStatus.textContent = `Showing ${start + 1}–${start + visible.length} of ${filtered.length} · Page ${state.page + 1} of ${pageCount}`;
    grid.innerHTML = visible.map((item, index) => cardHTML(item, start + index)).join('');
    previous.disabled = state.page === 0;
    next.disabled = state.page >= pageCount - 1;
    animatePage(direction);
  }

  function reset() {
    state.query = '';
    state.country = 'all';
    state.discipline = 'all';
    state.page = 0;
    if ($('#researchSearch')) $('#researchSearch').value = '';
    if ($('#researchCountry')) $('#researchCountry').value = 'all';
    if ($('#researchDiscipline')) $('#researchDiscipline').value = 'all';
    render();
  }

  function init() {
    if (!$('#research')) return;
    renderFilters();
    render();
    $('#researchSearch')?.addEventListener('input', event => {
      state.query = event.target.value;
      state.page = 0;
      render();
    });
    $('#researchCountry')?.addEventListener('change', event => {
      state.country = event.target.value;
      state.page = 0;
      render();
    });
    $('#researchDiscipline')?.addEventListener('change', event => {
      state.discipline = event.target.value;
      state.page = 0;
      render();
    });
    $('#clearResearch')?.addEventListener('click', reset);
    $('#researchPrev')?.addEventListener('click', () => {
      if (state.page <= 0) return;
      state.page -= 1;
      render('previous');
    });
    $('#researchNext')?.addEventListener('click', () => {
      const pageCount = Math.ceil(filteredRows().length / PAGE_SIZE);
      if (state.page >= pageCount - 1) return;
      state.page += 1;
      render('next');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
