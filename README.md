# Discord Ticket Bot

Discord.js + MongoDB ticket bot with an interactive setup wizard, editable multi-block panels, detailed ticket logs, and English/Turkish interfaces.

## Features

- **Interactive setup**: `/ticketsystem setup` walks through category, panel channel, support roles, button/dropdown control, and automatic/manual panel design.
- **Editable panel builder**: add/edit/delete/reorder text, embed, and image blocks; set webhook identity, menu/button label, categories, and log channel; publish/update without reposting unnecessarily.
- **Ticket controls**: claim, close, reopen, transcript, delete. Claim is restricted to support roles / managers; close is restricted to the ticket owner and support roles / managers.
- **Detailed close logs**: when a ticket closes, the log channel receives a detailed embed and both HTML and TXT transcript attachments.
- **Auto-close**: optional inactivity duration (`24h`, `3d`, or disable).
- **Auto responses**: configurable messages sent when a ticket opens.
- **Search**: find a user's closed tickets from recent log messages.

## Requirements

- Node.js >= 24.17.0 or Bun
- MongoDB
- Discord bot token with `bot` and `applications.commands` scopes
- Discord **Message Content Intent** enabled for transcript contents

## Installation

```powershell
bun install --frozen-lockfile
Copy-Item .env.example .env
```

Set `.env` values:

```env
DISCORD_TOKEN=
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=ticket_bot
```

Start:

```powershell
bun run start
```

Development:

```powershell
bun run dev
```

Commands are registered globally on startup. After command changes, restart the bot; Discord may take a short time to refresh.

## Bot Permissions

In the ticket category and panel/log channels as needed:

- View Channel
- Manage Channels
- Manage Roles
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Manage Webhooks (for webhook panel publishing)

## Commands

All management commands require server-level **Manage Channels** permission.

| Command | Purpose |
| --- | --- |
| `/ticketsystem setup` | Interactive ticket system setup |
| `/ticketsystem edit` | Open the saved panel in the builder |
| `/ticketsystem config` | Set log channel and/or auto-close duration |
| `/ticketsystem log-channel` | Set the ticket log channel later |
| `/ticketsystem search` | Search a user's past tickets in the log channel |
| `/ticketsystem auto-response add/remove/list` | Manage automatic opening messages |
| `/ticketsystem disable` | Reset and disable the ticket system |
| `/ticketpanel` | Create/preview a panel in the builder |
| `/panel-label` | Change published menu/button text |

## Panel Builder

The builder draft is private until published. It supports up to 15 blocks.

- **Add text / embed / image embed**
- **Edit / delete / move / preview** selected block
- **Design**: switch button/dropdown and automatic/manual draft
- **Ticket categories**: one per line, `Name|Emoji`, `Name|Description|Emoji`, or `Name`
- **Webhook / Menu text**: sender name/avatar, menu/button text, button emoji
- **Log channel**: select the private ticket log channel
- **Publish / Update**: publishes panel blocks and control message

Placeholders: `{servername}`, `{servericon}` / `{serveravatar}`, `{space}`.

## Ticket Behavior

- Opening a ticket asks for **subject** and **description**.
- Ticket channel access is given to the ticket owner, configured support roles, and the bot.
- **Claim**: support roles / managers only.
- **Close**: ticket owner or support roles / managers.
- **Reopen / Delete / Transcript**: support roles / managers.
- Closed tickets should be deleted before the same user opens a new one.
- Auto-close checks run hourly; durations like `24h` / `3d` are supported, `disable` turns it off.
- On close, the log channel gets a detailed log embed plus HTML and TXT transcript files (up to 2000 recent messages).

## Tests

```powershell
bun run test
```

Tests use mocked Discord/MongoDB interactions.

## Security

See [SECURITY.md](SECURITY.md). Keep `.env` private and do not commit secrets.
