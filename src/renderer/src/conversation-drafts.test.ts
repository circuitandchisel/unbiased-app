import { test } from "node:test";
import assert from "node:assert/strict";
import { ConversationDrafts } from "./conversation-drafts";

test("switching conversations restores each unsent draft without carrying it to the next", () => {
  const drafts = new ConversationDrafts<string>("a", 0);
  drafts.setText("question for A");
  drafts.updateAttachments(drafts.identity(), ["a.png"]);

  assert.deepEqual(drafts.transition("b", 1), { text: "", attachments: [] });
  drafts.setText("question for B");
  assert.deepEqual(drafts.transition("a", 2), { text: "question for A", attachments: ["a.png"] });
  assert.deepEqual(drafts.transition("b", 3), { text: "question for B", attachments: [] });
});

test("a fresh new chat has an empty composer and does not erase the previous conversation", () => {
  const drafts = new ConversationDrafts<string>("a", 0);
  drafts.setText("unfinished A");
  assert.deepEqual(drafts.transition(null, 1), { text: "", attachments: [] });
  drafts.setText("new chat draft");
  assert.deepEqual(drafts.transition("a", 2), { text: "unfinished A", attachments: [] });
  assert.deepEqual(drafts.transition(null, 3), { text: "", attachments: [] });
});

test("creating a thread keeps text entered while the first send was pending", () => {
  const drafts = new ConversationDrafts<string>(null, 0);
  drafts.setText("next message");
  assert.deepEqual(drafts.transition("created", 0), { text: "next message", attachments: [] });
  assert.deepEqual(drafts.transition("other", 1), { text: "", attachments: [] });
  assert.deepEqual(drafts.transition("created", 2), { text: "next message", attachments: [] });
});

test("sending clears only the current conversation's draft", () => {
  const drafts = new ConversationDrafts<string>("a", 0);
  drafts.setText("A");
  drafts.transition("b", 1);
  drafts.setText("B");
  drafts.setText("");
  assert.deepEqual(drafts.transition("a", 2), { text: "A", attachments: [] });
  assert.deepEqual(drafts.transition("b", 3), { text: "", attachments: [] });
});

test("an attachment picked before a switch stays in its original conversation", () => {
  const drafts = new ConversationDrafts<string>("a", 0);
  const origin = drafts.identity();
  drafts.transition("b", 1);
  assert.equal(drafts.updateAttachments(origin, ["picked.png"]), null);
  assert.deepEqual(drafts.current(), { text: "", attachments: [] });
  assert.deepEqual(drafts.transition("a", 2), { text: "", attachments: ["picked.png"] });
});

test("a deleted conversation cannot restore its unsent draft", () => {
  const drafts = new ConversationDrafts<string>("a", 0);
  drafts.setText("private draft");
  drafts.transition("b", 1);
  drafts.deleteThread("a");
  assert.deepEqual(drafts.transition("a", 2), { text: "", attachments: [] });
});
