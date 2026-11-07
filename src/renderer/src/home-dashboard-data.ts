import { epochMillis } from "../../shared/conversation-time";

export type HomeThread = { id: string; title: string; createdAt?: string | number; updatedAt?: string | number };
export type HomeProject = { id: string; name: string; icon?: string; color?: string | null; threads: HomeThread[] };
export type HomeChat = HomeThread & { projectName: string | null; projectId: string | null };
export function homeChats(projects: HomeProject[], recents: HomeThread[]): HomeChat[] {
  const chats = new Map<string, HomeChat>();
  for (const project of projects) for (const chat of project.threads) chats.set(chat.id, { ...chat, projectName: project.name, projectId: project.id });
  for (const chat of recents) if (!chats.has(chat.id)) chats.set(chat.id, { ...chat, projectName: null, projectId: null });
  const time = (chat: HomeChat) => epochMillis(chat.updatedAt) ?? epochMillis(chat.createdAt) ?? 0;
  return [...chats.values()].sort((a, b) => time(b) - time(a));
}
export function homeDayKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function chatsOnHomeDay(chats: HomeChat[], day: string, now = Date.now()): HomeChat[] {
  return chats.filter(chat => { const at = epochMillis(chat.createdAt); return at !== null && at <= now && homeDayKey(new Date(at)) === day; })
    .sort((a, b) => epochMillis(b.createdAt)! - epochMillis(a.createdAt)!);
}
export function homeActivity(chats: HomeThread[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 25 * 7);
  const counts = new Map<string, number>();
  let monthCount = 0;
  for (const chat of chats) {
    const at = epochMillis(chat.createdAt);
    if (at === null || at > now.getTime()) continue;
    const date = new Date(at);
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) monthCount++;
    if (at < start.getTime()) continue;
    const key = homeDayKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days = Array.from({ length: 26 * 7 }, (_, i) => {
    const date = new Date(start); date.setDate(start.getDate() + i);
    return { date, count: counts.get(homeDayKey(date)) ?? 0, future: date > today };
  });
  return { days, monthCount, total: [...counts.values()].reduce((sum, n) => sum + n, 0), activeDays: counts.size };
}

/** A factual local snapshot; chat metadata does not establish a person's identity. */
export function homeWorkSnapshot(chats: HomeChat[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 13);
  const recent = chats.filter(chat => {
    const at = epochMillis(chat.updatedAt) ?? epochMillis(chat.createdAt);
    return at !== null && at >= start.getTime() && at <= now.getTime();
  });
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const chat of recent) {
    if (!chat.projectId || !chat.projectName) continue;
    const entry = counts.get(chat.projectId) ?? { id: chat.projectId, name: chat.projectName, count: 0 };
    entry.count++; counts.set(chat.projectId, entry);
  }
  const activity = homeActivity(recent, now);
  let longest = 0, streak = 0;
  for (const day of activity.days) {
    if (day.date < start || day.future) continue;
    streak = day.count > 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  const createdThisPeriod = recent.filter(chat => {
    const at = epochMillis(chat.createdAt);
    return at !== null && at >= start.getTime() && at <= now.getTime();
  });
  return {
    recent,
    projects: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    started: createdThisPeriod.length,
    longestStreak: longest,
  };
}
