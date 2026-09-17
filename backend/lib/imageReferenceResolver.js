'use strict';
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { assertOwnedStoragePath, CONFIG } = require('./assetStorageContract');
const { capabilityError } = require('./imageCapabilityGate');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME=new Set(['image/png','image/jpeg','image/webp']);
function createImageReferenceResolver({db,storage}) {
 const kernel=createAssetStorageKernel({client:db,storage});
 return async function resolve({ownerId,request,requestId}) {
   if(!UUID.test(ownerId || '')) throw capabilityError('invalid_image_reference_owner');
   const ordered=[...(request.referenceAssetIds || [])];
   const ids=[...new Set([...ordered,request.sourceAssetId,request.maskAssetId].filter(Boolean))];
   if(ids.length>6 || ids.some(id=>!UUID.test(id))) throw capabilityError('invalid_image_reference_assets');
   const assets=new Map();
   // Validate every asset and parent before issuing any URL or recording egress.
   for(const id of ids) {
     const asset=await kernel.resolveOwned({ownerId,assetId:id});
     if(!asset || asset.assetId!==id || asset.status!=='active') throw capabilityError('image_reference_not_found');
     assertOwnedStoragePath({ownerId,storagePath:asset.storagePath});
     if(asset.storageBucket!==CONFIG.bucket || !MIME.has(asset.mimeType) ||
       !Number.isSafeInteger(Number(asset.fileSizeBytes)) || Number(asset.fileSizeBytes)<1 || Number(asset.fileSizeBytes)>25*1024*1024)
       throw capabilityError('image_reference_format_unsupported');
     const content=await db.from('zuvyr_content_objects').select('id')
       .eq('id',asset.contentId).eq('owner_id',ownerId).eq('status','active').maybeSingle();
     if(content.error) throw Object.assign(new Error('image_reference_lookup_failed'),{retryable:true});
     if(!content.data) throw capabilityError('image_reference_not_found');
     assets.set(id,asset);
   }
   const resolved=new Map();
   for(const id of ids) {
     const signed=await kernel.createSignedDownload({ownerId,assetId:id,requestId,expiresIn:300});
     const asset=assets.get(id);
     // URLs are ephemeral executor inputs, never persisted as lineage or learning content.
     resolved.set(id,Object.freeze({assetId:id,contentId:asset.contentId,versionId:asset.versionId,
       mimeType:asset.mimeType,sha256:asset.sha256,url:signed.signedUrl}));
   }
   return Object.freeze({references:Object.freeze(ordered.map(id=>resolved.get(id))),
     source:resolved.get(request.sourceAssetId)||null,mask:resolved.get(request.maskAssetId)||null});
 };
}
module.exports={createImageReferenceResolver};
