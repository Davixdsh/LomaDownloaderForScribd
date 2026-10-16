import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '.env'));

const PORT = positiveInt(process.env.PORT, 3210);
const RATE_LIMIT_PER_MINUTE = positiveInt(process.env.RATE_LIMIT_PER_MINUTE, 30);
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);
const IA_ADVANCED_SEARCH = 'https://archive.org/advancedsearch.php';
const IA_METADATA_BASE = 'https://archive.org/metadata/';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_LENGTH = 120;
const MAX_ROWS_PER_PAGE = 40;
const MAX_CANDIDATES_TO_INSPECT = 40;
const rateWindows = new Map();
const searchCache = new Map();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(payload);
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}
function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}
function normalizeText(value) {
  return normalizeArray(value).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isBrazilianPortuguese(metadataOrLanguage) {
  const obj = typeof metadataOrLanguage === 'object' && metadataOrLanguage !== null
    ? metadataOrLanguage
    : { language: metadataOrLanguage };

  const languages = normalizeText(obj.language);
  const regional = normalizeText([
    ...normalizeArray(obj.country),
    ...normalizeArray(obj.coverage),
    ...normalizeArray(obj.region),
    ...normalizeArray(obj.language),
    ...normalizeArray(obj.description),
  ]);

  const languageIsPortuguese =
    /(^|\s)(por|pt|pt-br|pt_br|ptbr|portuguese|portugues)(\s|$|-|_)/i
      .test(` ${languages} `) ||
    languages.includes('portugues');

  const explicitBrazilian =
    /pt-br|pt_br|ptbr|brazilian portuguese|portugues brasileiro|portugues do brasil|brazil|brasil/
      .test(regional);

  // Aceita português genérico, sem exigir indicação regional brasileira.
  return languageIsPortuguese;
}
function normalizeFormat(value) {
  const text = normalizeText(value);
  if (/(^|\b)(pdf)(\b|$)/.test(text)) return 'PDF';
  if (/(^|\b)(epub)(\b|$)/.test(text)) return 'EPUB';
  return null;
}
function requestedFormats(format) {
  if (format === 'pdf') return new Set(['PDF']);
  if (format === 'epub') return new Set(['EPUB']);
  return new Set(['PDF', 'EPUB']);
}
function safeIdentifier(identifier) {
  return typeof identifier === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(identifier);
}
function safeFileName(fileName) {
  if (typeof fileName !== 'string' || fileName.length > 240) return false;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 _.,()'\[\]-]*\.(pdf|epub)$/i.test(fileName);
}
function getAllowedFiles(metadata, selectedFormats = new Set(['PDF', 'EPUB'])) {
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const seen = new Set();
  const result = [];
  for (const file of files) {
    const name = String(file?.name || '');
    if (!safeFileName(name)) continue;
    if (String(file?.private || '').toLowerCase() === 'true') continue;
    const extension = name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'EPUB';
    if (!selectedFormats.has(extension) || seen.has(name)) continue;
    seen.add(name);
    const size = Number(file.size);
    result.push({ name, format: extension, size: Number.isFinite(size) && size >= 0 ? size : null });
  }
  return result;
}
function escapeLucenePhrase(text) {
  return text.replace(/[\\"+\-!(){}\[\]^~*?:/]/g, '\\$&').replace(/\s+/g, ' ').trim();
}
function cacheKey(query, format, page) { return `${query.toLocaleLowerCase('pt-BR')}|${format}|${page}`; }
function getCache(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { searchCache.delete(key); return null; }
  return entry.value;
}
function setCache(key, value) {
  if (searchCache.size > 120) {
    const now = Date.now();
    for (const [k, entry] of searchCache) if (entry.expiresAt <= now) searchCache.delete(k);
    while (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { value, expiresAt: Date.now() + 120_000 });
}
async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'LomaDownloader/0.2.0 (public-catalog-search)' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`A fonte pública respondeu com HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('json')) throw new Error('A fonte pública retornou uma resposta inesperada.');
  return response.json();
}
async function fetchArchiveMetadata(identifier) {
  if (!safeIdentifier(identifier)) throw new Error('Identificador de documento inválido.');
  return fetchJson(`${IA_METADATA_BASE}${encodeURIComponent(identifier)}`);
}
function pickString(value, fallback = '') {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ') || fallback;
  return value === undefined || value === null || value === '' ? fallback : String(value);
}
function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360);
}
function isLikelyNotPrivate(meta) {
  const access = normalizeText(meta?.access);
  return access !== 'private' && access !== 'restricted';
}
async function inspectCandidate(doc, selectedFormats) {
  if (!safeIdentifier(String(doc?.identifier || ''))) return null;
  try {
    const response = await fetchArchiveMetadata(String(doc.identifier));
    const meta = response?.metadata || {};
    if (!isLikelyNotPrivate(meta)) return null;
    // A regional flag is required: generic "Portuguese" metadata cannot prove Brazilian Portuguese.
    if (!isBrazilianPortuguese(meta)) return null;
    const allowed = getAllowedFiles(response, selectedFormats);
    if (!allowed.length) return null;
    const downloads = allowed.slice(0, 4).map(file => ({ ...file }));
    const formats = [...new Set(downloads.map(file => file.format))];
    const title = pickString(meta.title, pickString(doc.title, 'Documento sem título')).slice(0, 300);
    return {
      id: String(doc.identifier),
      title,
      creator: pickString(meta.creator, pickString(doc.creator, 'Autor não informado')).slice(0, 200),
      year: pickString(meta.year || meta.date || doc.year, '').slice(0, 20),
      language: 'Português',
      description: stripHtml(meta.description || doc.description),
      formats,
      downloads,
      source: 'Internet Archive',
      sourceUrl: `https://archive.org/details/${encodeURIComponent(String(doc.identifier))}`,
    };
  } catch {
    // Skip broken, unavailable or uninspectable items instead of presenting unverified links.
    return null;
  }
}
async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
async function searchDocuments({ query, format = 'all', page = 1 }) {
  const selectedFormats = requestedFormats(format);
  const escaped = escapeLucenePhrase(query);
  const params = new URLSearchParams();
  const terms = escaped
  .split(/\s+/)
  .filter(Boolean)
  .map(term => `title:${term}`);

params.set(
  'q',
  `(${terms.join(' AND ')}) AND mediatype:texts`
);
  for (const field of ['identifier', 'title', 'creator', 'description', 'language', 'coverage', 'year', 'format']) params.append('fl[]', field);
  params.append('sort[]', 'downloads desc');
  params.set('rows', String(MAX_ROWS_PER_PAGE));
  params.set('page', String(page));
  params.set('output', 'json');

  const payload = await fetchJson(`${IA_ADVANCED_SEARCH}?${params.toString()}`);
  const docs = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
  const candidates = docs.filter(doc => {
    const formats = normalizeArray(doc.format).map(normalizeFormat).filter(Boolean);
    return formats.some(f => selectedFormats.has(f));
  }).slice(0, MAX_CANDIDATES_TO_INSPECT);
  const inspected = await mapConcurrent(candidates, 5, doc => inspectCandidate(doc, selectedFormats));
  const results = inspected.filter(Boolean);
  return {
    query,
    format,
    page,
    totalCandidates: Number(payload?.response?.numFound || 0),
    results,
    // The next page is useful only if the source has more items; some pages may contain no regional metadata.
    hasMore: docs.length === MAX_ROWS_PER_PAGE && page < 10,
    source: 'Internet Archive',
    note: 'Registros sem indicação regional brasileira explícita são omitidos.',
  };
}
function applyCors(req, res) {
  const origin = req.headers.origin;
  setSecurityHeaders(res);
  if (!origin) return true; // local curl/health checks; browser requests have Origin.
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}
function clientIp(req) {
  // Do not trust x-forwarded-for here; deploy behind a trusted proxy only if explicitly adapted.
  return req.socket.remoteAddress || 'unknown';
}
function rateLimit(req, res) {
  const key = clientIp(req);
  const now = Date.now();
  let entry = rateWindows.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + 60_000 };
  entry.count += 1;
  rateWindows.set(key, entry);
  if (rateWindows.size > 5000) {
    for (const [ip, value] of rateWindows) if (value.resetAt <= now) rateWindows.delete(ip);
  }
  res.setHeader('RateLimit-Limit', String(RATE_LIMIT_PER_MINUTE));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_PER_MINUTE - entry.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
  if (entry.count > RATE_LIMIT_PER_MINUTE) {
    json(res, 429, { error: 'Muitas solicitações. Aguarde um minuto e tente novamente.' });
    return false;
  }
  return true;
}
async function handleDownload(url, res) {
  const identifier = url.searchParams.get('identifier') || '';
  const fileName = url.searchParams.get('file') || '';

  if (!safeIdentifier(identifier) || !safeFileName(fileName)) {
    json(res, 400, {
      error: 'Identificador ou nome de arquivo inválido.'
    });
    return;
  }

  let metadata;

  try {
    metadata = await fetchArchiveMetadata(identifier);
  } catch {
    json(res, 404, {
      error: 'Não foi possível verificar o arquivo na fonte pública.'
    });
    return;
  }

  if (!isLikelyNotPrivate(metadata?.metadata)) {
    json(res, 403, {
      error: 'O documento não está marcado como público.'
    });
    return;
  }

  const file = getAllowedFiles(metadata).find(
    entry => entry.name === fileName
  );

  if (!file) {
    json(res, 404, {
      error: 'O arquivo PDF/EPUB público não foi encontrado.'
    });
    return;
  }

  const segments = file.name
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const target =
    `https://archive.org/download/${encodeURIComponent(identifier)}/${segments}`;

  let response;

  try {
    response = await fetch(target, {
      headers: {
        'User-Agent': 'LomaDownloader/0.2.0',
        'Accept': 'application/pdf, application/epub+zip, */*'
      },
      signal: AbortSignal.timeout(60_000),
      redirect: 'follow'
    });
  } catch {
    json(res, 502, {
      error: 'Não foi possível obter o arquivo. Tente novamente.'
    });
    return;
  }

  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    json(res, 502, {
      error: 'A fonte pública não conseguiu fornecer o arquivo.'
    });
    return;
  }

  // Só aceita o domínio oficial da fonte e seus servidores de arquivos.
  let finalUrl;

  try {
    finalUrl = new URL(response.url);
  } catch {
    await response.body.cancel().catch(() => {});
    json(res, 502, {
      error: 'Endereço de arquivo inválido.'
    });
    return;
  }

  const host = finalUrl.hostname.toLowerCase();
  const trustedHost =
    host === 'archive.org' || host.endsWith('.archive.org');

  if (finalUrl.protocol !== 'https:' || !trustedHost) {
    await response.body.cancel().catch(() => {});
    json(res, 502, {
      error: 'O servidor de arquivos não é confiável.'
    });
    return;
  }

  const contentType = file.format === 'PDF'
    ? 'application/pdf'
    : 'application/epub+zip';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition':
      `attachment; filename="${file.name.replace(/["\\\r\n]/g, '_')}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  });

  try {
    await new Promise((resolve, reject) => {
      const stream = Readable.fromWeb(response.body);

      stream.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);

      stream.pipe(res);
    });
  } catch (error) {
    console.error('[LomaDownloader download]', error.message);

    if (!res.headersSent) {
      json(res, 502, {
        error: 'Ocorreu um erro durante a transferência.'
      });
    } else {
      res.destroy();
    }
  }
}
async function handleRequest(req, res) {
  if (!applyCors(req, res)) { json(res, 403, { error: 'Origem não autorizada pela configuração CORS.' }); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { json(res, 405, { error: 'Método não permitido.' }); return; }
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/health') {
    json(res, 200, { status: 'ok', service: 'LomaDownloader API', version: '0.2.0', catalog: 'Internet Archive', time: new Date().toISOString() });
    return;
  }
  if (!rateLimit(req, res)) return;
  if (requestUrl.pathname === '/api/search') {
    const query = (requestUrl.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
    const format = (requestUrl.searchParams.get('format') || 'all').toLowerCase();
    const pageRaw = Number.parseInt(requestUrl.searchParams.get('page') || '1', 10);
    const page = Number.isInteger(pageRaw) ? Math.min(10, Math.max(1, pageRaw)) : 1;
    if (query.length < 2 || query.length > MAX_SEARCH_LENGTH) {
      json(res, 400, { error: `O título precisa ter entre 2 e ${MAX_SEARCH_LENGTH} caracteres.` }); return;
    }
    if (!['all', 'pdf', 'epub'].includes(format)) { json(res, 400, { error: 'Formato inválido. Use all, pdf ou epub.' }); return; }
    const key = cacheKey(query, format, page);
    const cached = getCache(key);
    if (cached) { json(res, 200, { ...cached, cached: true }); return; }
    try {
      const result = await searchDocuments({ query, format, page });
      setCache(key, result);
      json(res, 200, result);
    } catch (error) {
      const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      json(res, timeout ? 504 : 502, { error: timeout ? 'A fonte pública demorou para responder. Tente novamente.' : (error?.message || 'Falha ao consultar o catálogo público.') });
    }
    return;
  }
  if (requestUrl.pathname === '/api/download') {
    await handleDownload(requestUrl, res);
    return;
  }
  json(res, 404, { error: 'Rota não encontrada.' });
}

export const internals = { isBrazilianPortuguese, getAllowedFiles, safeIdentifier, safeFileName, requestedFormats, escapeLucenePhrase, normalizeFormat };

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    if (!res.headersSent) json(res, 500, { error: 'Erro inesperado no backend.' });
    else res.destroy();
    // Keep details in server logs only; never expose stack traces to the client.
    console.error('[LomaDownloader API]', error?.message || error);
  });
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LomaDownloader API listening on http://0.0.0.0:${PORT}`);
    console.log(`Allowed frontend origins: ${[...ALLOWED_ORIGINS].join(', ') || '(none)'}`);
  });
}
