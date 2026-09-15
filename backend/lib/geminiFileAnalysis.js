'use strict';

const fs = require('fs');
const {
  preflightAttachmentAnalysisPricing,
  quoteAttachmentAnalysisActual
} = require('./attachmentAnalysisPricing');

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL =
  process.env.GEMINI_ATTACHMENT_MODEL ||
  'gemini-3.8-flash';
const MAX_GEMINI_PDF_BYTES = 50 * 1024 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_GEMINI_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_GEMINI_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_GEMINI_VIDEO_BYTES = 50 * 1024 * 1024;


const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/bmp',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/mpeg',
  'audio/m4a',
  'audio/mp4',
  'audio/l16',
  'audio/opus',
  'audio/alaw',
  'audio/mulaw',
  'audio/webm'
]);

const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/quicktime',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp'
]);

function providerError(code, message = code, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeMimeType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function mediaTypeForMime(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (SUPPORTED_IMAGE_MIME_TYPES.has(normalized)) return 'image';
  if (SUPPORTED_AUDIO_MIME_TYPES.has(normalized)) return 'audio';
  if (SUPPORTED_VIDEO_MIME_TYPES.has(normalized)) return 'video';
  if (normalized === 'application/pdf') return 'document';
  return null;
}

function maxBytesForMediaType(mediaType) {
  if (mediaType === 'image') return MAX_GEMINI_IMAGE_BYTES;
  if (mediaType === 'audio') return MAX_GEMINI_AUDIO_BYTES;
  if (mediaType === 'video') return MAX_GEMINI_VIDEO_BYTES;
  if (mediaType === 'document') return MAX_GEMINI_PDF_BYTES;
  return 0;
}

function canAnalyzeWithGemini({ mimeType, sizeBytes, result } = {}) {
  const normalizedSize = Number(sizeBytes);
  const mediaType = mediaTypeForMime(mimeType);
  if (!result || result.status !== 'provider_required') return false;
  if (!mediaType || !Number.isFinite(normalizedSize) || normalizedSize < 1) {
    return false;
  }
  return normalizedSize <= maxBytesForMediaType(mediaType);
}

async function readJsonResponse(response, code) {
  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }
  if (!response.ok) {
    throw providerError(
      code,
      body?.error?.message || code,
      { status: response.status }
    );
  }
  return body || {};
}

function responseText(payload) {
  const parts = [];
  for (const step of Array.isArray(payload.steps) ? payload.steps : []) {
    if (step && step.type !== 'model_output') continue;
    for (const content of Array.isArray(step?.content) ? step.content : []) {
      if (content?.type === 'text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  if (!parts.length && typeof payload.output_text === 'string') {
    parts.push(payload.output_text);
  }
  return parts.join('\n').trim();
}

function promptForMediaType(mediaType) {
  if (mediaType === 'image') {
    return [
      'Analyze this image faithfully for later question answering.',
      'Identify the language or languages of visible text.',
      'Transcribe important visible text in its original language and script.',
      'Describe important visual details, layout, charts, labels, and relationships.',
      'Clearly mark anything unreadable or uncertain and never invent hidden content.',
      'Return concise Markdown with Languages, Visible text, Visual analysis, and Uncertainties sections.'
    ].join(' ');
  }
  if (mediaType === 'audio') {
    return [
      'Transcribe and analyze this audio faithfully for later question answering.',
      'Identify the language or languages and preserve the original language in the transcript.',
      'Distinguish speakers when possible and include useful timestamps or sections.',
      'Describe important music or sound events without inventing inaudible content.',
      'Return concise Markdown with Languages, Transcript, Key sections, and Uncertainties sections.'
    ].join(' ');
  }
  if (mediaType === 'video') {
    return [
      'Analyze this video faithfully using visuals and audio for later question answering.',
      'Identify spoken and on-screen languages and preserve original wording when transcribing.',
      'Describe key scenes, spoken content, on-screen text, events, and useful timestamps.',
      'Clearly mark anything unseen, inaudible, or uncertain and never invent it.',
      'Return concise Markdown with Languages, Timeline, Transcript/On-screen text, and Uncertainties sections.'
    ].join(' ');
  }
  return [
    'Read this PDF faithfully using document vision and OCR for later question answering.',
    'Identify the language or languages and preserve original wording and script.',
    'Extract meaningful text, tables, charts, images, structure, and key facts.',
    'Clearly mark unreadable or uncertain content and never invent it.',
    'Return concise Markdown with Languages, Structure, Extracted content, and Uncertainties sections.'
  ].join(' ');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeGeminiAttachment({
  filePath,
  fileName,
  mimeType,
  sizeBytes,
  fetchImpl = fetch,
  apiKey = process.env.GOOGLE_API_KEY,
  model = DEFAULT_MODEL,
  pollIntervalMs = Number(
    process.env.GEMINI_FILE_POLL_INTERVAL_MS ||
    DEFAULT_POLL_INTERVAL_MS
  ),
  processingTimeoutMs = Number(
    process.env.GEMINI_FILE_PROCESSING_TIMEOUT_MS ||
    DEFAULT_PROCESSING_TIMEOUT_MS
  )
} = {}) {
  const normalizedMime = normalizeMimeType(mimeType);
  const mediaType = mediaTypeForMime(normalizedMime);
  const normalizedSize = Number(sizeBytes);
  const normalizedKey = String(apiKey || '').trim();

  if (!normalizedKey) throw providerError('gemini_api_key_missing');
  let pricingPreflight;
  try {
    pricingPreflight = preflightAttachmentAnalysisPricing({
      model,
      env: process.env
    });
  } catch (error) {
    throw providerError(
      'gemini_attachment_pricing_unavailable',
      error.message,
      { cause: error.code || error.message }
    );
  }
  if (!filePath || !fs.existsSync(filePath)) {
    throw providerError('gemini_source_file_missing');
  }
  if (!mediaType) throw providerError('gemini_media_type_unsupported');
  if (!Number.isInteger(normalizedSize) || normalizedSize < 1) {
    throw providerError('gemini_file_size_invalid');
  }
  const mediaLimit = maxBytesForMediaType(mediaType);
  if (!mediaLimit || normalizedSize > mediaLimit) {
    throw providerError(
      'gemini_media_too_large',
      'Attachment exceeds the ZUVYR provider-analysis limit.',
      { mediaType, sizeBytes: normalizedSize, maxBytes: mediaLimit }
    );
  }

  const apiHeaders = { 'x-goog-api-key': normalizedKey };
  let uploadedName = null;
  let deletionAttempted = false;
  let deletionSucceeded = false;

  try {
    const startResponse = await fetchImpl(
      GEMINI_BASE_URL + '/upload/v1beta/files',
      {
        method: 'POST',
        headers: {
          ...apiHeaders,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(normalizedSize),
          'X-Goog-Upload-Header-Content-Type': normalizedMime,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: { display_name: String(fileName || 'attachment') }
        })
      }
    );
    if (!startResponse.ok) {
      await readJsonResponse(startResponse, 'gemini_upload_start_failed');
    }
    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw providerError('gemini_upload_url_missing');

    const uploadResponse = await fetchImpl(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(normalizedSize),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: fs.createReadStream(filePath),
      duplex: 'half'
    });
    const uploadPayload = await readJsonResponse(
      uploadResponse,
      'gemini_upload_failed'
    );
    let uploadedFile = uploadPayload.file || uploadPayload;
    uploadedName = String(uploadedFile.name || '').trim();
    if (!uploadedName || !uploadedFile.uri) {
      throw providerError('gemini_uploaded_file_invalid');
    }

    const startedAt = Date.now();
    while (
      String(uploadedFile.state || '').toUpperCase() === 'PROCESSING'
    ) {
      if (Date.now() - startedAt >= processingTimeoutMs) {
        throw providerError('gemini_file_processing_timeout');
      }
      await wait(pollIntervalMs);
      const fileResponse = await fetchImpl(
        GEMINI_BASE_URL + '/v1beta/' + uploadedName,
        { headers: apiHeaders }
      );
      uploadedFile = await readJsonResponse(
        fileResponse,
        'gemini_file_status_failed'
      );
    }
    if (
      uploadedFile.state &&
      String(uploadedFile.state).toUpperCase() !== 'ACTIVE'
    ) {
      throw providerError('gemini_file_processing_failed');
    }

    const interactionResponse = await fetchImpl(
      GEMINI_BASE_URL + '/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          ...apiHeaders,
          'Api-Revision': '2026-05-20',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            {
              type: mediaType,
              uri: uploadedFile.uri,
              mime_type: normalizedMime
            },
            {
              type: 'text',
              text: promptForMediaType(mediaType)
            }
          ]
        })
      }
    );
    const interaction = await readJsonResponse(
      interactionResponse,
      'gemini_interaction_failed'
    );
    if (
      interaction.status &&
      String(interaction.status).toLowerCase() !== 'completed'
    ) {
      throw providerError(
        'gemini_interaction_incomplete',
        'Gemini attachment analysis did not complete.',
        { status: interaction.status }
      );
    }
    const text = responseText(interaction);
    if (!text) throw providerError('gemini_empty_response');

    let billing;
    try {
      billing = quoteAttachmentAnalysisActual({
        model,
        usage: interaction.usage || {},
        env: process.env
      });
    } catch (error) {
      throw providerError(
        'gemini_attachment_cost_unavailable',
        error.message,
        { cause: error.code || error.message }
      );
    }

    return {
      status: 'ready',
      mode: 'gemini_' + mediaType,
      text,
      provider: 'google-gemini',
      model,
      usage: interaction.usage || null,
      billing,
      languagePolicy: 'preserve_source_language_and_script',
      pricingPreflight,
      providerFileDeletion: () => ({
        attempted: deletionAttempted,
        succeeded: deletionSucceeded
      })
    };
  } finally {
    if (uploadedName) {
      deletionAttempted = true;
      try {
        const deleteResponse = await fetchImpl(
          GEMINI_BASE_URL + '/v1beta/' + uploadedName,
          {
            method: 'DELETE',
            headers: apiHeaders
          }
        );
        deletionSucceeded = deleteResponse.ok;
      } catch (_error) {
        deletionSucceeded = false;
      }
    }
  }
}

module.exports = {
  GEMINI_BASE_URL,
  DEFAULT_MODEL,
  MAX_GEMINI_PDF_BYTES,
  MAX_GEMINI_IMAGE_BYTES,
  MAX_GEMINI_AUDIO_BYTES,
  MAX_GEMINI_VIDEO_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  providerError,
  normalizeMimeType,
  mediaTypeForMime,
  maxBytesForMediaType,
  canAnalyzeWithGemini,
  responseText,
  analyzeGeminiAttachment
};