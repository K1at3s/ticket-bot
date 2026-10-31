# Changelog

## Bilingual setup and panel templates - 2026-10-19

- Added Discord command/choice localizations and automatic Turkish/English forms and replies based on `interaction.locale`, with English as fallback. No language setting is needed.
- Replaced collector-based setup with a persistent wizard: category, panel channel, roles, control, design, categories and review.
- Added automatic two-embed templates and manual empty drafts for both button and dropdown panels; publishing remains explicit.
- Added ready-made/custom emoji categories with optional descriptions, plus category editing in the builder.
- Added a required ticket description, rich welcome embeds, native block quotes and emoji action buttons.
- Preserved saved panels, custom content, component-only messages, webhook identity placeholders and image-only embeds.
- Added regression coverage for all eight setup combinations, owner/expiry/step/permission guards and bilingual runtime forms.
- Replaced deprecated Mongoose `new: true` with `returnDocument: 'after'`.

## English interface — 2026-10-17

- Converted built-in commands, forms, buttons, replies, errors and console messages to English.
- Removed Turkish command localizations and locale-dependent replies.
- Added `{servername}`, `{servericon}`, `{serveravatar}` and `{space}`; preserved legacy aliases.
- Translated README/security documentation and added English-only interface tests.
- Existing custom content and published messages are not automatically rewritten.

## Security improvements — 2026-10-16

- Verified default/runtime Manage Channels requirements for all management commands.
- Added fresh membership/permission verification and setup ownership/expiry.
- Rejected @everyone and integration-managed support roles.
- Bound ticket forms to user/server/panel/channel with single-use nonces.
- Added atomic MongoDB creation reservations, process-local locks and request limits.
- Required private transcript targets and target-channel access.
- Limited transcripts to 2,000 messages and disabled host-side image downloads.
- Preserved records on cache/access errors and added rollback/recovery tracking.
- Disabled mentions by default, with explicit ticket-opening recipient limits.
- Pinned tested dependencies; audit reported no matching advisories.
- Added security, privacy and concurrency regression tests.
- Added optional message content above embeds, preserved line breaks and invisible spacing tokens.

## 1.0.0 — 2026-10-15

- Created the discord.js and MongoDB/Mongoose ticket bot.
- Adapted XelosV14's handler for global command registration at startup.
- Added per-server categories, support roles, panel channels and button/select setup.
- Supported optional category descriptions, names and emoji.
- Added subject forms, claiming, reasoned closure, reopening, deletion, HTML transcripts, history and inactivity closing.
- Added a 15-block builder for separate text, embeds and image embeds, with editing, previews, ordering, HEX colors and setImage.
- Published webhook headers above a separate bot control message.
- Stored settings/blocks/message IDs in MongoDB.
- Added `/ticketsystem edit`, `/ticketpanel` and `/panel-label`.

## Current limitations

- One ticket channel per user, including closed channels until deletion.
- History search scans the latest 100 log messages.
- Auto-responses run on opening; there is no keyword listener.
- Drafts expire after 30 minutes or restart.
- Publishing to another channel does not remove the old panel.
- Action/publishing locks assume a single bot process.
