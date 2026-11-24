interface Entry {
  kind?: string;
  role?: string;
  text?: string;
}

interface Repository {
  id?: string;
  kind?: string;
  displayName?: string;
  gitRemoteIdentity?: { canonicalKey?: string };
}

export function repository(repos: Repository[], name: string) {
  const results = repos.filter(
    (repo) =>
      repo.kind === "git" &&
      (repo.displayName === name || repo.gitRemoteIdentity?.canonicalKey === name),
  );
  return results.length === 1
    ? { id: results[0].id }
    : { error: results.length ? "repository ambiguous" : "repository missing" };
}

export function launchSession(result: {
  launch?: { outcome?: { kind?: string; sessionId?: string }; prompt?: { outcome?: string } };
}) {
  const { outcome, prompt } = result.launch ?? {};
  return outcome?.kind === "structured" && prompt?.outcome === "journaled"
    ? outcome.sessionId
    : undefined;
}

export function recoveredSession(agents: { kind?: string; orcaSessionId?: string }[]) {
  const chats = agents.filter((agent) => agent.kind === "chat");
  return chats.length === 1 ? chats[0].orcaSessionId : undefined;
}

export function transcriptOverlap(previous: string[], keys: string[], limited: boolean) {
  if (!limited && previous.slice(0, keys.length).every((key, index) => key === keys[index]))
    return { start: previous.length, gap: false };
  for (let size = Math.min(previous.length, keys.length); size > 0; size--) {
    if (previous.slice(-size).every((key, index) => key === keys[index]))
      return { start: size, gap: false };
  }
  return { start: 0, gap: limited || previous.length > 0 };
}

export function slackChunks(text: string) {
  const characters = Array.from(text);
  const chunks = [];
  for (let start = 0; start < characters.length;) {
    let end = Math.min(characters.length, start + 3800);
    if (end < characters.length) {
      const newline = characters.lastIndexOf("\n", end - 1);
      if (newline >= start + 3000) end = newline + 1;
    }
    chunks.push("Orca\n" + characters.slice(start, end).join(""));
    start = end;
  }
  return chunks;
}

export function transcriptMessages(entries: Entry[], gap: boolean) {
  const messages = gap
    ? [
        "Orca’s transcript changed or exceeded its readable window. Some earlier messages may be missing.",
      ]
    : [];
  for (const entry of entries) {
    if (entry.kind === "message" && entry.role === "assistant" && entry.text)
      messages.push(...slackChunks(entry.text));
  }
  return messages;
}

export function command(raw: string, targets: string[]) {
  let task = raw.trim();
  let target = "auto";
  let repo = "";
  const [word] = task.split(/\s/, 1);
  if (word === "auto" || targets.includes(word)) {
    target = word;
    task = task.slice(word.length).trimStart();
  }
  if (task.startsWith("repo=")) {
    task = task.slice(5).trimStart();
    [repo] = task.split(/\s/, 1);
    task = task.slice(repo.length).trimStart();
  }
  return { task, target, repo };
}

interface Request {
  channel?: string;
  thread?: string;
  message?: string;
  actor?: string;
  target?: string;
  repo?: string;
  task?: string;
}

const slackChannel = /^[CDG][A-Z0-9]+(?![\s\S])/;
const slackTs = /^[0-9]+\.[0-9]{6}(?![\s\S])/;

export function delegation(request: Request, owner: string, targets: string[], limit: number) {
  const { channel, thread, message, actor, target, repo, task } = request;
  if (!actor || actor !== owner)
    return { error: "Orca delegation is available to the configured Slack user." };
  if (
    !channel ||
    !slackChannel.test(channel) ||
    !thread ||
    !slackTs.test(thread) ||
    !message ||
    !slackTs.test(message)
  )
    return { error: "Orca delegation needs a Slack message and its thread." };
  if (
    (target !== "auto" && !targets.includes(target ?? "")) ||
    typeof task !== "string" ||
    !task.trim()
  )
    return { error: "Usage: !orca [auto|macbook|mini|cloud] [repo=<name>] <task>" };
  if (Array.from(task).length > limit || task.includes("\0"))
    return { error: "Task must be at most " + limit + " characters and contain no NUL." };
  if (typeof repo !== "string" || Array.from(repo).length > 250)
    return { error: "Use a registered Orca repository name or its canonical Git remote." };
  return {
    prompt:
      "This task was delegated by Hermes from Slack. Your user-visible messages will be relayed " +
      "into the original Slack thread as you work. Keep progress and the final result useful for " +
      "that audience, and keep secrets out of your messages.\n\n" +
      "Slack request: https://app.slack.com/archives/" +
      channel +
      "/p" +
      message.replaceAll(".", "") +
      "\n\n" +
      task.trim(),
  };
}

export function slackRetry(delay: string) {
  return /^\d+$/.test(delay) ? Math.max(1, Number(delay)) : 30;
}
