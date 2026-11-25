export const marker = "de1e6a7e";
export const groups = { grok: "b075", codex: "c0de" } as const;
export const grokBridgeGroup = "4b22";

export function clientMessageId(
  event?: { client_msg_id?: unknown; message?: { client_msg_id?: unknown } } | null,
) {
  const value = event?.client_msg_id || event?.message?.client_msg_id;
  return typeof value === "string" ? value : "";
}

export function agentGroup(id: unknown) {
  if (typeof id === "string")
    return Object.values(groups).find((group) => id.startsWith(marker + "-" + group + "-"));
}

export function slackPermalink(channel: string, ts: string) {
  return "https://app.slack.com/archives/" + channel + "/p" + ts.replaceAll(".", "");
}

export function issueChannel(name: string, prefix: string) {
  if (!name.startsWith(prefix + "-")) return false;
  return /^\p{Decimal_Number}+(?:-|$)/u.test(name.slice(prefix.length + 1));
}
