'use strict';

const net = require('node:net');
const config = require('../config/chat-system.v1.json');
const { normalizeSources } = require('./sourceContract');
const {
  WEB_GROUNDING_MODEL,
  WEB_SEARCH_ENGINE,
  WEB_MODEL_MAX_OUTPUT_TOKENS,
  WEB_RESERVATION_SEARCH_REQUESTS
} = require('./webSearchPricing');

function webError(code, statusCode = null, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (statusCode) error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function isPrivateIp(hostname) {
  const version = net.isIP(hostname);
  if (!version) return false;
  if (version === 4) {
    const parts = hostname.split('.').map(Number);
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0;
  }
  const lower = hostname.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') ||
    lower.startsWith('fd') || lower.startsWith('fe80:');
}

function validateDirectUrl(value) {
  let url;
  try { url = new URL(String(value)); }
  catch (_) { throw webError('invalid_direct_url', 400); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw webError('invalid_direct_url', 400);
  }
  if (url.port && url.port !== '443') throw webError('direct_url_port_blocked', 400);
  const host = url.hostname.toLowerCase();
  if (
    !host || host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    isPrivateIp(host)
  ) {
    throw webError('direct_url_host_blocked', 400);
  }
  url.hash = '';
  return url.toString();
}

function extractDirectUrls(text) {
  const found = String(text || '').match(/https:\/\/[^\s<>{}\[\]"']+/gi) || [];
  const urls = [];
  for (const candidate of found) {
    const cleaned = candidate.replace(/[),.;!?]+$/g, '');
    const normalized = validateDirectUrl(cleaned);
    if (!urls.includes(normalized)) urls.push(normalized);
    if (urls.length >= 3) break;
  }
  return Object.freeze(urls);
}

function annotationPayload(annotation) {
  if (!annotation || typeof annotation !== 'object') return null;
  if (annotation.type && annotation.type !== 'url_citation') return null;
  const nested = annotation.url_citation && typeof annotation.url_citation === 'object'
    ? annotation.url_citation
    : annotation;
  const url = nested.url || annotation.url;
  if (!url) return null;
  return {
    type: 'web',
    title: nested.title || annotation.title || new URL(url).hostname,
    url,
    snippet: nested.content || nested.snippet || annotation.content || '',
    externalId: nested.id || annotation.id || null,
    metadata: {
      annotationType: 'url_citation',
      startIndex: nested.start_index ?? annotation.start_index ?? null,
      endIndex: nested.end_index ?? annotation.end_index ?? null
    }
  };
}

function sourcesFromAnnotations(annotations = []) {
  const raw = [];
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    try {
      const source = annotationPayload(annotation);
      if (source) raw.push(source);
    } catch (_) {}
  }
  return normalizeSources(raw);
}

function createOpenRouterWebProvider({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw webError('web_fetch_implementation_required');

  return Object.freeze({
    label: 'OpenRouter Web Search + Fetch',
    async search({ query, limit = 5 }, context = {}) {
      const apiKey = String(context.apiKey || process.env.OPENROUTER_API_KEY || '').trim();
      if (!apiKey) throw webError('web_search_provider_credential_missing', 503);
      const normalizedQuery = String(query || '').replace(/\s+/g, ' ').trim();
      if (!normalizedQuery || normalizedQuery.length > config.webSearch.maxQueryCharacters) {
        throw webError('invalid_search_query', 400);
      }
      const safeLimit = Math.max(1, Math.min(5, Number(limit) || 5));
      const directUrls = extractDirectUrls(normalizedQuery);
      const directUrl = directUrls[0] || null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.webSearch.timeoutMs);
      const tools = directUrl
        ? [{
            type: 'openrouter:web_fetch',
            parameters: {
              engine: 'openrouter',
              max_uses: 1,
              max_content_tokens: 12000,
              allowed_domains: [new URL(directUrl).hostname]
            }
          }]
        : [{
            type: 'openrouter:web_search',
            parameters: {
              engine: WEB_SEARCH_ENGINE,
              max_results: safeLimit,
              max_total_results: safeLimit,
              max_uses: WEB_RESERVATION_SEARCH_REQUESTS,
              max_characters: 2500
            }
          }];
      const system = directUrl
        ? [
            'You are ZUVYR Web Reader evidence collector.',
            'You MUST use web_fetch exactly on the explicit HTTPS URL before producing notes.',
            'Do not infer page contents when the fetch fails.',
            'Return concise factual evidence notes only; no hidden reasoning.'
          ].join(' ')
        : [
            'You are ZUVYR Web Search evidence collector.',
            'You MUST use web_search at least once before producing notes.',
            'Use only returned web evidence for current facts.',
            'Return concise factual evidence notes only; no hidden reasoning.'
          ].join(' ');

      let response;
      try {
        const headers = {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'X-Title': 'ZUVYR'
        };
        const httpReferer = String(
          context.httpReferer || process.env.APP_URL || ''
        ).trim();
        if (httpReferer) headers['HTTP-Referer'] = httpReferer;

        response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            model: WEB_GROUNDING_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: normalizedQuery }
            ],
            max_tokens: WEB_MODEL_MAX_OUTPUT_TOKENS,
            max_tool_calls: directUrl ? 1 : WEB_RESERVATION_SEARCH_REQUESTS,
            tools
          })
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw webError('web_search_timeout', 504, error);
        throw webError('web_search_provider_failed', 502, error);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw webError(`web_search_provider_${response.status}`, 502);
      }
      const data = await response.json();
      const message = data?.choices?.[0]?.message || {};
      const usage = data?.usage || {};
      const sources = sourcesFromAnnotations(message.annotations || []);
      const searchRequests = Number(usage?.server_tool_use?.web_search_requests || 0);
      const fetchRequests = Number(usage?.server_tool_use?.web_fetch_requests || 0);

      if (directUrl) {
        if (!(fetchRequests > 0) && sources.length === 0) {
          throw webError('direct_url_fetch_not_verified', 502);
        }
      } else if (!(searchRequests > 0) || sources.length === 0) {
        throw webError('web_search_sources_missing', 502);
      }

      const verifiedSources = sources.length
        ? sources
        : normalizeSources([{
            type: 'web',
            title: new URL(directUrl).hostname,
            url: directUrl,
            snippet: '',
            metadata: {
              serverTool: 'openrouter:web_fetch',
              verifiedByToolUse: true
            }
          }]);

      return Object.freeze({
        evidence: String(message.content || '').trim().slice(0, 12000),
        sources: verifiedSources,
        usage,
        model: data.model || WEB_GROUNDING_MODEL,
        provider: 'openrouter',
        directUrl,
        mode: directUrl ? 'direct_url' : 'search'
      });
    }
  });
}

module.exports = {
  webError,
  isPrivateIp,
  validateDirectUrl,
  extractDirectUrls,
  annotationPayload,
  sourcesFromAnnotations,
  createOpenRouterWebProvider
};
