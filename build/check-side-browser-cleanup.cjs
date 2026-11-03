// Execute the production deletion/pruning handlers against real native browser tabs.
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
module.exports=async function checkCleanup(controller,views,front,background,url){
 const source=readFileSync('src/main/index.ts','utf8');
 const take=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const code=take('function closeSideBrowserView(', '/** Release all native')
  +take('async function releaseConversationTab(', 'function ensureBrowserView(')
  +take('async function pruneSideChatRecents(', 'function ensurePane(')
  +take('  ipcMain.handle("threads:delete",', '\n\n  createWindow();');
 const records=new Map([['side:test',{paneId:'side:test',threadId:'deleted-child'}]]),handlers=new Map(),released=[];
 const context={console,sideBrowser:controller,browserViews:views,browserVisibility:new Map(),browserViewBounds:new Map(),win:front,backgroundBrowserHost:background,
  ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},engine:{request:async()=>({})},browserRuntime:{request:async(_method,{sessionId})=>{released.push(sessionId)}},
  sideChatRecents:{recordsForParent:()=>[...records.values()],expired:()=>[...records.keys()],get:id=>records.get(id),remove:id=>records.delete(id)},
  dropSidePane:()=>{},forgetBrowserCaptures:()=>{},saveSideChatRecents:()=>{},saveThreadMcp:()=>{},sideChatTranscriptFile:id=>id,transcriptFile:id=>id,rmSync:()=>{},
  petFinished:()=>{},settleLocalApprovals:()=>{},settleLocalUserInputs:()=>{},resetSidePanes:()=>{},panes:{main:{threadId:'unrelated'}},
 };
 for(const key of ['threadMcp','runningTurns','subAgents','subAgentMail','heldApprovals','bgStream','mcpApplyPending','threadAccessModes','heldErrors','multiMountLeases'])context[key]=new Map();
 context.browserNetGrants=new Set();context.browserConnectGrants=new Set();
 runInNewContext(transformSync(code,{loader:'ts'}).code,context);
 const parent=await controller.open('deleted-parent',url),child=await controller.open('deleted-child',url),other=await controller.open('unrelated',url);
 await handlers.get('threads:delete')({},'deleted-parent');
 assert.equal(views.has(parent.id),false,'deleting a parent destroys its native tab');
 assert.equal(views.has(child.id),false,'deleting a parent also destroys its side-chat native tab');
 assert.equal(controller.list('deleted-child').length,0,'deleted child consumes no browser slot');
 assert.equal(controller.list('unrelated').length,1,'deleting one chat preserves another browser');
 assert.ok(released.includes('deleted-child'));
 records.set('side:expired',{paneId:'side:expired',threadId:'expired-child'});
 const expired=await controller.open('expired-child',url);
 await context.pruneSideChatRecents();
 assert.equal(views.has(expired.id),false,'pruning a side chat destroys its native tab');
 assert.equal(controller.list('expired-child').length,0);
 assert.equal(views.has(other.id),true);
 assert.ok(released.includes('expired-child'));
};
