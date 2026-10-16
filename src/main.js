import './style.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3210').replace(/\/$/, '');
const app = document.querySelector('#app');
const state = { query: '', format: 'all', results: [], loading: false, searched: false, error: '', page: 1, hasMore: false };

const icon = (name, size = 20) => {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    loader: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    fileSearch: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5"/><path d="M14 2v6h6M8 13h4"/><circle cx="17" cy="17" r="3"/><path d="m19.2 19.2 1.8 1.8"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
};

function render() {
  app.innerHTML = `
    <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <header class="topbar">
      <a class="brand" href="#top" aria-label="LomaDownloader início">
        <span class="brand-icon">L<span class="brand-glint">✦</span></span>
        <span class="brand-name">Loma<span>Downloader</span><small>DOCUMENTOS ABERTOS</small></span>
      </a>
      <nav class="main-nav"><a class="nav-active" href="#pesquisar">Explorar</a><a href="#fontes">Fontes seguras</a><a href="#scribd">Link do Scribd</a></nav>
      <div class="top-actions"><span class="status-dot"></span><span class="status-label" id="api-status">Conectando ao servidor</span><button class="mobile-menu" aria-label="Abrir menu">${icon('menu', 22)}</button></div>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-star">${icon('spark', 14)}</span> SUA BIBLIOTECA COMEÇA AQUI</div>
          <h1>Conhecimento livre.<br/><span>Do seu jeito.</span></h1>
          <p class="hero-desc">Encontre documentos em português do Brasil, filtre por PDF ou EPUB e descubra arquivos disponíveis em fontes públicas.</p>
          <div class="hero-metrics">
            <div class="metric"><span class="metric-icon purple">${icon('file', 17)}</span><span><b>PDF + EPUB</b><small>Formatos selecionados</small></span></div>
            <div class="metric-divider"></div>
            <div class="metric"><span class="metric-icon blue">${icon('globe', 17)}</span><span><b>Fontes públicas</b><small>Links verificáveis</small></span></div>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="art-halo"></div>
          <div class="float-file file-pdf"><span class="mini-file pdf">PDF</span><div><b>Documento</b><small>Formato PDF</small></div><span class="float-check">${icon('check', 13)}</span></div>
          <div class="float-file file-epub"><span class="mini-file epub">EPUB</span><div><b>E-book</b><small>Formato EPUB</small></div><span class="float-check">${icon('check', 13)}</span></div>
          <div class="hero-book"><div class="book-spine"></div><div class="book-front"><div class="book-symbol">L<span>✦</span></div><div class="book-lines"><i></i><i></i><i></i></div><div class="book-caption">CONHECIMENTO<br/>SEM FRONTEIRAS</div><div class="book-orb"></div></div></div>
          <span class="sparkle sparkle-a">✦</span><span class="sparkle sparkle-b">✧</span><span class="sparkle sparkle-c">✦</span>
        </div>
      </section>

      <section id="pesquisar" class="search-section">
        <div class="section-kicker">/ EXPLORAR A BIBLIOTECA</div>
        <div class="section-heading-row"><div><h2>O que você quer <span>encontrar?</span></h2><p>Pesquise pelo título e encontre formatos compatíveis.</p></div><div class="language-pill">${icon('globe', 15)} <span>Português do Brasil</span><span class="pill-dot"></span></div></div>
        <form id="search-form" class="search-panel">
          <div class="search-input-wrap">${icon('search', 22)}<input id="search-input" type="search" minlength="2" maxlength="120" placeholder="Digite o título do documento, livro ou apostila..." value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Título para pesquisar"/><kbd>↵</kbd></div>
          <div class="search-bottom"><div class="filters-label">FORMATO</div><div class="format-filters" role="group" aria-label="Filtrar formato">
            <button type="button" class="format-filter ${state.format === 'all' ? 'selected' : ''}" data-format="all">Todos <span>PDF · EPUB</span></button>
            <button type="button" class="format-filter ${state.format === 'pdf' ? 'selected' : ''}" data-format="pdf"><span class="filter-pip pdf-pip"></span> PDF</button>
            <button type="button" class="format-filter ${state.format === 'epub' ? 'selected' : ''}" data-format="epub"><span class="filter-pip epub-pip"></span> EPUB</button>
          </div><button class="search-submit" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? icon('loader', 17) : icon('search', 17)} ${state.loading ? 'Pesquisando...' : 'Pesquisar'}</button></div>
        </form>
        <div class="search-note">${icon('shield', 15)} A busca usa metadados de fontes públicas. Só exibimos arquivos PDF/EPUB com indicação regional brasileira nos metadados disponíveis.</div>
      </section>

      <section id="resultados" class="results-section">
        <div class="results-top"><div><div class="section-kicker">/ RESULTADOS</div><h2>${state.searched ? 'Sua busca' : 'Comece por aqui'}<span class="results-count">${state.searched && !state.loading && !state.error ? state.results.length : ''}</span></h2></div>${state.searched ? `<div class="results-tools"><span class="query-chip">${icon('search', 13)} ${escapeHtml(state.query)}</span><button class="scribd-search-shortcut" id="scribd-title-search">Scribd ${icon('external', 12)}</button></div>` : `<span class="source-tag">${icon('globe', 14)} Internet Archive</span>`}</div>
        <div id="results-content">${renderResults()}</div>
      </section>

      <section id="scribd" class="scribd-section">
        <div class="scribd-icon">${icon('link', 24)}</div><div class="scribd-copy"><span class="section-kicker">JÁ TEM UM DOCUMENTO EM MENTE?</span><h2>Tem um link do <span>Scribd?</span></h2><p>Abra a página original e use a opção oficial de download quando estiver disponível para o documento.</p></div>
        <form class="scribd-form" id="scribd-form"><label for="scribd-url">Link do documento</label><div class="scribd-input-row"><input id="scribd-url" type="url" placeholder="https://www.scribd.com/document/..." required/><button type="submit" aria-label="Abrir documento no Scribd">${icon('arrow', 19)}</button></div><small>O LomaDownloader não contorna login, assinatura ou restrições de download.</small></form>
      </section>

      <section id="fontes" class="trust-section"><div class="trust-intro"><div class="trust-symbol">${icon('shield', 25)}</div><div><span class="section-kicker">PROJETADO COM CUIDADO</span><h2>Downloads com <span>mais clareza.</span></h2><p>A origem sempre fica visível. Você sabe onde está o arquivo antes de abrir ou baixar.</p></div></div><div class="trust-grid"><article class="trust-card"><div class="trust-card-icon">${icon('globe', 20)}</div><h3>Fontes identificadas</h3><p>Cada resultado mostra o repositório e o link da página original.</p></article><article class="trust-card"><div class="trust-card-icon">${icon('file', 20)}</div><h3>Formato conferido</h3><p>Resultados limitados a arquivos PDF e EPUB encontrados nos metadados.</p></article><article class="trust-card"><div class="trust-card-icon">${icon('shield', 20)}</div><h3>Sem atalhos arriscados</h3><p>Não pedimos senha de terceiros nem tentamos contornar controles de acesso.</p></article></div></section>
    </main>
    <footer class="footer"><a class="brand footer-brand" href="#top"><span class="brand-icon">L<span class="brand-glint">✦</span></span><span class="brand-name">Loma<span>Downloader</span><small>DOCUMENTOS ABERTOS</small></span></a><div class="footer-center">Conhecimento é para compartilhar.<span>Resultados sujeitos à disponibilidade das fontes.</span></div><span class="footer-version">v0.2.0 <i></i> PT-BR</span></footer>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;
  bindEvents();
}

function renderResults() {
  if (state.loading) return `<div class="loading-grid">${Array.from({length: 3}, () => `<div class="result-card skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`).join('')}</div>`;
  if (state.error) return `<div class="empty-state error-state"><span class="empty-icon">${icon('info', 25)}</span><h3>Não foi possível concluir a busca</h3><p>${escapeHtml(state.error)}</p><button class="outline-button" id="retry-search">Tentar novamente ${icon('chevron', 15)}</button></div>`;
  if (!state.searched) return `<div class="empty-state"><span class="empty-icon">${icon('fileSearch', 26)}</span><h3>Uma boa leitura começa com uma busca</h3><p>Digite um título acima. Mostraremos apenas resultados que tenham PDF ou EPUB e metadados compatíveis com português do Brasil.</p><div class="popular-searches"><button data-suggestion="educação financeira">Educação financeira</button><button data-suggestion="literatura brasileira">Literatura brasileira</button><button data-suggestion="matemática ensino médio">Matemática</button></div></div>`;
  if (!state.results.length) return `<div class="empty-state"><span class="empty-icon">${icon('search', 25)}</span><h3>Nenhum resultado confirmado desta vez</h3><p>Não encontramos arquivos que atendam a todos os filtros. Muitas fontes registram apenas “Português”, sem indicar se é do Brasil; esses registros não são apresentados como brasileiros sem confirmação.</p><button class="outline-button" id="open-scribd-search">Pesquisar este título no Scribd ${icon('external', 15)}</button></div>`;
  return `<div class="result-grid">${state.results.map((item, idx) => renderCard(item, idx)).join('')}</div>${state.hasMore ? `<div class="load-more-row"><button class="outline-button" id="load-more">Carregar mais resultados ${icon('chevron', 15)}</button></div>` : ''}`;
}

function renderCard(item, idx) {
  const primary = item.downloads?.[0] || null;
  const ext = primary?.format || item.formats?.[0] || 'PDF';
  const fileClass = ext.toLowerCase() === 'epub' ? 'epub' : 'pdf';
  const formatPills = (item.formats || []).map(f => `<span class="file-pill ${f.toLowerCase()}">${escapeHtml(f)}</span>`).join('');
  const authors = Array.isArray(item.creator) ? item.creator.join(', ') : (item.creator || 'Autor não informado');
  const description = item.description || 'Consulte a página da fonte para conferir os detalhes do documento.';
  return `<article class="result-card" style="--card-index:${idx}"><div class="card-topline"><span class="source-badge"><span></span> ${escapeHtml(item.source || 'Internet Archive')}</span><button class="card-menu" title="Abrir página original" data-source="${escapeAttr(item.sourceUrl)}" aria-label="Abrir fonte">${icon('external', 16)}</button></div><div class="cover-area ${fileClass}"><div class="cover-glow"></div><div class="doc-cover"><div class="doc-cover-top">LOMA / OPEN LIBRARY</div><div class="doc-cover-lines"><i></i><i></i><i></i></div><div class="doc-cover-icon">${icon('file', 27)}</div><div class="doc-cover-bottom"><span>${escapeHtml(ext)}</span><small>ARQUIVO DIGITAL</small></div></div><span class="cover-format ${fileClass}">${escapeHtml(ext)}</span></div><div class="card-content"><div class="card-format-row">${formatPills}<span class="lang-indicator">${icon('globe', 12)} PT-BR</span></div><h3 title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</h3><p class="card-author">${escapeHtml(authors)}${item.year ? ` <span>·</span> ${escapeHtml(String(item.year))}` : ''}</p><p class="card-description">${escapeHtml(description)}</p><div class="card-actions">${primary ? `<a class="download-button" href="${escapeAttr(downloadHref(item.id, primary.name))}" rel="noopener"><span>${icon('download', 16)}</span> Baixar ${escapeHtml(primary.format)}</a>` : `<a class="download-button" href="${escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver documento ${icon('external', 15)}</a>`}<a class="source-link" href="${escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte original ${icon('arrow', 13)}</a></div></div></article>`;
}

function downloadHref(identifier, fileName) {
  return `${API_BASE_URL}/api/download?identifier=${encodeURIComponent(identifier)}&file=${encodeURIComponent(fileName)}`;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function escapeAttr(value) { return escapeHtml(value); }
function showToast(message, kind = 'info') {
  const toast = document.querySelector('#toast'); if (!toast) return;
  toast.className = `toast visible ${kind}`; toast.textContent = message;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3400);
}
function bindEvents() {
  document.querySelectorAll('[data-format]').forEach(btn => btn.addEventListener('click', () => { state.format = btn.dataset.format; render(); document.querySelector('#search-input')?.focus(); }));
  document.querySelector('#search-form')?.addEventListener('submit', e => { e.preventDefault(); const val = document.querySelector('#search-input').value.trim(); if (val.length < 2) { showToast('Digite pelo menos 2 caracteres para pesquisar.', 'warning'); return; } state.query = val; state.page = 1; performSearch(false); });
  document.querySelectorAll('[data-suggestion]').forEach(btn => btn.addEventListener('click', () => { document.querySelector('#search-input').value = btn.dataset.suggestion; state.query = btn.dataset.suggestion; state.page = 1; performSearch(false); }));
  document.querySelector('#retry-search')?.addEventListener('click', () => performSearch(false));
  document.querySelector('#load-more')?.addEventListener('click', () => { state.page += 1; performSearch(true); });
  document.querySelector('#open-scribd-search')?.addEventListener('click', () => openScribdSearch(state.query));
  document.querySelector('#scribd-title-search')?.addEventListener('click', () => openScribdSearch(state.query));
  document.querySelectorAll('[data-source]').forEach(btn => btn.addEventListener('click', () => safeOpenSource(btn.dataset.source)));
  document.querySelector('#scribd-form')?.addEventListener('submit', e => { e.preventDefault(); const raw = document.querySelector('#scribd-url').value.trim(); try { const u = new URL(raw); if (u.protocol !== 'https:' || !(u.hostname === 'scribd.com' || u.hostname.endsWith('.scribd.com'))) throw new Error('invalid'); window.open(u.href, '_blank', 'noopener,noreferrer'); } catch { showToast('Cole um link HTTPS válido do scribd.com.', 'warning'); } });
  document.querySelector('.mobile-menu')?.addEventListener('click', () => { document.querySelector('.main-nav')?.classList.toggle('mobile-open'); });
}
function safeOpenSource(url) { try { const parsed = new URL(url); if (parsed.protocol === 'https:' && (parsed.hostname === 'archive.org' || parsed.hostname.endsWith('.archive.org'))) window.open(parsed.href, '_blank', 'noopener,noreferrer'); } catch {} }
function openScribdSearch(query) { window.open(`https://www.scribd.com/search?query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer'); }

async function performSearch(append) {
  state.loading = true; state.error = ''; state.searched = true; if (!append) state.results = []; render();
  try {
    const params = new URLSearchParams({ q: state.query, format: state.format, page: String(state.page) });
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 18000);
    const response = await fetch(`${API_BASE_URL}/api/search?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } }); clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Servidor respondeu com status ${response.status}.`);
    const newResults = Array.isArray(data.results) ? data.results : [];
    state.results = append ? [...state.results, ...newResults] : newResults;
    state.hasMore = Boolean(data.hasMore);
  } catch (err) {
    state.error = err.name === 'AbortError' ? 'A pesquisa demorou demais. Tente novamente.' : (err.message?.includes('Failed to fetch') ? 'Não consegui acessar o backend. Confira VITE_API_BASE_URL e a configuração CORS do servidor.' : (err.message || 'Erro inesperado.'));
  } finally { state.loading = false; render(); }
}

async function checkApi() {
  const status = document.querySelector('#api-status');
  try { const r = await fetch(`${API_BASE_URL}/api/health`, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(); const d = await r.json(); status.textContent = d.status === 'ok' ? 'Servidor conectado' : 'Servidor indisponível'; status.closest('.top-actions').classList.toggle('connected', d.status === 'ok'); }
  catch { status.textContent = 'Servidor desconectado'; status.closest('.top-actions').classList.add('disconnected'); }
}

render();
checkApi();
