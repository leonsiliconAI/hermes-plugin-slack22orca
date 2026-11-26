import { slackPermalink } from "#slack";

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
      // Look back over the chunk's tail only. lastIndexOf goes on to the start of the text, which
      // made one long line cost the square of its length.
      for (let index = end - 1; index >= start + 3000; index--) {
        if (characters[index] === "\n") {
          end = index + 1;
          break;
        }
      }
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
    return { error: "Usage: !orca [auto|macbook|mini|cloud|desktop] [repo=<name>] <task>" };
  if (Array.from(task).length > limit || task.includes("\0"))
    return { error: "Task must be at most " + limit + " characters and contain no NUL." };
  if (typeof repo !== "string" || Array.from(repo).length > 250)
    return { error: "Use a registered Orca repository name or its canonical Git remote." };
  return {
    prompt:
      "This task was delegated by Hermes from Slack. Your user-visible messages will be relayed " +
      "into the original Slack thread as you work. Keep progress and the final result useful for " +
      "that audience, and keep secrets out of your messages.\n\n" +
      "Slack request: " +
      slackPermalink(channel, message) +
      "\n\n" +
      task.trim(),
  };
}

export function slackRetry(delay: string) {
  return /^\d+$/.test(delay) ? Math.max(1, Number(delay)) : 30;
}

interface Job {
  id: string;
  state: string;
  due: number;
  repo: string;
  target: string;
  host: string;
  repo_id?: string;
  operation?: string | null;
  prompt?: string;
  session?: string;
  previous?: string[];
  recovery_attempts?: number;
  read_unavailable?: boolean;
}

type OrcaResponse<T> = { value: T; error?: undefined } | { error: string; retry?: string };
interface OrcaHost {
  command<T>(host: string, args: string[], timeout: number): Promise<OrcaResponse<T>>;
  save(job: Job, messages: string[]): Promise<void>;
  keys(entries: Entry[]): Promise<string[]>;
  now(): number;
  log(message: string): void;
}

export function finishedState(job: Job) {
  const next = { ...job, state: "done", due: 0 };
  delete next.prompt;
  delete next.operation;
  delete next.previous;
  return next;
}

async function started(host: OrcaHost, job: Job, session: string) {
  session = session.replace(/^orca_session_id:/, "");
  const next = { ...job, state: "reading", session, previous: [], due: 0 };
  delete next.prompt;
  delete next.operation;
  await host.save(next, [
    "Orca started Codex on " + job.host + " (orca_session_id:" + session + ").",
  ]);
}

async function recover(host: OrcaHost, job: Job) {
  const workspace = await host.command<{ worktree?: { id?: string } }>(
    job.host,
    ["worktree", "show", "--worktree", "name:slack22orca-" + job.id],
    12,
  );
  const id = workspace.error === undefined && workspace.value.worktree?.id;
  if (id) {
    const result = await host.command<{ agents?: { kind?: string; orcaSessionId?: string }[] }>(
      job.host,
      ["agent", "list", "--worktree", "id:" + id],
      12,
    );
    const session = result.error === undefined && recoveredSession(result.value.agents ?? []);
    if (session) {
      await started(host, job, session);
      return;
    }
  }
  const attempts = (job.recovery_attempts ?? 0) + 1;
  if (attempts >= 4) {
    await host.save(finishedState(job), [
      "Orca could not confirm the launch on " +
        job.host +
        ". Check workspace slack22orca-" +
        job.id +
        " on that host.",
    ]);
  } else {
    await host.save({ ...job, recovery_attempts: attempts, due: host.now() + 5 }, []);
  }
}

async function launch(host: OrcaHost, job: Job, first: boolean, poll: number) {
  const { operation } = job;
  if (!first && !operation) {
    await recover(host, job);
    return;
  }
  const args = [
    "worktree",
    "create",
    "--repo",
    "id:" + job.repo_id,
    "--name",
    "slack22orca-" + job.id,
    "--no-parent",
    "--setup",
    "skip",
    "--agent",
    "codex",
    "--surface",
    "chat",
    "--prompt",
    job.prompt ?? "",
  ];
  if (operation) args.push("--retry-launch", operation);
  const result = await host.command<Parameters<typeof launchSession>[0]>(job.host, args, 65);
  if (result.error !== undefined) {
    host.log(job.id + " launch on " + job.host + " returned " + result.error);
    const retry = !operation && typeof result.retry === "string" && result.retry;
    await host.save({ ...job, operation: retry || null, due: host.now() + poll }, []);
    return;
  }
  const session = launchSession(result.value);
  if (session) await started(host, job, session);
  else await host.save({ ...job, operation: null, due: host.now() + poll }, []);
}

export async function findPlacement(
  host: Pick<OrcaHost, "command" | "log">,
  targets: string[],
  repoName: string,
) {
  const failures = [];
  for (const name of targets) {
    const repos = await host.command<{ repos?: Repository[] }>(name, ["repo", "list"], 12);
    const repo =
      repos.error === undefined ? repository(repos.value.repos ?? [], repoName) : undefined;
    if (repo?.error) {
      failures.push(name + ": " + repo.error);
      continue;
    }
    const agents = repo
      ? await host.command<{ agents?: { id?: string }[] }>(name, ["agent", "installed"], 12)
      : undefined;
    if (agents?.error !== undefined || repos.error !== undefined) {
      const error = agents?.error ?? repos.error;
      host.log("Preflight on " + name + " failed (" + error + ")");
      failures.push(name + ": unreachable");
      continue;
    }
    if (!repo?.id || !agents?.value.agents?.some((agent) => agent.id === "codex")) {
      failures.push(name + ": Codex unavailable");
      continue;
    }
    return { name, repoId: repo.id };
  }
  return { failures };
}

async function prepare(host: OrcaHost, job: Job, targets: string[], poll: number) {
  const candidates =
    job.target === "desktop" ? ["macbook", "mini"] : job.target === "auto" ? targets : [job.target];
  const placement = job.repo_id
    ? { name: job.target, repoId: job.repo_id }
    : await findPlacement(host, candidates, job.repo);
  if (!("failures" in placement)) {
    // Persist the host before a mutating call. An ambiguous launch stays on that host.
    const selected = {
      ...job,
      state: "launching",
      host: placement.name,
      repo_id: placement.repoId,
      due: 0,
    };
    await host.save(selected, []);
    await launch(host, selected, true, poll);
  } else if (job.target === "desktop") {
    await host.save({ ...job, due: host.now() + 300 }, []);
  } else {
    await host.save(finishedState(job), [
      "Orca could not start this task. " + placement.failures?.join("; ") + ".",
    ]);
  }
}

async function read(host: OrcaHost, job: Job, poll: number, limit: number) {
  const response = await host.command<{ limited?: boolean; entries: Entry[]; state?: string }>(
    job.host,
    ["agent", "read", "orca_session_id:" + job.session, "--limit", String(limit)],
    12,
  );
  if (response.error !== undefined) {
    if (!job.read_unavailable)
      host.log(job.id + " transcript temporarily unavailable (" + response.error + ")");
    await host.save({ ...job, read_unavailable: true, due: host.now() + 20 }, []);
    return;
  }
  const page = response.value;
  const keys = await host.keys(page.entries);
  const overlap = transcriptOverlap(job.previous ?? [], keys, Boolean(page.limited));
  const messages = transcriptMessages(page.entries.slice(overlap.start), overlap.gap);
  delete job.read_unavailable;
  if (page.state === "done") {
    await host.save(finishedState(job), [...messages, "Orca finished the turn."]);
  } else {
    await host.save({ ...job, previous: keys, due: host.now() + poll }, messages);
  }
}

export async function advance(
  host: OrcaHost,
  job: Job,
  targets: string[],
  poll: number,
  limit: number,
) {
  if (job.state === "queued") await prepare(host, job, targets, poll);
  else if (job.state === "launching") await launch(host, job, false, poll);
  else await read(host, { ...job }, poll, limit);
}

export function deferJob(job: Job, now: number) {
  return { ...job, due: now + 20 };
}
