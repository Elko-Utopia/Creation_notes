// 简易客户端搜索，供 /search 页面使用
// 加载 /search-index.json 并提供关键字与标签过滤功能

(function () {
  let index = null;
  let selectedTag = null;
  let allTagsList = [];
  // 固定为关键词模式（移除 Keyword/Tag 切换）
  const searchMode = 'keyword';
  let tagColors = {}; // 从 /tag-colors.json 加载的映射
  let repMap = {}; // normalized -> display label

  // 运行时基准 URL 解析：统一使用一个函数，确保对 /zh/ 或自定义 base 的支持
  function getRuntimeBase() {
    try {
  // 优先使用注入的绝对 base（如果存在）
      if (typeof window !== 'undefined' && window.__ASTRO_BASE_URL__) {
        let b = String(window.__ASTRO_BASE_URL__);
        if (/^\//.test(b)) {
    // 若为 path-only（仅路径），使用当前 origin 合成绝对 URL
          try { b = location.origin.replace(/\/$/, '') + b; } catch (e) {}
        }
        return b.endsWith('/') ? b : b + '/';
      }
  // 如果只注入了 path-only base，则以当前 origin 合成绝对 base
      if (typeof window !== 'undefined' && window.__ASTRO_BASE_PATH__) {
        let p = String(window.__ASTRO_BASE_PATH__);
        try { p = p.startsWith('/') ? p : '/' + p; } catch (e) {}
        try { return (location.origin.replace(/\/$/, '') + p).endsWith('/') ? (location.origin.replace(/\/$/, '') + p) : (location.origin.replace(/\/$/, '') + p + '/'); } catch (e) { return p.endsWith('/') ? p : p + '/'; }
      }
    } catch (e) {}
    try {
      const b = document.querySelector('base');
      if (b && b.href) return b.href.endsWith('/') ? b.href : b.href + '/';
    } catch (e) {}
    try { return location.origin + '/'; } catch (e) { return '/'; }
  }

  // 将索引中的资源路径解析为在本地 dev 与 GH Pages 子路径下均可使用的绝对 URL
  function resolveAssetUrl(p) {
    if (!p) return null;
    const s = String(p).trim();
  // 已是绝对 URL，直接返回
    if (/^https?:\/\//i.test(s) || /^\/\//.test(s)) return s;
    try {
  // 如果以 '/' 开头，则视为站点根相对路径。
  // 若注入了 window.__ASTRO_BASE_PATH__，把它前置以保证 '/assets/...' 解析为 '/<base>/assets/...'
      if (s.startsWith('/')) {
        try {
          if (typeof window !== 'undefined' && window.__ASTRO_BASE_PATH__) {
            const bp = String(window.__ASTRO_BASE_PATH__);
            const base = (location.origin.replace(/\/$/, '') + (bp.startsWith('/') ? bp : '/' + bp)).replace(/\/$/, '') + '/';
            return new URL(s.replace(/^\//, ''), base).toString();
          }
        } catch (e) {
          // 回退到 document.baseURI
        }
        return new URL(s, location.origin).toString();
      }

  // 去除开头的 ../ 段（生成索引时常见），例如 '../../assets/...' -> 'assets/...'，然后基于运行时 base 解析
      const cleaned = s.replace(/^(?:\.\.\/)+/, '');
      const base = getRuntimeBase();
      try { return new URL(cleaned, base).toString(); } catch (e) { return new URL(cleaned, location.origin + '/').toString(); }
    } catch (e) {
      return String(p);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[ch]);
  }

  async function loadIndex() {
    if (index) return index;
    try {
  // 在多种环境下尝试多个候选 URL（dev server、GH Pages 子路径、或 <base> / 注入全局值差异）以提高健壮性
      const runtimeBase = getRuntimeBase();
      console.debug('[site-search] loadIndex resolving base ->', runtimeBase);

  // 按优先级构建候选 URL 列表
      const candidates = [];
      try { candidates.push(new URL('search-index.json', runtimeBase).toString()); } catch(e) {}
      try { candidates.push(new URL('search-index.json', document.baseURI).toString()); } catch(e) {}
      try { candidates.push(new URL('search-index.json', location.origin + '/').toString()); } catch(e) {}
  // 如果存在 path-only base，则尝试与当前 origin 组合
      try {
        if (typeof window !== 'undefined' && window.__ASTRO_BASE_PATH__) {
          const p = String(window.__ASTRO_BASE_PATH__);
          const maybe = (location.origin.replace(/\/$/, '') + (p.startsWith('/') ? p : '/' + p)).replace(/\/+$|(?<=.)$/, '/') ;
          candidates.push(new URL('search-index.json', maybe).toString());
        }
      } catch (e) {}
  // 还尝试从当前文档位置的相对路径去请求
      try { candidates.push(new URL('./search-index.json', location.href).toString()); } catch(e) {}

  // 去重并保留顺序
      const seen = new Set();
      const uniq = candidates.filter(u => {
        if (!u) return false;
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      });

  async function tryFetchCandidates(list) {
        for (let i = 0; i < list.length; i++) {
          const url = list[i];
          try {
            console.debug('[site-search] 尝试索引 URL ->', url);
            const r = await fetch(url);
            if (r && r.ok) {
              console.debug('[site-search] 成功从以下 URL 获取索引 ->', url);
              return await r.json();
            } else {
              console.debug('[site-search] 索引请求失败', url, r && r.status);
            }
          } catch (e) {
            console.debug('[site-search] 索引请求异常', url, e && e.message);
          }
        }
        throw new Error('all index fetch attempts failed');
      }

      index = await tryFetchCandidates(uniq);
      // Defensive normalization: if the site is deployed under a non-root base
      // (e.g. '/Creation_notes/') but the fetched index contains entries whose
      // `url` values are missing that base (for example because an index from
      // the site root was returned), prepend the detected base path to those
      // urls so client-side links point to the published subpath.
      try {
        const rb = getRuntimeBase();
        let bp = '/';
        try { bp = new URL(rb).pathname || '/'; } catch (e) { bp = rb || '/'; }
        // ensure base path ends with slash
        if (typeof bp === 'string' && !bp.endsWith('/')) bp = bp + '/';
        if (bp && bp !== '/') {
          // Normalize each item's url if it appears to be origin-root relative
          index = (Array.isArray(index) ? index : []).map(it => {
            try {
              if (!it || !it.url || typeof it.url !== 'string') return it;
              const u = String(it.url);
              // If url already contains the base path, leave it alone
              if (u.indexOf(bp) === 0) return it;
              // If it's an absolute path starting with '/', but missing the base, prepend it
              if (u.startsWith('/')) {
                return Object.assign({}, it, { url: (bp.replace(/\/$/, '') + u) });
              }
              // For relative urls (no leading slash), resolve against base
              try { return Object.assign({}, it, { url: new URL(u, rb).toString().replace(/^https?:\/\/[^\/]+/, '') }); } catch (e) { return it; }
            } catch (e) { return it; }
          });
        }
      } catch (e) { /* ignore normalization errors */ }
      // 运行时防护：若索引里仍存在带有 system 标签的条目，则在客户端过滤掉这些条目。
      try {
        const before = Array.isArray(index) ? index.length : 0;
        index = (Array.isArray(index) ? index : []).filter(it => {
          if (!it || !Array.isArray(it.tags)) return true;
          return !it.tags.some(tag => String(tag || '').trim().toLowerCase() === 'system');
        });
        const after = index.length;
        if (before !== after) console.debug('[site-search] filtered out system-tag items from index', { before, after });
      } catch (e) {
        console.debug('[site-search] failed to filter system tags at runtime', e);
      }
      return index;
    } catch (e) {
      console.error('Failed to load search index', e);
      index = [];
      return index;
    }
  }

  async function loadTagColors() {
    if (tagColors && Object.keys(tagColors).length) return tagColors;
    try {
      const runtimeBase = getRuntimeBase();
      console.debug('[site-search] loadTagColors resolving base ->', runtimeBase);

      const candidates = [];
      try { candidates.push(new URL('tag-colors.json', runtimeBase).toString()); } catch(e) {}
      try { candidates.push(new URL('tag-colors.json', document.baseURI).toString()); } catch(e) {}
      try { candidates.push(new URL('tag-colors.json', location.origin + '/').toString()); } catch(e) {}
      try { candidates.push(new URL('./tag-colors.json', location.href).toString()); } catch(e) {}
      const seen = new Set();
      const uniq = candidates.filter(u => { if (!u) return false; if (seen.has(u)) return false; seen.add(u); return true; });

      async function tryFetchCandidates(list) {
        for (let i = 0; i < list.length; i++) {
          const url = list[i];
          try {
            console.debug('[site-search] trying tag-colors url ->', url);
            const r = await fetch(url);
            if (r && r.ok) {
              console.debug('[site-search] fetched tag-colors from ->', url);
              return await r.json();
            } else {
              console.debug('[site-search] tag-colors fetch failed', url, r && r.status);
            }
          } catch (e) {
            console.debug('[site-search] tag-colors fetch error', url, e && e.message);
          }
        }
        throw new Error('all tag-colors fetch attempts failed');
      }

      const raw = await tryFetchCandidates(uniq);
      const normalized = Object.create(null);
      Object.keys(raw).forEach(k => {
        const nk = String(k).trim().toLowerCase();
        normalized[nk] = raw[k];
      });
      tagColors = normalized;
      return tagColors;
    } catch (e) {
      console.debug('No tag-colors.json found or failed to load', e);
      tagColors = {};
      return tagColors;
    }
  }

  function normalizeTag(t) {
    if (!t) return '';
    // strip leading punctuation like '-', '·', etc., and trim
    return String(t).replace(/^[^\w\p{L}]+/u, '').trim().toLowerCase();
  }

  function contrastColorFor(hex) {
    try {
      // normalize hex (#rgb or #rrggbb)
      let h = String(hex || '').trim();
      if (h.startsWith('#')) h = h.slice(1);
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      if (h.length !== 6) return '#ffffff';
      const r = parseInt(h.slice(0,2), 16);
      const g = parseInt(h.slice(2,4), 16);
      const b = parseInt(h.slice(4,6), 16);
      // relative luminance per WCAG
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return lum > 0.6 ? '#111827' : '#ffffff';
    } catch (e) {
      return '#ffffff';
    }
  }

  function renderTags(tags, container, filter) {
    // build counts for each normalized tag and remember a representative display label
    container.innerHTML = '';
    const counts = Object.create(null);
    const rep = Object.create(null);
    tags.forEach(t => {
      if (!t) return;
      const nk = normalizeTag(t);
      if (!nk) return;
      counts[nk] = (counts[nk] || 0) + 1;
      if (!rep[nk]) {
        // preserve original casing (without punctuation) for display
        rep[nk] = String(t).replace(/^[^\w\p{L}]+/u, '').trim();
      }
    });
    // update global repMap for later use when showing active tag
    repMap = Object.assign({}, repMap, rep);
    // create sorted list by count desc then name
    const uniq = Object.keys(counts).sort((a, b) => {
      const d = counts[b] - counts[a];
      if (d !== 0) return d;
      return a.localeCompare(b);
    }).slice(0, 60);

    // optionally filter tag list by substring
    const list = typeof filter === 'string' && filter.trim() ? uniq.filter(u => u.toLowerCase().includes(String(filter).toLowerCase())) : uniq;

    list.forEach(nk => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'site-search-tag';
      const color = (tagColors && tagColors[nk]) ? tagColors[nk] : null;
      if (color) {
        const fg = contrastColorFor(color);
        btn.style.background = color;
        btn.style.color = fg;
      }
      // hide system tag entirely
      if (nk === 'system') return;
      // 如果已有选中标签并且当前不是选中标签，则使其在 tag cloud 中变灰
      if (selectedTag && nk !== selectedTag) {
        btn.style.opacity = '0.45';
      }
      const label = rep[nk] || nk;
      // include count badge as superscript-like element
      btn.innerHTML = `${escapeHtml(label)} <span class="tag-count">${counts[nk] || 0}</span>`;
      btn.setAttribute('aria-label', `${label} (${counts[nk] || 0})`);
      // store normalized tag in data-tag for consistent matching
      btn.dataset.tag = nk;
      btn.addEventListener('click', () => {
        // 点击相同 tag 则取消选择，否则选择该 tag
        selectedTag = (selectedTag === nk) ? null : nk;
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
  const runtimeBase = getRuntimeBase();
  const placeholder = new URL('assets/blog-placeholder-2.webp', runtimeBase).toString();
    out.innerHTML = items.map(it => {
      const title = escapeHtml(it.title || 'Untitled');
      // 在 keyword 搜索下优先展示命中的段落并高亮关键词；
      // 如果没有关键词（q 为空）则显示文章简介/描述（正常颜色，不变灰）
      let descHtml = '';
      if (q && !selectedTag && Array.isArray(it.paragraphs) && it.paragraphs.length) {
        const found = it.paragraphs.find(p => String(p).toLowerCase().includes(q));
        if (found) {
          // 安全地 escape 后再高亮匹配项
          const escaped = escapeHtml(found);
          try {
            const safeQ = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(${safeQ})`, 'ig');
            const highlighted = escaped.replace(re, '<mark class="search-hit">$1</mark>');
            descHtml = `<span class="search-paragraph">${highlighted}</span>`;
          } catch (e) {
            descHtml = `<span class="search-paragraph">${escaped}</span>`;
          }
        } else {
          // 没有命中段落但有关键词：回退到 description/excerpt，同时高亮关键词
          const base = escapeHtml(it.description || it.excerpt || '');
          try {
            const safeQ = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(${safeQ})`, 'ig');
            const highlighted = base.replace(re, '<mark class="search-hit">$1</mark>');
            descHtml = `<span class="search-paragraph">${highlighted}</span>`;
          } catch (e) {
            descHtml = `<span class="search-paragraph">${base}</span>`;
          }
        }
      } else {
        // 无关键词时，直接显示文章简介，正常颜色
        descHtml = escapeHtml(it.description || it.excerpt || '');
      }
      const url = it.url || '#';
      // resolve hero image and position
      let imgUrl = placeholder;
      let imgFallback = null;
      try {
        if (it.heroImage) {
          const raw = String(it.heroImage).trim();
          // Produce two candidates: prefer current origin + cleaned path, fallback to runtime base resolution
          const cleaned = raw.replace(/^(?:\.\.\/)+/, '').replace(/^\//, '');
          try {
            // primary: origin-root relative (http://host/assets/...)
            if (typeof location !== 'undefined' && location.origin) {
              imgUrl = location.origin.replace(/\/$/, '') + '/' + cleaned;
            }
          } catch (e) {
            imgUrl = placeholder;
          }
          try {
            const rb = getRuntimeBase();
            imgFallback = new URL(cleaned, rb).toString();
          } catch (e) {
            imgFallback = null;
          }
          // if primary equals fallback, just use one
          if (imgFallback && imgUrl === imgFallback) imgFallback = null;
        }
      } catch (e) { imgUrl = placeholder; imgFallback = null; }
      // use heroImagePosition when provided (allow values like 'top', 'bottom', 'center center', '50% 10%', etc.)
  const heroPosRaw = (it.heroImagePosition || it.heroPosition || '').toString().trim();
  const heroPos = heroPosRaw ? heroPosRaw : 'center center';
  const heroWidthRaw = (it.heroImageWidth || it.heroWidth || '').toString().trim();
  const heroWidth = heroWidthRaw ? heroWidthRaw : '';
      // format pubDate if available
      let dateHTML = '';
      if (it.pubDate) {
        try {
          const d = new Date(it.pubDate);
          if (!isNaN(d)) {
            const locale = (document.documentElement && document.documentElement.lang) ? document.documentElement.lang : undefined;
            const opts = { year: 'numeric', month: 'short', day: 'numeric' };
            dateHTML = `<time class="post-date" datetime="${escapeHtml(String(it.pubDate))}">${escapeHtml(d.toLocaleDateString(locale, opts))}</time>`;
          }
        } catch (e) {
          // ignore formatting errors
        }
      }
      // render tag badges (显示全部标签；若有已选 tag，则将非选中标签显示为灰色)
      const tagBadges = (it.tags || []).map(t => {
        const nk = normalizeTag(t);
        const display = String(t).replace(/^[^\w\p{L}]+/u, '').trim() || nk;
          const col = (tagColors && tagColors[nk]) ? tagColors[nk] : null;
          const isSelected = selectedTag && selectedTag === nk;
          // 若有选中标签且当前不是选中项，则使用灰色样式
          if (!isSelected && selectedTag) {
            // dimmed appearance
            return `<span class="post-tag post-tag--dim" data-tag="${escapeHtml(nk)}" style="background:var(--tag-dim-bg,#e5e7eb);color:var(--tag-dim-color,#6b7280);">${escapeHtml(display)}</span>`;
          }
          if (col) {
            const fg = contrastColorFor(col);
            return `<span class="post-tag" data-tag="${escapeHtml(nk)}" style="background:${col};color:${fg};">${escapeHtml(display)}</span>`;
          }
          return `<span class="post-tag" data-tag="${escapeHtml(nk)}">${escapeHtml(display)}</span>`;
      }).join(' ');

      return `
        <article class="site-search-item">
          <a class="inline-portfolio-card" href="${url}">
            <span class="hero-frame" style="background-image:url('${imgUrl}');background-size:cover;background-position:${escapeHtml(heroPos)};${heroWidth ? `--hero-width:${escapeHtml(heroWidth)};` : ''}--hero-position:${escapeHtml(heroPos)};">
              <img class="hero-img" src="${imgUrl}" onerror="(function(img){try{var f='${imgFallback || ''}'; if(f && img.src!==f){ img.src=f; var hf=img.closest('.hero-frame'); if(hf) hf.style.backgroundImage='url('+f+')'; } }catch(e){} })(this)" alt="" loading="lazy" decoding="async" style="${heroWidth ? `width: var(--hero-width, 100%);` : `width: 100%;`}height: 100%; object-fit: cover; ${heroPos ? `object-position: ${escapeHtml(heroPos)};` : ''}" />
            </span>
            <div class="meta">
              <h5 class="title site-heading">${title}</h5>
              ${dateHTML ? `<h6 class="date">${dateHTML}</h6>` : ''}
            </div>
          </a>
          <div class="site-search-item-below">
            <div class="site-search-item-meta">${tagBadges}</div>
            <p class="site-search-item-desc">${descHtml}</p>
          </div>
        </article>
      `;
    }).join('\n');

    // attach tag handlers inside results (for badges inside cards)
    out.querySelectorAll('.post-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const t = e.currentTarget.dataset.tag;
        selectedTag = (selectedTag === t) ? null : t;
        const inp = document.getElementById('site-search-input'); if (inp) inp.value = '';
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
      matched = matched.filter(it => Array.isArray(it.tags) && it.tags.some(tag => normalizeTag(tag) === selectedTag));
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
    // show active tag in UI (display under tag cloud)
    // 不在页面上显示额外的“当前 tag 文本”；只通过 tag cloud 的样式/高亮来表示当前选择
    const tagView = document.getElementById('site-search-active-tag');
    if (tagView) tagView.textContent = '';
    // 重新渲染 tag cloud 以更新高亮/变灰状态
    const tagCloudEl = document.getElementById('site-search-tagcloud');
    if (tagCloudEl) renderTags(allTagsList, tagCloudEl);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadIndex();
    // determine current page language early so tag cloud and counts reflect current language only
    const curLang = (document.documentElement.lang || (location.pathname.indexOf('/zh/') !== -1 ? 'zh' : 'en')).toLowerCase();
    // read tag or q param from URL (e.g. /search?tag=foo or /search?q=term)
    try {
      const params = new URLSearchParams(location.search);
      const t = params.get('tag');
      const qParam = params.get('q');
      if (t) {
        selectedTag = normalizeTag(t);
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
      // Removed keyword/tag toggle: search is always keyword-based. No UI interaction required here.

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        // keyword-only submit
        selectedTag = null;
        doSearch();
      });
    }

    if (input) {
      input.addEventListener('input', async () => {
        selectedTag = null;
        // always do keyword search on input
        doSearch();
      });
    }

  // load tag colors and render global tag cloud from posts in current language
  await loadTagColors();
  allTagsList = (await loadIndex()).filter(it => (it.lang || 'en').toLowerCase() === curLang).flatMap(it => Array.isArray(it.tags) ? it.tags : []);
  if (tagCloud) renderTags(allTagsList, tagCloud);

    // initial render (all posts)
    doSearch();
  });
})();
