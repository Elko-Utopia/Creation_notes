// Simple client-side site search for /search page
// Loads /search-index.json and provides keyword + tag filtering

(function () {
  let index = null;
  let selectedTag = null;
  let searchMode = 'keyword'; // 'keyword' or 'tag'

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[ch]);
  }

  async function loadIndex() {
    if (index) return index;
    try {
      // 使用 document.baseURI 或页面 <base href> 来决定请求基准，避免在 public 静态脚本中依赖构建时的 import.meta
      const baseForFetch = (typeof document !== 'undefined' && document.baseURI) ? document.baseURI : '/';
      console.debug('[site-search] loadIndex using base:', baseForFetch);
      const res = await fetch(new URL('search-index.json', baseForFetch));
      if (!res.ok) throw new Error('failed to fetch index');
      index = await res.json();
      return index;
    } catch (e) {
      console.error('Failed to load search index', e);
      index = [];
      return index;
    }
  }

  function renderTags(tags, container, filter) {
    // build counts for each tag
    container.innerHTML = '';
    const counts = tags.reduce((acc, t) => {
      if (!t) return acc;
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, Object.create(null));
    // create sorted list by count desc then name
    const uniq = Object.keys(counts).sort((a, b) => {
      const d = counts[b] - counts[a];
      if (d !== 0) return d;
      return a.localeCompare(b);
    }).slice(0, 60);

    // optionally filter tag list by substring
    const list = typeof filter === 'string' && filter.trim() ? uniq.filter(u => u.toLowerCase().includes(String(filter).toLowerCase())) : uniq;

    list.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'site-search-tag';
      // include count badge
      btn.innerHTML = `${escapeHtml(t)} <span class="tag-count">${counts[t]}</span>`;
      btn.setAttribute('aria-label', `${t} (${counts[t]})`);
      btn.addEventListener('click', () => {
        selectedTag = t;
        const inp = document.getElementById('site-search-input');
        if (inp) inp.value = '';
        doSearch();
      });
      container.appendChild(btn);
    });
  }

  function renderResults(matches) {
    const out = document.getElementById('site-search-results');
  const input = document.getElementById('site-search-input');
  const q = input ? input.value.trim().toLowerCase() : '';
    const items = matches || [];
    if (!out) return;
    if (!items.length) {
      out.innerHTML = `<p class="site-search-empty">No results${selectedTag ? ` for tag "${escapeHtml(selectedTag)}"` : (q ? ` for "${escapeHtml(q)}"` : '')}.</p>`;
      return;
    }
    out.innerHTML = items.map(it => {
      const title = escapeHtml(it.title || 'Untitled');
      const desc = escapeHtml(it.description || it.excerpt || '');
      const url = it.url || '#';
      const tagsHtml = (it.tags || []).map(t => `<button type="button" class="site-search-result-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join(' ');
      return `
        <article class="site-search-item">
          <h3 class="site-search-item-title"><a href="${url}">${title}</a></h3>
          <div class="site-search-item-meta">${tagsHtml}</div>
          <p class="site-search-item-desc">${desc}</p>
        </article>
      `;
    }).join('\n');

    // attach tag handlers inside results
    out.querySelectorAll('.site-search-result-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const t = e.currentTarget.dataset.tag;
        selectedTag = t;
        document.getElementById('site-search-input').value = '';
        doSearch();
      });
    });
  }

  async function doSearch() {
    const all = await loadIndex();
    // determine current page language: html lang or /zh/ in pathname
    const curLang = (document.documentElement.lang || (location.pathname.indexOf('/zh/') !== -1 ? 'zh' : 'en')).toLowerCase();
    const input = document.getElementById('site-search-input');
    const q = input ? input.value.trim().toLowerCase() : '';
    // filter to current language only
    let matched = all.filter(it => (it.lang || 'en').toLowerCase() === curLang);
    if (selectedTag) {
      matched = matched.filter(it => Array.isArray(it.tags) && it.tags.map(t => t.toLowerCase()).includes(selectedTag.toLowerCase()));
    }
    // mode-specific filtering
    if (!selectedTag && q) {
      if (searchMode === 'tag') {
        // in tag mode, match items that have a tag containing the query
        matched = matched.filter(it => Array.isArray(it.tags) && it.tags.join(' ').toLowerCase().includes(q));
      } else {
        // keyword mode: full-text match on title/description/excerpt/tags
        matched = matched.filter(it => {
          return (it.title && String(it.title).toLowerCase().includes(q)) ||
                 (it.description && String(it.description).toLowerCase().includes(q)) ||
                 (it.excerpt && String(it.excerpt).toLowerCase().includes(q)) ||
                 (Array.isArray(it.tags) && it.tags.join(' ').toLowerCase().includes(q));
        });
      }
    }
    // sort pinned first then by pubDate desc
    matched.sort((a,b) => {
      if (a.pinned && !b.pinned) return -1;
      if (b.pinned && !a.pinned) return 1;
      if (a.pubDate && b.pubDate) return String(b.pubDate).localeCompare(String(a.pubDate));
      return 0;
    });
    renderResults(matched.slice(0, 200));
    // show active tag in UI
    const tagView = document.getElementById('site-search-active-tag');
    if (tagView) tagView.textContent = selectedTag ? `Tag: ${selectedTag}` : '';
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadIndex();
    // read tag or q param from URL (e.g. /search?tag=foo or /search?q=term)
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('tag');
      const qParam = params.get('q');
      if (t) {
        selectedTag = t;
        const input = document.getElementById('site-search-input');
        if (input) input.value = '';
      } else if (qParam) {
        console.debug('[site-search] found q param:', qParam);
        const input = document.getElementById('site-search-input');
        if (input) {
          input.value = qParam;
          // 若 URL 中带有 q 参数，立即执行搜索以展示结果（确保从 header 重定向后页面立刻显示）
          try {
            selectedTag = null;
            console.debug('[site-search] calling doSearch for q param');
            await doSearch();
            console.debug('[site-search] doSearch completed');
          } catch (e) {
            // 若搜索失败，记录错误但不要阻止页面继续初始化
            console.error('initial doSearch failed for q param', e);
          }
        } else {
          console.warn('[site-search] site-search-input not found when q param present');
        }
      }
    } catch (e) {}
    const input = document.getElementById('site-search-input');
    const form = document.getElementById('site-search-form');
    const tagCloud = document.getElementById('site-search-tagcloud');

    // hook up mode toggle (segmented buttons reused from preferences styles)
      const modeToggle = document.querySelector('.search-mode-toggle');
      // local helper: update segmented indicator for the search toggle
      function updateSegIndicatorLocal(segmentedContainer) {
        try {
          const activeBtn = segmentedContainer.querySelector('.seg-btn.is-active');
          if (!activeBtn) return;
          const containerRect = segmentedContainer.getBoundingClientRect();
          const btnRect = activeBtn.getBoundingClientRect();
          const offset = btnRect.left - containerRect.left - 4; // match padding used in CSS
          const width = btnRect.width;
          segmentedContainer.style.setProperty('--indicator-offset', `${offset}px`);
          segmentedContainer.style.setProperty('--indicator-width', `${width}px`);
        } catch (e) { /* noop */ }
      }

      if (modeToggle) {
        // initialize active state from default
        const btns = modeToggle.querySelectorAll('[data-search-mode]');
        btns.forEach(b => b.classList.remove('is-active'));
        const initBtn = modeToggle.querySelector('[data-search-mode="keyword"]') || btns[0];
        if (initBtn) {
          initBtn.classList.add('is-active');
          initBtn.setAttribute('aria-pressed', 'true');
          requestAnimationFrame(() => updateSegIndicatorLocal(modeToggle));
        }

        modeToggle.querySelectorAll('[data-search-mode]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const mode = btn.dataset.searchMode === 'tag' ? 'tag' : 'keyword';
            searchMode = mode;
            // update aria pressed and is-active class
            modeToggle.querySelectorAll('[data-search-mode]').forEach(b => {
              const active = (b === btn);
              b.setAttribute('aria-pressed', String(active));
              b.classList.toggle('is-active', active);
            });
            // update indicator position
            requestAnimationFrame(() => updateSegIndicatorLocal(modeToggle));

            // update placeholder
            if (input) input.placeholder = (mode === 'tag') ? 'Filter tags...' : 'Search this site...';
            // when switching to tag mode, show tag cloud filtered by current input
            if (tagCloud) {
              const allTags = (await loadIndex()).flatMap(it => Array.isArray(it.tags) ? it.tags : []);
              renderTags(allTags, tagCloud, (input && input.value) ? input.value : '');
            }
          });
        });
      }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        // if in tag mode, treat input as tag filter/selection
        if (searchMode === 'tag') {
          const t = input ? input.value.trim() : '';
          selectedTag = t || null;
          if (input) input.value = '';
          doSearch();
          return;
        }
        selectedTag = null;
        doSearch();
      });
    }

    if (input) {
      input.addEventListener('input', async () => {
        selectedTag = null;
        if (searchMode === 'tag') {
          // filter tag cloud to help user pick tags
          const all = await loadIndex();
          const tags = all.flatMap(it => Array.isArray(it.tags) ? it.tags : []);
          if (tagCloud) renderTags(tags, tagCloud, input.value);
        } else {
          doSearch();
        }
      });
    }

    // render global tag cloud from all tags
    const allTags = (await loadIndex()).flatMap(it => Array.isArray(it.tags) ? it.tags : []);
    if (tagCloud) renderTags(allTags, tagCloud);

    // initial render (all posts)
    doSearch();
  });
})();
