// Shape-compatible Home responses for smoke tests that mount the full App.
// Inject these branches into the renderer's local IPC proxy; no network calls.
exports.homeApiFixture = `
if(key==='readBilling')return {ok:true,organization:{name:'Smoke account'},balanceCents:null,monthToDateSpendCents:null,spendSyncedAt:null,tokens:null};
if(key==='homeGithub')return {ok:true,login:'smoke-user',opened:0,merged:0,pullRequests:[],partial:false,...(args[0]?.includeActivity?{activity:{events:[],partial:false,notices:[]}}:{})};
if(key==='homeRecap')return {ok:false,pending:true,error:'Your recent-work recap will appear here as you chat.'};
`;
