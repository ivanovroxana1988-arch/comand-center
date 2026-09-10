# Command Center MCP — implementation and rollout

Implemented in this repository: JSON-RPC over stateless HTTP POST at `/mcp`, six task tools and `get_change_status`, task/subtask relationships, and durable change proposals stored in the existing D1 database.

## Confirmation contract

`create_task`, `update_task`, `create_subtask`, and `complete_task` prepare a proposal; they do NOT immediately mutate tasks. Responses contain before/after, expiry and a confirmation link. Only the proposing, signed-in user can approve or cancel through the same-origin HTML form. The agent must not submit that form for the user. A write is successful only after `get_change_status` returns `applied`. A plain “yes” in chat is not yet an implemented approval mechanism.

Proposals expire after 15 minutes. SQL batches atomically claim, mutate and record the result; retries return the saved receipt. Approval rejects changes to the target since the proposal, including edits made at the same timestamp. Parent tasks cannot complete with unfinished children. Reparenting is intentionally unsupported.

## Security boundary

The Sites adapter trusts only identity forwarded by Sites dispatch. The current Site access policy must stay private for Bogdan and Roxana. It grants both read and propose/approve capabilities to authenticated allowed visitors. Core service tests separately verify read-only scopes. OAuth scope mapping is NOT implemented by this adapter; do not claim distinct OAuth grants are configured.

Do not expose this adapter behind an arbitrary proxy or trust caller-supplied identity headers. Do not put Site bypass tokens, repository credentials or authentication secrets in plugin URLs. Existing browser task CRUD remains separate from the proposal-only MCP entrypoint.

## Platform connection — pending verification

Archive validation accepted `capabilities: ["mcp"]`. Version 4 was successfully published on 2026-09-10, with the existing private audience unchanged. The connector then returned: `Sites MCP is not enabled for this Site owner.` This is a platform feature availability restriction, not a missing server implementation or a user browser setting. No MCP connection URL or OAuth resource was returned. Do not bypass this restriction using Site bypass tokens or by changing the Site audience.

Connection remains blocked until the platform enables Sites MCP for this owner. After that, request the actual `mcp_url` and `oauth_resource` from Sites, connect through the browser UI, and complete acceptance checks below. Developer mode being enabled does not establish Sites MCP availability. Authenticated remote MCP behavior, per-user OAuth scopes and fresh-chat tool discovery remain unverified.

## Local checks

Run `node --test tests/mcp.test.mjs`. Tests use a fresh SQLite database and the actual checked-in migrations; production records are never test fixtures. Run the normal Site build. These checks do not establish end-to-end OAuth or ChatGPT connectivity.

## Acceptance after publication

1. Sites returns the actual MCP connection metadata.
2. An anonymous caller cannot read or write tasks; an unauthorized user is denied.
3. A fresh ChatGPT chat discovers all tools after the user connects the application.
4. A test proposal leaves tasks unchanged before approval, can be cancelled, and applies once on approval.
5. Task reads match the dashboard database, and repeat approvals create no duplicates.
6. Confirm the actual browser client and OAuth behavior for both collaborators before calling rollout complete.
