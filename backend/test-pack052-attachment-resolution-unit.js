'use strict';
const assert=require('assert');
const {buildConversationAttachmentContext}=require('./lib/conversationAttachmentContext');

const CONVERSATION_ID='11111111-1111-4111-8111-111111111111';
const CANONICAL_ID='22222222-2222-4222-8222-222222222222';
const LEGACY_ID='33333333-3333-4333-8333-333333333333';

async function run(){
  let resolutionCalls=0;
  const store={
    async resolveAttachmentAssets(input){
      resolutionCalls+=1;
      assert.deepStrictEqual(input.attachmentIds,[CANONICAL_ID]);
      return [{
        id:LEGACY_ID,
        requested_attachment_id:CANONICAL_ID,
        attachment_id:CANONICAL_ID,
        legacy_asset_id:LEGACY_ID,
        canonical_asset_id:CANONICAL_ID,
        canonical_content_id:'44444444-4444-4444-8444-444444444444',
        conversation_id:'99999999-9999-4999-8999-999999999999',
        asset_type:'file',
        mime_type:'text/plain',
        original_name:'library-notes.txt',
        file_size_bytes:18,
        scan_status:'clean',
        extraction_status:'ready',
        metadata:{extracted_text:'Reusable canonical facts.'}
      }];
    },
    async listAssets(){throw new Error('legacy listAssets path must not be used when resolver exists');}
  };
  const storage={from(){throw new Error('text attachment does not require storage download');}};
  const context=await buildConversationAttachmentContext({
    conversationId:CONVERSATION_ID,
    ownerId:'owner-1',
    attachmentIds:[CANONICAL_ID],
    store,
    storage
  });
  assert.strictEqual(resolutionCalls,1);
  assert.deepStrictEqual(context.attachmentIds,[CANONICAL_ID]);
  assert.strictEqual(context.sources[0].id,CANONICAL_ID);
  assert.strictEqual(context.sources[0].legacyId,LEGACY_ID);
  assert.ok(context.systemContext.includes('Reusable canonical facts.'));
  console.log('PASS: Pack052 canonical attachment id resolves through owner-scoped bridge and remains stable in context/sources');
}
run().catch(error=>{console.error(error);process.exit(1);});
