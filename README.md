# Discord Ticket Bot

A multi-server discord.js and MongoDB/Mongoose ticket bot with an English interface. Built-in commands, forms, buttons, replies and console messages remain English regardless of the user's Discord language.

Repository: https://github.com/K1at3s/ticket-bot
Original ticket workflow: https://github.com/K1at3s/XelosV14

## Installation

```powershell
bun install --frozen-lockfile
Copy-Item .env.example .env
```

Set `DISCORD_TOKEN` and `MONGODB_URI`. `MONGODB_DATABASE` defaults to `ticket_bot`. Keep `.env` private.
Enable Message Content Intent in the Discord Developer Portal for transcript contents. Invite the bot with the `bot` and `applications.commands` scopes.

The bot needs View Channel, Manage Channels, Manage Roles (for channel permission overwrites), Send Messages, Read Message History, Embed Links and Attach Files in the ticket category. Publishing webhook content also requires Manage Webhooks in the panel channel.

```powershell
bun run start
```

The XelosV14-style handler registers commands globally at startup. No separate deploy step is needed. Restart after command changes; Discord may take a short time to refresh its command list. Development: `bun run dev`.

## Commands

All management commands require current server-level Manage Channels permission, checked in both Discord metadata and application code.

| Command | Purpose |
| --- | --- |
| `/ticketsystem setup` | Select category, panel channel, button/select method and support roles |
| `/ticketsystem edit` | Edit the saved panel and its blocks |
| `/ticketsystem config` | Set a private log channel and inactivity duration |
| `/ticketsystem search` | Search a user's closed tickets in the latest 100 log messages |
| `/ticketsystem auto-response add/remove/list` | Manage messages sent when tickets open |
| `/ticketsystem disable` | Reset and disable the ticket system |
| `/ticketpanel` | Open the builder for a channel and button/select control |
| `/panel-label` | Change only the published menu placeholder or button label |

Category options use one line per option: `Name|Emoji`, `Name||Emoji`, `Name|Optional description|Emoji`, or just `Name`. Descriptions are optional. @everyone and integration-managed roles cannot be support roles.

## Panel builder

Setup ends with **Open panel builder**. No default embed is posted automatically.

- **Add text:** a separate Markdown message, up to 2,000 characters.
- **Add embed:** optional title, description, image URL and HEX color. At least a title, description or image is required.
- **Add image embed:** an image using setImage, with optional color and no automatic title/description.
- Select a block to edit, delete, preview or move up/down.
- **Webhook / Menu text:** set the sender name/avatar and menu/button text.
- **Publish / Update:** send each block as a separate webhook message in order, followed by the bot's component-only control message.

A panel supports 15 blocks; embed descriptions support 4,000 characters. With no blocks, only the bot menu/button is sent. Nothing is posted until publishing.
Saved panels can be reopened. Changing order, block count or sender identity recreates tracked header messages to preserve order, with the menu last. Publishing to another channel does not remove that channel's previous panel.
Drafts last 30 minutes or until restart. Only their creator can edit them; a new draft replaces that user's previous draft in the same server.

### Placeholders and spacing

- `{servername}`: server name.
- `{servericon}` or `{serveravatar}`: server icon URL; no custom avatar if the server has no icon.
- `{space}`: invisible U+200B character in the message above an embed.

Direct names/avatar URLs are accepted. Legacy aliases remain supported for saved panels. Webhook tokens are managed by the bot and are not stored in MongoDB.
The optional **Message above embed / spacing** field is message content above the embed, not its description. Leave it empty for an embed-only message. Line breaks are preserved. Two invisible lines can be entered as:

```text
{space}
{space}
```

Visible spacing depends on Discord's layout/font settings; fixed pixel spacing is not available.

## Tickets

Members open a ticket and submit a subject. Explicit channel access is limited to the owner, support roles and bot; Discord administrators can bypass channel overwrites.
Staff can claim, reopen, delete and export tickets. Owners can close their own ticket. A closed channel must be deleted before that user opens another ticket.
Inactivity durations use `24h` or `3d`; `disable` turns automatic closing off. The checker runs hourly. Transcripts include up to 2,000 recent messages and go only to an authorized requester or verified private log channel.
Inherited auto-responses are sent on opening; no keyword listener is implemented.

## Tests and security

```powershell
bun run test
bun audit
```

Tests use mocked Discord/MongoDB calls, not a live bot/database. Coverage includes builder ordering/editing, revoked permissions, form ownership/replay, duplicate creation, private logs, rollback and the English UI.
Run one bot process per token: creation reservations are database-atomic, while action/publishing locks are process-local.
See [SECURITY.md](SECURITY.md) and [CHANGELOG.md](CHANGELOG.md). `.env` and installed packages are excluded from Git.
After updating, restart and open new forms. Existing custom panel text, category names and already-posted messages are not automatically translated; edit and republish them as needed.
