//testing
alert('[main.js] running');

const API_BASE = 'http://localhost:5174';


// elements referencing
const el = {
  input: document.getElementById('keyword'),
  btn: document.getElementById('searchBtn'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
};

function setStatus(text) {
  el.status.textContent = text || '';
}

// renders results in frontend
function renderResults(payload) {
  const { results = [], keyword, count } = payload || {};
  setStatus(`Found ${count || 0} results for "${keyword}"`);

  if (!Array.isArray(results) || results.length === 0) {
    el.results.innerHTML = '<p class="muted">No items found.</p>';
    return;
  }

  // shows html to any item returned
  el.results.innerHTML = results.map((item) => {
    const title = escapeHtml(item.title || 'Untitled');
    const rating = item.rating != null ? `${item.rating} ★` : '—';
    const reviews = item.reviewsCount != null ? `${item.reviewsCount.toLocaleString()} reviews` : '—';
    const img = item.imageUrl ? `<img src="${encodeURI(item.imageUrl)}" alt="${title}" loading="lazy">` : '';
    const asin = item.asin ? `<span class="badge">ASIN: ${escapeHtml(item.asin)}</span>` : '';

    return `
      <article class="card">
        ${img}
        <div class="content">
          <div class="title">${title}</div>
          <div class="meta">
            <span>${rating}</span>
            <span>•</span>
            <span>${reviews}</span>
            ${asin}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// don't inject this characters
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// main fuc. Triggers API
async function doSearch() {
  const keyword = el.input.value.trim();
  if (!keyword) {
    setStatus('Please enter a keyword.');
    el.input.focus();
    return;
  }

  el.btn.disabled = true;
  setStatus('Searching…');
  el.results.innerHTML = '';

  try {
    //get request in backend
    const res = await fetch(`${API_BASE}/api/scrape?keyword=${encodeURIComponent(keyword)}`);
    //reading content
    const ct = res.headers.get('content-type') || '';
    console.log('[DEBUG] status:', res.status, 'ct:', ct);

    // if not OK, try extract error msg
    if (!res.ok) {
      let msg = `Request failed with status ${res.status}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { }
      throw new Error(msg);
    }

    // if not JSON, probably blocked by server
    if (!ct.includes('application/json')) {
      const text = await res.text();
      console.error('[DEBUG] non-JSON first bytes:', text.slice(0, 200));
      throw new Error('Backend sent non-JSON (probably HTMLL).');
    }

    // return results
    const data = await res.json();
    renderResults(data);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
    el.results.innerHTML = '<p class="muted">Try again later or use a different keyword.</p>';
  } finally {
    el.btn.disabled = false;
  }
}

el.btn.addEventListener('click', doSearch);

el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});