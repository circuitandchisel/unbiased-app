import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timelineActivity, notificationActivity, readGithubActivity } from "./home-github-activity";
const at = new Date().toISOString(), start = Date.parse(at) - 86400000, end = Date.parse(at) + 86400000;
const window = { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
const issue = { title: "Issue title", url: "https://github.com/org/app/issues/2", repository: { nameWithOwner: "org/app" }, author: {login:"alice"}, createdAt: at, timelineItems: {pageInfo:{hasNextPage:false},nodes:[
  {__typename:"AssignedEvent",id:"assigned",createdAt:at,assignee:{login:"alice"}},
  {__typename:"AssignedEvent",id:"other-assigned",createdAt:at,assignee:{login:"bob"}},
  {__typename:"IssueComment",id:"comment",createdAt:at,url:"https://github.com/org/app/issues/2#issuecomment-1",author:{login:"alice"}},
  {__typename:"IssueComment",id:"other-comment",createdAt:at,url:"https://github.com/org/app/issues/2#issuecomment-2",author:{login:"bob"}},
  {__typename:"ClosedEvent",id:"closed",createdAt:at,actor:{login:"alice"}},
]}};
const data = {viewer:{login:"alice"},search:{pageInfo:{hasNextPage:false},nodes:[issue]}};
const notification = {id:"notification",reason:"mention",updated_at:at,repository:{full_name:"org/app"},subject:{title:"Mentioned issue",url:"https://api.github.com/repos/org/app/issues/2",type:"Issue"}};
test("activity uses event timestamps and only the signed-in user's assignments and comments",()=>{
  const result=timelineActivity(data,"alice",start,end);
  assert.deepEqual(result.events.map(event=>event.action),["Opened issue","Assigned to you","You commented","You closed issue"]);
  assert.equal(timelineActivity(data,"alice",end,end+86400000).events.length,0);
  assert.equal(timelineActivity({...data,search:{...data.search,pageInfo:{hasNextPage:true}}},"alice",start,end).partial,true);
});
test("reviews and inline comments are separate dated activities",()=>{
  const result=timelineActivity({...data,search:{pageInfo:{hasNextPage:false},nodes:[{...issue,url:"https://github.com/org/app/pull/2",timelineItems:{pageInfo:{hasNextPage:false},nodes:[]},reviews:{pageInfo:{hasNextPage:false},nodes:[{id:"review",author:{login:"alice"},submittedAt:at,url:"https://github.com/org/app/pull/2#pullrequestreview-4",state:"APPROVED",comments:{pageInfo:{hasNextPage:false},nodes:[{id:"inline",createdAt:at,url:"https://github.com/org/app/pull/2#discussion_r1",author:{login:"alice"}}]}}]}}]}},"alice",start,end);
  assert.deepEqual(result.events.map(event=>event.action),["You reviewed","You commented on code"]);
});
test("mentions explicitly represent notification-thread updates and obey project/date scope",()=>{
  const events=notificationActivity([notification],[],start,end);
  assert.equal(events[0].action,"Mention thread updated");assert.equal(events[0].precision,"thread-update");
  assert.equal(notificationActivity([notification],["other/repo"],start,end).length,0);
  assert.equal(notificationActivity([notification],[],end,end+86400000).length,0);
  assert.equal(notificationActivity([{...notification,reason:"subscribed"}],[],start,end).length,0);
});
test("observed metadata persists by CLI identity and partial source failures preserve available activity",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"home-github-activity-")), file=join(dir,"events.json");
  try {
    const execute=async(_command:string,args:string[])=>args.includes("user")?"alice":args.includes("graphql")?JSON.stringify({data}):JSON.stringify([notification]);
    const result=await readGithubActivity(execute,"gh","alice",window,[],file);
    assert.equal(result.events.length,5);assert.ok(result.notices.some(note=>note.includes("not the original")));
    const records=JSON.parse(readFileSync(file,"utf8"));assert.equal(records.alice.length,5);assert.ok(!readFileSync(file,"utf8").includes('"body"'));
    const unavailable=await readGithubActivity(async(_command,args)=>{if(args.includes("user"))return "alice";throw Error("private stderr")},"gh","alice",window,[],file);
    assert.equal(unavailable.events.length,5);assert.equal(unavailable.partial,true);
    const changed=await readGithubActivity(async()=>"bob","gh","alice",window,[],file);
    assert.equal(changed.events.length,0);assert.ok(changed.notices[0].includes("account changed"));
  }finally{rmSync(dir,{recursive:true,force:true})}
});
