'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const JSZip = require('jszip');
const releaseConfig = require('../config/code-release.v1.json');
const { safePath, canonicalFiles } = require('./codeProjectSandboxArchive');

const FIXED_DATE = new Date(releaseConfig.zip.fixedTimestamp);

function releaseError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value), null, 2) + '\n';
}

function safeAssetLeaf(asset) {
  const metadata =
    asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
      ? asset.metadata
      : {};
  const candidates = [
    metadata.originalName,
    metadata.original_name,
    metadata.filename,
    path.posix.basename(String(asset?.storage_path || ''))
  ];
  let leaf = candidates
    .map(value => String(value || '').trim())
    .find(Boolean) || (String(asset?.id || 'asset') + '.bin');

  leaf = leaf.replace(/[\\/\0]/g, '_').replace(/^\.+/, '').slice(0, 160);
  if (!leaf || /^\.env(?:\.|$)/i.test(leaf) || /^(?:id_rsa|id_ed25519|credentials)$/i.test(leaf)) {
    leaf = String(asset?.id || 'asset') + '.bin';
  }
  return leaf;
}

function assetArchivePath(asset) {
  const id = String(asset?.id || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id)) {
    throw releaseError('pack079_asset_id_invalid');
  }
  return safePath(
    releaseConfig.zip.assetRoot + '/' + id + '/' + safeAssetLeaf(asset)
  );
}

function parseAssetReferences(files) {
  const refs = [];
  for (const file of files) {
    if (!String(file.path || '').startsWith('.zuvyr/assets/')) continue;
    let parsed;
    try {
      parsed = JSON.parse(String(file.content || ''));
    } catch (_) {
      throw releaseError('pack079_asset_reference_invalid');
    }
    if (parsed?.schema_version !== 'pack049.code-asset-reference.v1') {
      throw releaseError('pack079_asset_reference_schema_invalid');
    }
    const contentId = String(parsed.canonical_content_id || '');
    const versionId = String(parsed.canonical_version_id || '');
    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(contentId) ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(versionId) ||
      !Array.isArray(parsed.asset_ids)
    ) {
      throw releaseError('pack079_asset_reference_invalid');
    }
    refs.push(Object.freeze({
      referencePath: file.path,
      canonicalContentId: contentId,
      canonicalVersionId: versionId,
      assetIds: Object.freeze(
        [...new Set(parsed.asset_ids.map(id => String(id || '').toLowerCase()))]
      )
    }));
  }
  return Object.freeze(refs);
}

function projectFromVersion(version) {
  const snapshot = version?.snapshot;
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    !Array.isArray(snapshot.files) ||
    snapshot.files.length < 1
  ) {
    throw releaseError('pack079_project_version_not_release_snapshot');
  }
  const project = {
    name: String(snapshot.name || 'ZUVYR Code Project'),
    entryFile: snapshot.entryFile || null,
    files: snapshot.files.map(file => ({
      path: file?.path,
      content: file?.content,
      language: file?.language || null,
      sha256: file?.sha256 || null
    }))
  };
  canonicalFiles(project);
  return Object.freeze(project);
}

function projectFilesDigest(project) {
  const files = canonicalFiles(project);
  const digest = crypto.createHash('sha256');
  for (const file of files) {
    digest.update(file.path, 'utf8');
    digest.update(Buffer.from([0]));
    digest.update(file.content);
    digest.update(Buffer.from([0]));
  }
  return digest.digest('hex');
}

async function resolveAssets({ db, ownerId, project } = {}) {
  const refs = parseAssetReferences(project.files);
  const requested = [...new Set(refs.flatMap(ref => ref.assetIds))];
  if (requested.length > releaseConfig.zip.maxAssets) {
    throw releaseError('pack079_asset_count_too_large');
  }
  if (!requested.length) {
    return Object.freeze({ refs, assets: Object.freeze([]) });
  }

  const result = await db
    .from('zuvyr_assets')
    .select('id,owner_id,canonical_content_id,canonical_version_id,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,status,metadata,deleted_at')
    .eq('owner_id', ownerId)
    .in('id', requested)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (result.error) throw releaseError('pack079_asset_lookup_failed', result.error);

  const rows = result.data || [];
  const byId = new Map(rows.map(row => [String(row.id).toLowerCase(), row]));
  for (const id of requested) {
    if (!byId.has(id)) throw releaseError('pack079_asset_not_found');
  }

  for (const ref of refs) {
    for (const id of ref.assetIds) {
      const row = byId.get(id);
      if (
        String(row.canonical_content_id) !== ref.canonicalContentId ||
        String(row.canonical_version_id) !== ref.canonicalVersionId
      ) {
        throw releaseError('pack079_asset_lineage_mismatch');
      }
    }
  }

  return Object.freeze({
    refs,
    assets: Object.freeze(
      rows.slice().sort((a,b) => String(a.id).localeCompare(String(b.id)))
    )
  });
}

async function assetBytes(db, asset) {
  const size = Number(asset.file_size_bytes);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw releaseError('pack079_asset_size_invalid');
  }
  const downloaded = await db.storage
    .from(asset.storage_bucket)
    .download(asset.storage_path);
  if (downloaded.error || !downloaded.data) {
    throw releaseError('pack079_asset_download_failed', downloaded.error);
  }
  let buffer;
  if (Buffer.isBuffer(downloaded.data)) {
    buffer = downloaded.data;
  } else if (typeof downloaded.data.arrayBuffer === 'function') {
    buffer = Buffer.from(await downloaded.data.arrayBuffer());
  } else {
    throw releaseError('pack079_asset_download_invalid');
  }
  if (buffer.length !== size) throw releaseError('pack079_asset_size_mismatch');
  if (sha256(buffer) !== String(asset.sha256 || '').toLowerCase()) {
    throw releaseError('pack079_asset_hash_mismatch');
  }
  return buffer;
}

async function buildReleaseZip({
  db,
  ownerId,
  projectId,
  version,
  validation
} = {}) {
  if (!db?.storage) throw releaseError('pack079_storage_unavailable');
  const project = projectFromVersion(version);
  const files = canonicalFiles(project);
  if (files.length > releaseConfig.zip.maxCodeFiles) {
    throw releaseError('pack079_code_file_count_too_large');
  }
  const digest = projectFilesDigest(project);
  if (digest !== String(validation?.files_digest || '')) {
    throw releaseError('pack079_validation_files_digest_mismatch');
  }

  const codeBytes = files.reduce((sum,file) => sum + file.content.length, 0);
  if (codeBytes > releaseConfig.zip.maxCodeBytes) {
    throw releaseError('pack079_code_bytes_too_large');
  }

  const { refs, assets } = await resolveAssets({ db, ownerId, project });
  let totalAssetBytes = 0;
  const materialized = [];
  for (const asset of assets) {
    const bytes = await assetBytes(db, asset);
    totalAssetBytes += bytes.length;
    if (totalAssetBytes > releaseConfig.zip.maxAssetBytes) {
      throw releaseError('pack079_asset_bytes_too_large');
    }
    materialized.push(Object.freeze({
      asset,
      bytes,
      archivePath: assetArchivePath(asset)
    }));
  }

  const codeManifest = files.map(file => Object.freeze({
    path:file.path,
    bytes:file.content.length,
    sha256:sha256(file.content)
  }));
  const assetManifest = materialized.map(item => Object.freeze({
    assetId:item.asset.id,
    canonicalContentId:item.asset.canonical_content_id,
    canonicalVersionId:item.asset.canonical_version_id,
    path:item.archivePath,
    bytes:item.bytes.length,
    sha256:String(item.asset.sha256).toLowerCase(),
    mimeType:item.asset.mime_type
  }));

  const manifest = Object.freeze({
    schemaVersion:'pack079.zuvyr-release-manifest.v1',
    projectId:String(projectId),
    projectVersionId:String(version.id),
    snapshotSha256:String(validation.snapshot_sha256),
    filesDigest:digest,
    entryFile:project.entryFile,
    codeFiles:Object.freeze(codeManifest),
    assetReferences:refs,
    assets:Object.freeze(assetManifest)
  });
  const manifestBytes = Buffer.from(stableJson(manifest),'utf8');
  const manifestSha256 = sha256(manifestBytes);

  const zip = new JSZip();
  const fileOptions = {
    date:FIXED_DATE,
    unixPermissions:'0644',
    createFolders:false,
    compression:releaseConfig.zip.compression,
    compressionOptions:{ level:releaseConfig.zip.compressionLevel }
  };

  for (const file of files) zip.file(file.path,file.content,fileOptions);
  for (const item of materialized) zip.file(item.archivePath,item.bytes,fileOptions);
  zip.file(releaseConfig.zip.manifestPath,manifestBytes,fileOptions);

  const archive = await zip.generateAsync({
    type:'nodebuffer',
    platform:'UNIX',
    compression:releaseConfig.zip.compression,
    compressionOptions:{ level:releaseConfig.zip.compressionLevel },
    streamFiles:false
  });
  if (archive.length > releaseConfig.zip.maxArchiveBytes) {
    throw releaseError('pack079_archive_too_large');
  }

  const reopened = await JSZip.loadAsync(archive,{ checkCRC32:true });
  const expected = new Map();
  for (const file of files) expected.set(file.path,Buffer.from(file.content));
  for (const item of materialized) expected.set(item.archivePath,item.bytes);
  expected.set(releaseConfig.zip.manifestPath,manifestBytes);

  const reopenedNames = Object.keys(reopened.files)
    .filter(name => !reopened.files[name].dir)
    .sort();
  if (reopenedNames.length !== expected.size) {
    throw releaseError('pack079_zip_reopen_file_count_mismatch');
  }
  for (const [name,bytes] of expected.entries()) {
    const entry = reopened.file(name);
    if (!entry) throw releaseError('pack079_zip_reopen_entry_missing');
    const actual = await entry.async('nodebuffer');
    if (actual.length !== bytes.length || sha256(actual) !== sha256(bytes)) {
      throw releaseError('pack079_zip_reopen_hash_mismatch');
    }
  }

  const archiveSha256 = sha256(archive);
  return Object.freeze({
    archive,
    archiveSha256,
    manifest,
    manifestSha256,
    fileCount:files.length,
    assetCount:materialized.length,
    archiveBytes:archive.length,
    verifiedReopen:true,
    filename:
      String(project.name || 'zuvyr-project')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g,'-')
        .replace(/^-+|-+$/g,'')
        .slice(0,80) + '-' + String(version.id).slice(0,8) + '.zip'
  });
}

async function verifyReleaseZip(archive, receipt) {
  const hash = sha256(archive);
  if (hash !== String(receipt?.archive_sha256 || receipt?.archiveSha256 || '')) {
    throw releaseError('pack079_archive_receipt_hash_mismatch');
  }
  const reopened = await JSZip.loadAsync(archive,{ checkCRC32:true });
  const manifestEntry = reopened.file(releaseConfig.zip.manifestPath);
  if (!manifestEntry) throw releaseError('pack079_release_manifest_missing');
  const manifestBytes = await manifestEntry.async('nodebuffer');
  const manifestHash = sha256(manifestBytes);
  if (manifestHash !== String(receipt?.manifest_sha256 || receipt?.manifestSha256 || '')) {
    throw releaseError('pack079_manifest_receipt_hash_mismatch');
  }
  return Object.freeze({ archiveSha256:hash, manifestSha256:manifestHash, verified:true });
}

module.exports={
  releaseError,
  sha256,
  stable,
  stableJson,
  safeAssetLeaf,
  assetArchivePath,
  parseAssetReferences,
  projectFromVersion,
  projectFilesDigest,
  resolveAssets,
  buildReleaseZip,
  verifyReleaseZip
};
