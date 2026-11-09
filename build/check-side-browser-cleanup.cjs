// Execute the production deletion/pruning handlers against real native browser tabs.
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
require('tsx/cjs');
const {ConversationAccess}=require('../src/main/conversation-access.ts');
module.exports=async function checkCleanup(controller,views,front,background,url){
 const source=readFileSync('src/main/index.ts','utf8');
 const take=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const code=take('function closeSideBrowserView(', '/** Release all native')
  +take('async function releaseConversationTab(', 'function ensureBrowserView(')
  +take('async function pruneSideChatRecents(', 'function ensurePane(')
  +take('  ipcMain.handle("threads:delete",', '\n\n  createWindow();');
 const records=new Map([['side:test',{paneId:'side:test',threadId:'deleted-child'}]]),handlers=new Map(),released=[],cancelled=[],invalidated=[],metadataRemoved=[];let recapInvalidations=0;
 const conversationAccess=new ConversationAccess({defaultMode:'ask',threads:{'deleted-parent':'auto',unrelated:'full'}}),savedAccess=[];
 const context={console,conversationMetadata:{remove:id=>metadataRemoved.push(id)},homeRecaps:{invalidate:()=>recapInvalidations++},serverTools:{cancel:id=>cancelled.push(id)},serverToolSessions:{invalidate:id=>invalidated.push(id)},sideBrowser:controller,browserViews:views,browserVisibility:new Map(),browserViewBounds:new Map(),win:front,backgroundBrowserHost:background,
  conversationAccess,saveConversationAccess:()=>savedAccess.push(conversationAccess.snapshot()),
  ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},engine:{request:async()=>({})},browserRuntime:{request:async(_method,{sessionId})=>{released.push(sessionId)}},
  sideChatRecents:{recordsForParent:()=>[...records.values()],expired:()=>[...records.keys()],get:id=>records.get(id),remove:id=>records.delete(id)},
  cancelTurnContinuation:()=>{},dropSidePane:()=>{},forgetBrowserCaptures:()=>{},saveSideChatRecents:()=>{},saveThreadMcp:()=>{},sideChatTranscriptFile:id=>id,transcriptFile:id=>id,rmSync:()=>{},
  petFinished:()=>{},settleLocalApprovals:()=>{},settleLocalUserInputs:()=>{},resetSidePanes:()=>{},panes:{main:{threadId:'unrelated'}},
 };
 for(const key of ['threadMcp','runningTurns','subAgents','subAgentMail','heldApprovals','bgStream','mcpApplyPending','heldErrors','multiMountLeases'])context[key]=new Map();
 context.browserNetGrants=new Set();context.browserConnectGrants=new Set();
 runInNewContext(transformSync(code,{loader:'ts'}).code,context);
 const parent=await controller.open('deleted-parent',url),child=await controller.open('deleted-child',url),other=await controller.open('unrelated',url);
 await handlers.get('threads:delete')({},'deleted-parent');
 assert.equal(savedAccess.length,1,'deleting a conversation persists its permission cleanup');
 assert.deepEqual(savedAccess[0],{defaultMode:'ask',threads:{unrelated:'full'}},'cleanup removes only the deleted conversation permissions and preserves the new-chat default');
 assert.deepEqual(conversationAccess.snapshot(),savedAccess[0]);
 assert.equal(views.has(parent.id),false,'deleting a parent destroys its native tab');
 assert.equal(views.has(child.id),false,'deleting a parent also destroys its side-chat native tab');
 assert.equal(controller.list('deleted-child').length,0,'deleted child consumes no browser slot');
 assert.equal(controller.list('unrelated').length,1,'deleting one chat preserves another browser');
 assert.ok(released.includes('deleted-child'));
 assert.ok(cancelled.includes('deleted-parent'));assert.ok(invalidated.includes('deleted-parent'));
 assert.equal(cancelled.includes('unrelated'),false);
 assert.deepEqual(metadataRemoved,['deleted-parent'],'deleting a conversation removes its metadata without removing unrelated records');
 assert.equal(recapInvalidations,1,'deleting a conversation invalidates cached recaps');
 records.set('side:expired',{paneId:'side:expired',threadId:'expired-child'});
 const expired=await controller.open('expired-child',url);
 await context.pruneSideChatRecents();
 assert.equal(views.has(expired.id),false,'pruning a side chat destroys its native tab');
 assert.equal(controller.list('expired-child').length,0);
 assert.equal(views.has(other.id),true);
 assert.ok(released.includes('expired-child'));
};
