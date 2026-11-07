import assert from "node:assert/strict";
import test from "node:test";
import { homeActivity, homeChats } from "./home-dashboard-data";

test("home uses unique visible chats with real project ownership and newest activity first", () => {
  const chats = homeChats([{ id: "p", name: "Project", threads: [{ id: "one", title: "One", createdAt: "2026-11-01T10:00:00Z", updatedAt: 1793959200 }] }], [{ id: "one", title: "Duplicate" }, { id: "two", title: "Two", updatedAt: "2026-11-06T12:00:00Z" }]);
  assert.equal(chats.length, 2);
  assert.equal(chats[0].id, "two");
  assert.equal(chats[1].projectName, "Project");
  assert.equal(chats[1].title, "One");
});
test("home counts creation dates within local calendar windows, excluding future and invalid timestamps", () => {
  const now = new Date(2026, 10, 6, 12);
  const stamp = (date: Date) => date.toISOString();
  const activity = homeActivity([
    { id: "one", title: "One", createdAt: stamp(new Date(2026, 10, 1, 23, 30)) },
    { id: "two", title: "Two", createdAt: stamp(new Date(2026, 10, 1, 8)) },
    { id: "three", title: "Three", createdAt: new Date(2026, 9, 31, 12).getTime() / 1000 },
    { id: "future", title: "Future", createdAt: stamp(new Date(2026, 10, 7)) },
    { id: "old", title: "Old", createdAt: stamp(new Date(2025, 10, 1)), updatedAt: stamp(now) },
    { id: "invalid", title: "Invalid", createdAt: "unknown" },
  ], now);
  assert.equal(activity.total, 3);
  assert.equal(activity.monthCount, 2);
  assert.equal(activity.activeDays, 2);
  assert.equal(activity.days.length, 182);
  assert.equal(activity.days[0].date.getDay(), 1);
  assert.equal(activity.days.filter(day => day.count === 2).length, 1);
  assert.ok(activity.days.filter(day => day.future).every(day => day.count === 0));
  for (let i = 1; i < activity.days.length; i++) {
    const next = new Date(activity.days[i-1].date); next.setDate(next.getDate()+1);
    assert.equal(activity.days[i].date.getTime(), next.getTime(), "calendar cells survive DST transitions");
  }
});

test("selected-day activities use creation time, local dates and current project scope", async () => {
  const { chatsOnHomeDay, homeDayKey } = await import("./home-dashboard-data");
  const date = new Date(2026, 10, 6, 12);
  const chats = homeChats([{ id: "p", name: "Project", threads: [
    { id: "morning", title: "Morning", createdAt: new Date(2026, 10, 6, 0, 5).toISOString(), updatedAt: new Date(2026, 10, 7).toISOString() },
    { id: "before", title: "Previous day", createdAt: new Date(2026, 10, 5, 23, 59).toISOString(), updatedAt: date.toISOString() },
    { id: "future", title: "Not started yet", createdAt: new Date(2026, 10, 6, 14).toISOString() },
  ] }], [{ id: "recent", title: "No project", createdAt: new Date(2026, 10, 6, 10).getTime() / 1000 }]);
  const day = homeDayKey(date);
  assert.equal(day, "2026-11-06");
  assert.deepEqual(chatsOnHomeDay(chats, day, date.getTime()).map(chat => chat.id), ["recent", "morning"]);
  assert.deepEqual(chatsOnHomeDay(chats.filter(chat => chat.projectId === "p"), day, date.getTime()).map(chat => chat.id), ["morning"]);
  assert.equal(chatsOnHomeDay(chats, "2026-11-04", date.getTime()).length, 0);
});
