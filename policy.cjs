Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
// \0hermes-slack.ts
function slackPermalink(channel, ts) {
	return "https://app.slack.com/archives/" + channel + "/p" + ts.replaceAll(".", "");
}
// policy.ts
function repository(repos, name) {
	const results = repos.filter((repo) => repo.kind === "git" && (repo.displayName === name || repo.gitRemoteIdentity?.canonicalKey === name));
	return results.length === 1 ? { id: results[0].id } : { error: results.length ? "repository ambiguous" : "repository missing" };
}
function launchSession(result) {
	const { outcome, prompt } = result.launch ?? {};
	return outcome?.kind === "structured" && prompt?.outcome === "journaled" ? outcome.sessionId : void 0;
}
function recoveredSession(agents) {
	const chats = agents.filter((agent) => agent.kind === "chat");
	return chats.length === 1 ? chats[0].orcaSessionId : void 0;
}
function transcriptOverlap(previous, keys, limited) {
	if (!limited && previous.slice(0, keys.length).every((key, index) => key === keys[index])) return {
		start: previous.length,
		gap: false
	};
	for (let size = Math.min(previous.length, keys.length); size > 0; size--) if (previous.slice(-size).every((key, index) => key === keys[index])) return {
		start: size,
		gap: false
	};
	return {
		start: 0,
		gap: limited || previous.length > 0
	};
}
function slackChunks(text) {
	const characters = Array.from(text);
	const chunks = [];
	for (let start = 0; start < characters.length;) {
		let end = Math.min(characters.length, start + 3800);
		if (end < characters.length) {
			for (let index = end - 1; index >= start + 3e3; index--) if (characters[index] === "\n") {
				end = index + 1;
				break;
			}
		}
		chunks.push("Orca\n" + characters.slice(start, end).join(""));
		start = end;
	}
	return chunks;
}
function transcriptMessages(entries, gap) {
	const messages = gap ? ["Orca’s transcript changed or exceeded its readable window. Some earlier messages may be missing."] : [];
	for (const entry of entries) if (entry.kind === "message" && entry.role === "assistant" && entry.text) messages.push(...slackChunks(entry.text));
	return messages;
}
function command(raw, targets) {
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
	return {
		task,
		target,
		repo
	};
}
const slackChannel = /^[CDG][A-Z0-9]+(?![\s\S])/;
const slackTs = /^[0-9]+\.[0-9]{6}(?![\s\S])/;
function delegation(request, owner, targets, limit) {
	const { channel, thread, message, actor, target, repo, task } = request;
	if (!actor || actor !== owner) return { error: "Orca delegation is available to the configured Slack user." };
	if (!channel || !slackChannel.test(channel) || !thread || !slackTs.test(thread) || !message || !slackTs.test(message)) return { error: "Orca delegation needs a Slack message and its thread." };
	if (target !== "auto" && !targets.includes(target ?? "") || typeof task !== "string" || !task.trim()) return { error: "Usage: !orca [auto|macbook|mini|cloud|desktop] [repo=<name>] <task>" };
	if (Array.from(task).length > limit || task.includes("\0")) return { error: "Task must be at most " + limit + " characters and contain no NUL." };
	if (typeof repo !== "string" || Array.from(repo).length > 250) return { error: "Use a registered Orca repository name or its canonical Git remote." };
	return { prompt: "This task was delegated by Hermes from Slack. Your user-visible messages will be relayed into the original Slack thread as you work. Keep progress and the final result useful for that audience, and keep secrets out of your messages.\n\nSlack request: " + slackPermalink(channel, message) + "\n\n" + task.trim() };
}
function slackRetry(delay) {
	return /^\d+$/.test(delay) ? Math.max(1, Number(delay)) : 30;
}
function finishedState(job) {
	const next = {
		...job,
		state: "done",
		due: 0
	};
	delete next.prompt;
	delete next.operation;
	delete next.previous;
	return next;
}
async function started(host, job, session) {
	session = session.replace(/^orca_session_id:/, "");
	const next = {
		...job,
		state: "reading",
		session,
		previous: [],
		due: 0
	};
	delete next.prompt;
	delete next.operation;
	await host.save(next, ["Orca started Codex on " + job.host + " (orca_session_id:" + session + ")."]);
}
async function recover(host, job) {
	const workspace = await host.command(job.host, [
		"worktree",
		"show",
		"--worktree",
		"name:slack22orca-" + job.id
	], 12);
	const id = workspace.error === void 0 && workspace.value.worktree?.id;
	if (id) {
		const result = await host.command(job.host, [
			"agent",
			"list",
			"--worktree",
			"id:" + id
		], 12);
		const session = result.error === void 0 && recoveredSession(result.value.agents ?? []);
		if (session) {
			await started(host, job, session);
			return;
		}
	}
	const attempts = (job.recovery_attempts ?? 0) + 1;
	if (attempts >= 4) await host.save(finishedState(job), ["Orca could not confirm the launch on " + job.host + ". Check workspace slack22orca-" + job.id + " on that host."]);
	else await host.save({
		...job,
		recovery_attempts: attempts,
		due: host.now() + 5
	}, []);
}
async function launch(host, job, first, poll) {
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
		job.prompt ?? ""
	];
	if (operation) args.push("--retry-launch", operation);
	const result = await host.command(job.host, args, 65);
	if (result.error !== void 0) {
		host.log(job.id + " launch on " + job.host + " returned " + result.error);
		const retry = !operation && typeof result.retry === "string" && result.retry;
		await host.save({
			...job,
			operation: retry || null,
			due: host.now() + poll
		}, []);
		return;
	}
	const session = launchSession(result.value);
	if (session) await started(host, job, session);
	else await host.save({
		...job,
		operation: null,
		due: host.now() + poll
	}, []);
}
async function findPlacement(host, targets, repoName) {
	const failures = [];
	for (const name of targets) {
		const repos = await host.command(name, ["repo", "list"], 12);
		const repo = repos.error === void 0 ? repository(repos.value.repos ?? [], repoName) : void 0;
		if (repo?.error) {
			failures.push(name + ": " + repo.error);
			continue;
		}
		const agents = repo ? await host.command(name, ["agent", "installed"], 12) : void 0;
		if (agents?.error !== void 0 || repos.error !== void 0) {
			const error = agents?.error ?? repos.error;
			host.log("Preflight on " + name + " failed (" + error + ")");
			failures.push(name + ": unreachable");
			continue;
		}
		if (!repo?.id || !agents?.value.agents?.some((agent) => agent.id === "codex")) {
			failures.push(name + ": Codex unavailable");
			continue;
		}
		return {
			name,
			repoId: repo.id
		};
	}
	return { failures };
}
async function prepare(host, job, targets, poll) {
	const candidates = job.target === "desktop" ? ["macbook", "mini"] : job.target === "auto" ? targets : [job.target];
	const placement = job.repo_id ? {
		name: job.target,
		repoId: job.repo_id
	} : await findPlacement(host, candidates, job.repo);
	if (!("failures" in placement)) {
		const selected = {
			...job,
			state: "launching",
			host: placement.name,
			repo_id: placement.repoId,
			due: 0
		};
		await host.save(selected, []);
		await launch(host, selected, true, poll);
	} else if (job.target === "desktop") await host.save({
		...job,
		due: host.now() + 300
	}, []);
	else await host.save(finishedState(job), ["Orca could not start this task. " + placement.failures?.join("; ") + "."]);
}
async function read(host, job, poll, limit) {
	const response = await host.command(job.host, [
		"agent",
		"read",
		"orca_session_id:" + job.session,
		"--limit",
		String(limit)
	], 12);
	if (response.error !== void 0) {
		if (!job.read_unavailable) host.log(job.id + " transcript temporarily unavailable (" + response.error + ")");
		await host.save({
			...job,
			read_unavailable: true,
			due: host.now() + 20
		}, []);
		return;
	}
	const page = response.value;
	const keys = await host.keys(page.entries);
	const overlap = transcriptOverlap(job.previous ?? [], keys, Boolean(page.limited));
	const messages = transcriptMessages(page.entries.slice(overlap.start), overlap.gap);
	delete job.read_unavailable;
	if (page.state === "done") await host.save(finishedState(job), [...messages, "Orca finished the turn."]);
	else await host.save({
		...job,
		previous: keys,
		due: host.now() + poll
	}, messages);
}
async function advance(host, job, targets, poll, limit) {
	if (job.state === "queued") await prepare(host, job, targets, poll);
	else if (job.state === "launching") await launch(host, job, false, poll);
	else await read(host, { ...job }, poll, limit);
}
function deferJob(job, now) {
	return {
		...job,
		due: now + 20
	};
}
exports.advance = advance;
exports.command = command;
exports.deferJob = deferJob;
exports.delegation = delegation;
exports.findPlacement = findPlacement;
exports.finishedState = finishedState;
exports.launchSession = launchSession;
exports.recoveredSession = recoveredSession;
exports.repository = repository;
exports.slackChunks = slackChunks;
exports.slackRetry = slackRetry;
exports.transcriptMessages = transcriptMessages;
exports.transcriptOverlap = transcriptOverlap;
