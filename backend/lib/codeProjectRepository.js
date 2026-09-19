'use strict';

const { normalizeCodeProject } = require('./codeProjectContract');

function repositoryError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack075_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function editorState(row) {
  if (!row) {
    return Object.freeze({
      openFiles: [],
      activeFile: null,
      dividerBasisPoints: 6000,
      previewVisible: true,
      mobilePane: 'code',
      logsVisible: false
    });
  }
  return Object.freeze({
    openFiles: Array.isArray(row.open_files) ? row.open_files : [],
    activeFile: row.active_file || null,
    dividerBasisPoints: Number(row.divider_basis_points || 6000),
    previewVisible: row.preview_visible !== false,
    mobilePane: row.mobile_pane === 'preview' ? 'preview' : 'code',
    logsVisible: row.logs_visible === true
  });
}

function publicProject(row) {
  return Object.freeze({
    id: row.id,
    name: row.name,
    entryFile: row.entry_file || null,
    status: row.status,
    currentBranch: row.current_branch || 'main',
    revision: Number(row.revision || 0),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function publicFile(row) {
  return Object.freeze({
    id: row.id,
    path: row.path,
    content: row.content,
    sha256: row.content_sha256,
    language: row.language || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function createCodeProjectRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw repositoryError('code_project_repository_unavailable');
  }

  async function requireProject(ownerId, projectId, { activeOnly = true } = {}) {
    let query = client
      .from('code_projects')
      .select('id,owner_id,name,entry_file,status,metadata,current_branch,revision,created_at,updated_at')
      .eq('id', projectId)
      .eq('owner_id', ownerId);
    if (activeOnly) query = query.eq('status', 'active');
    const result = await query.maybeSingle();
    if (result.error) throw repositoryError('code_project_lookup_failed', result.error);
    if (!result.data) throw repositoryError('code_project_not_found');
    return result.data;
  }

  async function list({ ownerId, limit = 50 } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
    const result = await client
      .from('code_projects')
      .select('id,owner_id,name,entry_file,status,metadata,current_branch,revision,created_at,updated_at')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(safeLimit);
    if (result.error) throw repositoryError('code_project_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicProject));
  }

  async function get({ ownerId, projectId } = {}) {
    const projectRow = await requireProject(ownerId, projectId);

    const [filesResult, versionsResult, branchesResult, stateResult, bindingsResult] =
      await Promise.all([
        client
          .from('code_project_files')
          .select('id,path,content,content_sha256,language,created_at,updated_at')
          .eq('project_id', projectId)
          .order('path', { ascending: true }),
        client
          .from('code_project_versions')
          .select('id,branch_name,reason,created_at,canonical_content_id')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(50),
        client
          .from('code_project_branches')
          .select('id,name,head_version_id,created_at,updated_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        client
          .from('code_project_editor_state')
          .select('open_files,active_file,divider_basis_points,preview_visible,mobile_pane,logs_visible,updated_at')
          .eq('project_id', projectId)
          .eq('owner_id', ownerId)
          .maybeSingle(),
        client
          .from('zuvyr_code_asset_bindings')
          .select('id,source_content_id,source_version_id,asset_ids,code_file_id,path,status,created_at')
          .eq('owner_id', ownerId)
          .eq('code_project_id', projectId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(100)
      ]);

    for (const [code, result] of [
      ['code_project_files_lookup_failed', filesResult],
      ['code_project_versions_lookup_failed', versionsResult],
      ['code_project_branches_lookup_failed', branchesResult],
      ['code_project_editor_state_lookup_failed', stateResult],
      ['code_project_asset_bindings_lookup_failed', bindingsResult]
    ]) {
      if (result.error) throw repositoryError(code, result.error);
    }

    return Object.freeze({
      ...publicProject(projectRow),
      files: Object.freeze((filesResult.data || []).map(publicFile)),
      versions: Object.freeze((versionsResult.data || []).map(row => Object.freeze({
        id: row.id,
        branch: row.branch_name || 'main',
        reason: row.reason || null,
        canonicalContentId: row.canonical_content_id || null,
        createdAt: row.created_at
      }))),
      branches: Object.freeze((branchesResult.data || []).map(row => Object.freeze({
        id: row.id,
        name: row.name,
        headVersionId: row.head_version_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))),
      editorState: editorState(stateResult.data),
      assetBindings: Object.freeze((bindingsResult.data || []).map(row => Object.freeze({
        id: row.id,
        sourceContentId: row.source_content_id,
        sourceVersionId: row.source_version_id,
        assetIds: Array.isArray(row.asset_ids) ? row.asset_ids : [],
        codeFileId: row.code_file_id,
        path: row.path,
        createdAt: row.created_at
      })))
    });
  }

  async function create({ ownerId, project, metadata = {} } = {}) {
    const normalized = normalizeCodeProject(project);
    const result = await client.rpc('create_zuvyr_code_project_pack075', {
      p_owner_id: ownerId,
      p_name: normalized.name,
      p_entry_file: normalized.entryFile,
      p_files: normalized.files.map(file => ({
        path: file.path,
        content: file.content,
        sha256: file.sha256,
        language: file.language
      })),
      p_metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {}
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_project_create_failed'), result.error);
    }
    return get({ ownerId, projectId: result.data.project_id });
  }

  async function save({
    ownerId,
    projectId,
    project,
    expectedRevision,
    branchName = null,
    reason = 'manual_save'
  } = {}) {
    const normalized = normalizeCodeProject(project);
    const result = await client.rpc('save_zuvyr_code_project_pack075', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_expected_revision:
        Number.isSafeInteger(Number(expectedRevision))
          ? Number(expectedRevision)
          : null,
      p_name: normalized.name,
      p_entry_file: normalized.entryFile,
      p_files: normalized.files.map(file => ({
        path: file.path,
        content: file.content,
        sha256: file.sha256,
        language: file.language
      })),
      p_branch_name: branchName,
      p_reason: String(reason || 'manual_save').slice(0, 200)
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_project_save_failed'), result.error);
    }
    return get({ ownerId, projectId });
  }

  async function createBranch({ ownerId, projectId, name } = {}) {
    const result = await client.rpc('create_zuvyr_code_branch_pack075', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_name: String(name || '').trim()
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_project_branch_create_failed'), result.error);
    }
    return get({ ownerId, projectId });
  }

  async function switchBranch({
    ownerId,
    projectId,
    name,
    expectedRevision = null
  } = {}) {
    const result = await client.rpc('switch_zuvyr_code_branch_pack075', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_name: String(name || '').trim(),
      p_expected_revision:
        Number.isSafeInteger(Number(expectedRevision))
          ? Number(expectedRevision)
          : null
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_project_branch_switch_failed'), result.error);
    }
    return get({ ownerId, projectId });
  }

  async function saveEditorState({
    ownerId,
    projectId,
    openFiles = [],
    activeFile = null,
    dividerBasisPoints = 6000,
    previewVisible = true,
    mobilePane = 'code',
    logsVisible = false
  } = {}) {
    const project = await requireProject(ownerId, projectId);
    const fileResult = await client
      .from('code_project_files')
      .select('path')
      .eq('project_id', projectId);
    if (fileResult.error) {
      throw repositoryError('code_project_files_lookup_failed', fileResult.error);
    }
    const paths = new Set((fileResult.data || []).map(row => String(row.path)));
    const normalizedOpen = [...new Set(
      (Array.isArray(openFiles) ? openFiles : [])
        .map(value => String(value || '').trim())
        .filter(value => paths.has(value))
    )].slice(0, 20);
    const normalizedActive =
      activeFile && paths.has(String(activeFile)) ? String(activeFile) : null;
    if (normalizedActive && !normalizedOpen.includes(normalizedActive)) {
      normalizedOpen.push(normalizedActive);
    }

    const row = {
      project_id: project.id,
      owner_id: ownerId,
      open_files: normalizedOpen,
      active_file: normalizedActive,
      divider_basis_points: Math.max(2500, Math.min(8000, Number(dividerBasisPoints) || 6000)),
      preview_visible: previewVisible !== false,
      mobile_pane: mobilePane === 'preview' ? 'preview' : 'code',
      logs_visible: logsVisible === true,
      updated_at: new Date().toISOString()
    };
    const result = await client
      .from('code_project_editor_state')
      .upsert(row, { onConflict: 'project_id' })
      .select('open_files,active_file,divider_basis_points,preview_visible,mobile_pane,logs_visible,updated_at')
      .single();
    if (result.error) {
      throw repositoryError('code_project_editor_state_save_failed', result.error);
    }
    return editorState(result.data);
  }

  async function archive({ ownerId, projectId } = {}) {
    await requireProject(ownerId, projectId);
    const result = await client
      .from('code_projects')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();
    if (result.error) throw repositoryError('code_project_archive_failed', result.error);
    if (!result.data) throw repositoryError('code_project_not_found');
    return Object.freeze({ archived: true, projectId });
  }

  function publicAiEdit(row) {
    if (!row) return null;
    return Object.freeze({
      id: row.id,
      projectId: row.project_id,
      requestId: row.request_id,
      instructionSha256: row.instruction_sha256,
      targetPaths: Array.isArray(row.target_paths) ? row.target_paths : [],
      status: row.status,
      model: row.model || null,
      creditsCharged:
        Number.isSafeInteger(Number(row.credits_charged))
          ? Number(row.credits_charged)
          : null,
      result: row.result && typeof row.result === 'object' ? row.result : {},
      errorCode: row.error_code || null,
      createdAt: row.created_at,
      completedAt: row.completed_at || null
    });
  }

  async function aiEditReceipt({ ownerId, requestId } = {}) {
    const result = await client
      .from('code_project_ai_edits')
      .select('id,owner_id,project_id,request_id,instruction_sha256,target_paths,status,model,credits_charged,result,error_code,created_at,completed_at')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (result.error) {
      throw repositoryError('code_ai_edit_receipt_lookup_failed', result.error);
    }
    return publicAiEdit(result.data);
  }

  async function beginAiEdit({
    ownerId,
    projectId,
    requestId,
    instructionSha256,
    targetPaths
  } = {}) {
    await requireProject(ownerId, projectId);
    const normalizedTargets = [...new Set(
      (Array.isArray(targetPaths) ? targetPaths : [])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )];
    const existing = await aiEditReceipt({ ownerId, requestId });
    if (existing) {
      const sameTargets =
        JSON.stringify(existing.targetPaths) === JSON.stringify(normalizedTargets);
      if (
        existing.projectId !== projectId ||
        existing.instructionSha256 !== instructionSha256 ||
        !sameTargets
      ) {
        throw repositoryError('code_ai_edit_idempotency_scope_mismatch');
      }
      return Object.freeze({ replayed: true, receipt: existing });
    }

    const inserted = await client
      .from('code_project_ai_edits')
      .insert({
        owner_id: ownerId,
        project_id: projectId,
        request_id: requestId,
        instruction_sha256: instructionSha256,
        target_paths: normalizedTargets,
        status: 'processing',
        result: {}
      })
      .select('id,owner_id,project_id,request_id,instruction_sha256,target_paths,status,model,credits_charged,result,error_code,created_at,completed_at')
      .single();

    if (inserted.error) {
      if (String(inserted.error.code || '') === '23505') {
        const raced = await aiEditReceipt({ ownerId, requestId });
        if (
          raced &&
          raced.projectId === projectId &&
          raced.instructionSha256 === instructionSha256 &&
          JSON.stringify(raced.targetPaths) === JSON.stringify(normalizedTargets)
        ) {
          return Object.freeze({ replayed: true, receipt: raced });
        }
        throw repositoryError('code_ai_edit_idempotency_scope_mismatch', inserted.error);
      }
      throw repositoryError('code_ai_edit_receipt_create_failed', inserted.error);
    }

    return Object.freeze({ replayed: false, receipt: publicAiEdit(inserted.data) });
  }

  async function completeAiEdit({
    ownerId,
    requestId,
    model,
    creditsCharged,
    result
  } = {}) {
    const updated = await client
      .from('code_project_ai_edits')
      .update({
        status: 'succeeded',
        model: String(model || '').slice(0, 200) || null,
        credits_charged: Number(creditsCharged),
        result: result && typeof result === 'object' && !Array.isArray(result)
          ? result
          : {},
        error_code: null,
        completed_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .eq('status', 'processing')
      .select('id,owner_id,project_id,request_id,instruction_sha256,target_paths,status,model,credits_charged,result,error_code,created_at,completed_at')
      .maybeSingle();
    if (updated.error) {
      throw repositoryError('code_ai_edit_receipt_complete_failed', updated.error);
    }
    if (!updated.data) {
      const existing = await aiEditReceipt({ ownerId, requestId });
      if (existing?.status === 'succeeded') return existing;
      throw repositoryError('code_ai_edit_receipt_state_conflict');
    }
    return publicAiEdit(updated.data);
  }

  async function failAiEdit({
    ownerId,
    requestId,
    errorCode,
    result = {}
  } = {}) {
    const updated = await client
      .from('code_project_ai_edits')
      .update({
        status: 'failed',
        error_code: String(errorCode || 'code_ai_edit_failed').slice(0, 200),
        result: result && typeof result === 'object' && !Array.isArray(result)
          ? result
          : {},
        completed_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .eq('status', 'processing')
      .select('id,owner_id,project_id,request_id,instruction_sha256,target_paths,status,model,credits_charged,result,error_code,created_at,completed_at')
      .maybeSingle();
    if (updated.error) {
      throw repositoryError('code_ai_edit_receipt_fail_failed', updated.error);
    }
    return publicAiEdit(updated.data) || aiEditReceipt({ ownerId, requestId });
  }

  return Object.freeze({
    list,
    get,
    create,
    save,
    createBranch,
    switchBranch,
    saveEditorState,
    archive,
    aiEditReceipt,
    beginAiEdit,
    completeAiEdit,
    failAiEdit
  });
}

module.exports = {
  createCodeProjectRepository,
  publicProject,
  publicFile,
  editorState
};
