'use strict';

const fs = require('fs');
const uiPath = 'frontend/zuvyr-suite-v1.js';
const testPath = 'backend/test-pack089-89d-product-ui.js';
let ui = fs.readFileSync(uiPath, 'utf8');
let test = fs.readFileSync(testPath, 'utf8');

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const matches = source.match(new RegExp(regex.source, flags)) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return source.replace(regex, replacement);
}
function replaceTextOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0 || source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: anchor missing or not unique`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

ui = replaceRegexOnce(
  ui,
  /if\(active&&item\.integration_key==='google_drive'\)actions\+='<button type="button" data-zs-drive-disconnect="'\+esc\(item\.id\)\+'">Disconnect<\/button>';/,
  `if(active&&item.integration_key==='google_drive')actions+='<button type="button" class="zs-primary" data-zs-drive-browse="'+esc(item.id)+'">Browse files</button><button type="button" data-zs-drive-disconnect="'+esc(item.id)+'">Disconnect</button>';`,
  'active Drive actions'
);

const browseHelpers = `  function driveToolForConnection(connectionId,name){
    return pluginState.tools.find(function(tool){
      return tool&&tool.source==='google_drive'&&tool.connectionId===connectionId&&String(tool.key||'').endsWith(':'+name);
    })||null;
  }
  function renderDriveBrowseResult(data,writeDenied){
    var view=pluginNode(),box=view&&view.querySelector('[data-zs-drive-result]');if(!box)return;
    var payload=data&&data.result&&data.result.result?data.result.result:{};
    var files=Array.isArray(payload.files)?payload.files.slice(0,20):[];
    var rows=files.map(function(file){
      return '<div class="zs-tool-row"><div><strong>'+esc(file.name||'Untitled file')+'</strong><small>'+esc(file.mimeType||'unknown type')+(file.modifiedTime?' · '+esc(pluginDate(file.modifiedTime)):'')+'</small></div><span class="zs-chip">read only</span></div>';
    }).join('');
    box.dataset.visible='true';
    box.innerHTML='<div class="zs-result-title">Google Drive read verified</div><p>Loaded '+files.length+' file'+(files.length===1?'':'s')+' through the owner-scoped Drive tool. Write-scope verification: '+(writeDenied?'blocked as expected':'needs attention')+'.</p>'+(rows||'<div class="zs-muted">No files were returned by this read-only listing.</div>');
  }
  async function prepareDriveBrowse(button){
    var id=button.getAttribute('data-zs-drive-browse');if(!id)return;
    button.disabled=true;
    try{
      var tool=driveToolForConnection(id,'list');
      if(!tool)throw new Error('workspace_drive_list_tool_unavailable');
      var sessionId=pluginSessionId(),input={pageSize:20};
      var prepared=await pluginApi('/api/workspace/tools/invoke/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionId,toolKey:tool.key,input:input})});
      var challengeData=await pluginApi('/api/permissions/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(prepared.permissionRequest)});
      pluginState.pendingPermission={kind:'drive_browse',connectionId:id,name:'Browse Google Drive',sessionId:sessionId,requestId:randomRequestToken(),toolKey:tool.key,input:input,operationFingerprint:prepared.operationFingerprint,permissionRequest:prepared.permissionRequest,challenge:challengeData.challenge};
      renderPluginPermission();
    }catch(error){setPluginResult('[data-zs-drive-result]','Google Drive browse needs attention',error.message);}
    finally{button.disabled=false;}
  }
`;
ui = replaceTextOnce(ui, '  async function preparePluginInstall(button){', browseHelpers + '  async function preparePluginInstall(button){', 'preparePluginInstall insertion');

const permissionRenderer = `  function renderPluginPermission(){
    var view=pluginNode(),box=view&&view.querySelector('[data-zs-plugin-permission-body]'),panel=view&&view.querySelector('[data-zs-plugin-permission]');if(!box)return;
    var pending=pluginState.pendingPermission;
    if(!pending){box.innerHTML='<div class="zs-muted">No permission request is waiting for approval.</div>';return;}
    var ch=pending.challenge||{},req=pending.permissionRequest||{},driveBrowse=pending.kind==='drive_browse';
    var title=driveBrowse?'Google Drive read permission':(pending.name||'Plugin installation');
    var note=driveBrowse?'This permission is owner-scoped and session-bound. It authorizes only the returned read tool; no Drive write scope is granted.':'Permission is bound to this exact connection, session and operation fingerprint. Approving this does not authorize later tool calls.';
    var approve=driveBrowse?'Approve session & browse':'Approve once & install';
    box.innerHTML='<div class="zs-permission-review" role="group" aria-label="'+esc(title)+'"><div><strong>'+esc(title)+'</strong><small>'+esc(ch.consequence||'Review the requested action before allowing it.')+'</small></div><div class="zs-chip-row"><span class="zs-chip danger">'+esc(ch.risk||'high')+' risk</span><span class="zs-chip">'+esc(req.action||'permission')+'</span><span class="zs-chip">expires '+esc(pluginDate(req.expiresAt))+'</span></div><p class="zs-note">'+esc(note)+'</p><div class="zs-actions"><button type="button" class="zs-primary" data-zs-plugin-permission-approve>'+esc(approve)+'</button><button type="button" data-zs-plugin-permission-cancel>Cancel</button></div>';
    if(panel){panel.dataset.pending='true';panel.focus({preventScroll:true});}
  }
`;
ui = replaceRegexOnce(
  ui,
  /  function renderPluginPermission\(\)\{[\s\S]*?\n  \}\n  function renderPluginOAuthMessage\(\)\{/,
  permissionRenderer + '  function renderPluginOAuthMessage(){',
  'permission renderer'
);

const approval = `  async function approvePluginInstall(button){
    var pending=pluginState.pendingPermission;if(!pending)return;
    button.disabled=true;var grantId=null;
    try{
      var grantData=await pluginApi('/api/permissions/grants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},pending.permissionRequest,{explicitConsent:true,confirmationFingerprint:pending.challenge.confirmationFingerprint}))});
      grantId=grantData.grant&&grantData.grant.grant_id||grantData.grant&&grantData.grant.id||null;
      if(pending.kind==='drive_browse'){
        var data=await pluginApi('/api/workspace/tools/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolKey:pending.toolKey,input:pending.input,sessionId:pending.sessionId,requestId:pending.requestId})});
        var writeKey=String(pending.toolKey||'').replace(/:list$/,':write'),writeDenied=false;
        try{
          await pluginApi('/api/workspace/tools/invoke/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:pending.sessionId,toolKey:writeKey,input:{name:'zuvyr-pack089-denied.txt',mimeType:'text/plain',text:'denied-proof'}})});
          throw new Error('workspace_drive_write_unexpectedly_available');
        }catch(writeError){
          if(writeError.code==='workspace_tool_not_found')writeDenied=true;
          else throw writeError;
        }
        pluginState.pendingPermission=null;
        renderDriveBrowseResult(data,writeDenied);
        toast('Google Drive read succeeded; write scope stayed blocked.');
        return;
      }
      await pluginApi('/api/workspace/plugins/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:pending.connectionId,sessionId:pending.sessionId,requestId:pending.requestId,operationFingerprint:pending.operationFingerprint})});
      pluginState.pendingPermission=null;toast('Plugin installed with one explicit scoped permission.');await loadPluginSurface(true);
    }catch(error){
      if(grantId){try{await pluginApi('/api/permissions/grants/'+encodeURIComponent(grantId)+'/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
      toast((pending.kind==='drive_browse'?'Google Drive browse: ':'Plugin install: ')+error.message);
    }finally{button.disabled=false;renderPluginPermission();}
  }
`;
ui = replaceRegexOnce(
  ui,
  /  async function approvePluginInstall\(button\)\{[\s\S]*?\n  \}\n  function cancelPluginPermission\(\)\{/,
  approval + '  function cancelPluginPermission(){',
  'permission approval'
);

const revokeIntegration = `  async function revokeIntegrationConnection(id,button,useDriveDisconnect){
    if(window.confirm&&!window.confirm('Disconnect this integration? Future access will be blocked immediately.'))return;
    button.disabled=true;
    var postRevokeTool=useDriveDisconnect?driveToolForConnection(id,'list'):null,postRevokeDenied=null;
    try{
      var path=useDriveDisconnect?'/api/workspace/drive/'+encodeURIComponent(id)+'/disconnect':'/api/workspace/connections/integrations/'+encodeURIComponent(id)+'/revoke';
      await pluginApi(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(postRevokeTool){
        try{
          await pluginApi('/api/workspace/tools/invoke/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:pluginSessionId(),toolKey:postRevokeTool.key,input:{pageSize:1}})});
          postRevokeDenied=false;
        }catch(postError){
          if(postError.code==='workspace_tool_not_found')postRevokeDenied=true;
          else throw postError;
        }
      }
      pluginState.oauthMessage=useDriveDisconnect?{title:postRevokeDenied===false?'Google Drive disconnected; verification needs attention':'Google Drive disconnected',message:postRevokeDenied===true?'Post-revoke tool access is blocked as expected. Credentials remain server-side and the local connection is revoked.':'The connection was revoked. Refresh the surface before reconnecting.'}:null;
      toast(postRevokeDenied===false?'Integration disconnected, but post-revoke verification needs attention.':'Integration disconnected.');await loadPluginSurface(true);
    }catch(error){toast('Disconnect: '+error.message);}
    finally{button.disabled=false;}
  }
`;
ui = replaceRegexOnce(
  ui,
  /  async function revokeIntegrationConnection\(id,button,useDriveDisconnect\)\{[\s\S]*?\n  \}\n  async function createSkill\(form\)\{/,
  revokeIntegration + '  async function createSkill(form){',
  'integration revoke verification'
);

ui = replaceTextOnce(
  ui,
  "    var driveDisconnect=e.target.closest('[data-zs-drive-disconnect]');if(driveDisconnect&&suite.contains(driveDisconnect)){revokeIntegrationConnection(driveDisconnect.getAttribute('data-zs-drive-disconnect'),driveDisconnect,true);return;}",
  "    var driveBrowse=e.target.closest('[data-zs-drive-browse]');if(driveBrowse&&suite.contains(driveBrowse)){prepareDriveBrowse(driveBrowse);return;}\n    var driveDisconnect=e.target.closest('[data-zs-drive-disconnect]');if(driveDisconnect&&suite.contains(driveDisconnect)){revokeIntegrationConnection(driveDisconnect.getAttribute('data-zs-drive-disconnect'),driveDisconnect,true);return;}",
  'Drive click handler'
);

test = replaceTextOnce(
  test,
  "  'data-zs-drive-disconnect',\n  'data-zs-plugin-revoke',",
  "  'data-zs-drive-disconnect',\n  'data-zs-drive-browse',\n  '/api/workspace/tools/invoke/challenge',\n  '/api/workspace/tools/invoke',\n  \"kind:'drive_browse'\",\n  'workspace_drive_write_unexpectedly_available',\n  'postRevokeDenied',\n  'data-zs-plugin-revoke',",
  '89D marker list'
);
test = replaceTextOnce(
  test,
  "assert(ui.includes('pluginState.oauthCallbackInFlight'));",
  "assert(ui.includes('pluginState.oauthCallbackInFlight'));\nassert(ui.includes(\"input={pageSize:20}\"), 'Drive browse must use a bounded read-only listing');\nassert(ui.includes(\"tool.source==='google_drive'&&tool.connectionId===connectionId\"), 'Drive browse must resolve the live owner tool instead of inventing a connection');\nassert(ui.includes(\"replace(/:list$/,':write')\"), 'denied write proof must be derived from the live list tool key');\nassert(ui.indexOf(\"'/api/workspace/tools/invoke/challenge'\") < ui.indexOf(\"'/api/workspace/tools/invoke'\"), 'Drive challenge must precede real invocation');",
  '89D acceptance assertions'
);

fs.writeFileSync(uiPath, ui);
fs.writeFileSync(testPath, test);
console.log('PASS: scoped PACK089 Drive acceptance UI patch applied');
