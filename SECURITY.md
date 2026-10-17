# Security model

Last security review: 2026-10-16. English UI update: 2026-10-17. This covers source review and mocked regression tests, not live penetration testing or a guarantee of zero vulnerabilities.

## Authorization

| Action | Requirements |
| --- | --- |
| Management commands/autocomplete | Current server-level Manage Channels permission; Administrator qualifies |
| Setup forms | Current management permission, setup owner and valid session |
| Panel drafts | Current management permission, matching server and draft owner |
| Publish/change label | The above plus View Channel and Send Messages in the target channel |
| Open ticket | Current membership, registered bot panel and user-bound single-use form |
| Close own ticket | Ownership and channel access |
| Claim/reopen/delete/transcript | Current support role or management permission, plus channel access |
| History search | Management permission and read access to the log channel |

Discord command defaults are backed by runtime checks. Membership/guild permissions are refreshed through REST. A channel-specific Manage Channels grant does not grant management of the entire bot. Verification failures deny access.

## Privacy

- Ticket overwrites deny @everyone and explicitly allow the owner, support roles and bot.
- @everyone and integration-managed roles cannot be support roles.
- Discord Administrator bypasses channel overwrites; administrators can see private tickets by design.
- Transcript targets must exclude everyone outside support/management. Role and member exceptions are checked before delivery, including changes to existing log channels.
- Transcripts contain at most 2,000 recent messages. Direct requests are private to the requester. User images are not downloaded to the bot host; unrelated channel names are not resolved for transcripts.
- Mentions are disabled by default; opening explicitly permits only the owner and selected support roles.
- `.env` and installed packages are excluded from Git. Errors do not print tokens, passwords or the MongoDB URI.
- The English UI update does not automatically rewrite saved custom content. Legacy placeholder aliases remain valid.

## Concurrency and limits

- Atomic MongoDB reservations enforce one ticket per user; a unique guildId index initializes before Discord login.
- Failed creation is rolled back. If channel deletion fails, its record is kept for staff recovery.
- Manual/automatic ticket actions share process-local locks; publishing and label updates are locked per server.
- Run one process per token. Multi-process deployments require a shared lock service for action/publishing locks; creation reservations are already database-backed.
- Ticket forms are bound to user, server, panel/channel and a single-use token, expiring after five minutes.
- Setup expires after five minutes; panel drafts after 30 minutes. Open sessions are bounded.
- Per-user/per-server limits: five management commands/10 seconds, three ticket forms/30 seconds, two creations/minute and one transcript/30 seconds.
- Cache misses/access errors do not discard live ticket records. Abandoned reservations without channels can be recovered after at least 15 minutes.

## Validation

`bun run test` runs builder, security and English-UI regression tests without a live token/database. Cases include unauthorized/revoked access, setup ownership, @everyone rejection, private overwrites, outsider/owner action boundaries, forged/stale/wrong-user/replayed forms, atomic creation, rollback, private-log exceptions, cache errors and request limits.

The 2026-10-16 `bun audit --json` scan returned `{}` and exit code 0: no matching known advisories at that time. Direct dependencies are pinned to tested versions; the frozen lockfile was verified with an offline, scripts-disabled install. Run `bun audit` again for a current report.
Live Discord/MongoDB end-to-end testing was not performed. Scope the MongoDB account to the bot database and restrict network access to the bot host where possible.
