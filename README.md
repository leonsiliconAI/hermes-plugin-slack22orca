# slack22orca

Hermes hands a Slack task to Codex in a new Orca worktree. Orca’s commentary and final reply appear as Hermes bot messages in the same Slack thread while Codex works.

## Use

In a conversation where Hermes answers, type `!orca <task>`. Mention Hermes if the channel requires it. A top-level request starts a thread under the request. A reply inside a thread uses its parent.

```text
!orca Check why CI is failing
!orca macbook Investigate the local dev build
!orca mini repo=leonsilicon.ai Review the latest changes
!orca cloud repo=github.com/leonsilicon/leonsilicon.ai Check the release workflow
```

Hermes can call `slack22orca_delegate` during a Slack model turn with a self-contained `task`, optional `repo`, and optional `target`. The gateway supplies the Slack route from the current turn. AutoLinear’s ordinary Silicon Dot handoff stays on its existing route. The `!orca` command bypasses that handoff.

Automatic placement tries MacBook, Mac mini, then the Orca daemon on Hermes Cloud. Each candidate needs the requested repository registered in Orca and Codex installed. Choose an explicit target when the task needs that host’s files. Worktrees use the repository’s default base and skip setup hooks.

## Install on Hermes Cloud

Install this plugin and use AutoLinear 1.4.4 or newer if AutoLinear is enabled.

```sh
hermes plugins install leonsiliconAI/hermes-plugin-slack22orca --enable --yes-deps
```

The gateway must have its existing Slack app and `chat:write`. Set `SLACK22ORCA_USER_ID` to the Slack user allowed to delegate. An existing `AUTOLINEAR_USER_ID` supplies the default. Restart the Hermes gateway after installation. Its log should show `slack22orca: Slack thread relay registered`. Verify with a short `!orca cloud` task.

The defaults match Captain Cloud. Set these in the Hermes profile environment when its paths or saved environment names differ.

| Variable                     | Default                                     |
| ---------------------------- | ------------------------------------------- |
| `SLACK22ORCA_CLOUD_CLI`      | `/opt/data/orcahermes/bin/orca`             |
| `SLACK22ORCA_DEVICE_CLI`     | `/opt/data/orcahermes/current/bin/orca-ide` |
| `SLACK22ORCA_DEVICE_PROFILE` | `/opt/data/.config/orca`                    |
| `SLACK22ORCA_MACBOOK`        | `MacBook`                                   |
| `SLACK22ORCA_MINI`           | `Mac mini`                                  |
| `SLACK22ORCA_REPO`           | `leonsilicon.ai`                            |

The two desktop targets use [OrcaHermes Device](https://orcahermes-device.leonsilicon.ai/) and its existing tailnet forwarders. Check the pairings from the Hermes host with `ORCA_USER_DATA_PATH=/opt/data/.config/orca /opt/data/orcahermes/current/bin/orca-ide environment list --json`, then run `repo list --environment "Mac mini" --json` with the same CLI and profile. Cloud-only work uses [OrcaHermes](https://orcahermes.leonsilicon.ai/) directly.

## Delivery and recovery

The Slack message ID deduplicates requests. The relay records the chosen host before launch, so a lost reply can only be replayed on that host with Orca’s operation ID. It can also recover a launch by finding its dedicated worktree and chat. Read and Slack delivery state survive gateway restarts in `$HERMES_HOME/slack22orca/relay.db`. Slack delivery retries can repeat a reply if Slack accepted it before the gateway saved the receipt.

The relay reads Orca’s user-visible assistant text and preserves its order. Orca’s CLI exposes the latest 100 transcript entries, including tool events, and limits very large entries. If an outage or burst causes the readable window to lose its overlap, the relay reports the gap in the thread and continues. Orca displays images as text placeholders through this API. The worker stops after Orca reports the delegated turn complete.

Run the regression suite from this directory with `python3 -m unittest discover -s __tests__`.
