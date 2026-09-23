# Agent Integration Baseline

## Goal

Make Eotion usable by compatible Agents through the Model Context Protocol (MCP), starting with Codex while keeping the interface portable across MCP clients. MCP is planned; the current API scaffold does not yet implement authentication, workspace/page operations, or an MCP server.

## Placement

- Implement MCP as an adapter in `apps/api`, within the NestJS/Fastify modular monolith.
- Reuse the same application services, domain rules, contracts, authentication, and authorization as the regular API. MCP calls must not access MongoDB or Aliyun OSS directly.
- Keep MCP transport and schema details at the API boundary. Do not add Agent-provider-specific behavior to `packages/domain` or make the Web UI responsible for MCP access.
- Choose the transport and credential flow during implementation based on supported MCP clients and the API authentication design. Keep the initial deployment in the API process; do not add a separate microservice without a demonstrated scaling or isolation need.

## Initial capability scope

Start with small, composable tools that let an Agent:

- discover available workspaces within the signed-in user's access;
- list and search pages with pagination and bounded result sizes;
- read a page and its blocks;
- create or update a page or block through explicit, typed operations.

Tool schemas should be narrow and descriptions should explain the effect of each operation. Return structured results with stable resource IDs and actionable errors. Do not expose arbitrary database queries, unbounded exports, permission changes, or destructive/bulk operations in the initial tool set. Add MCP resources or prompt templates later only when a concrete workflow needs them.

## Security and reliability

- Derive identity from the authenticated MCP connection. Check workspace membership and resource-level permissions for every operation; never treat the MCP connection itself as blanket access.
- Apply the same validation, audit trail, and rate limits as equivalent API actions. Keep credentials out of tool results and Agent-visible workspace content.
- Treat page content and other workspace data as untrusted input. Content must not grant the Agent additional permissions or override the tool's declared scope.
- Bound page sizes, search results, and response payloads. Define retry/idempotency behavior for writes so a retried call does not silently duplicate content.
- Keep deletes and other difficult-to-reverse actions out of the initial tool set until their authorization, confirmation, and audit behavior is explicit.

## Delivery checks

- Confirm read operations only return data visible to the authenticated user, including across workspace boundaries.
- Confirm write operations enforce the same permissions as the API and produce an auditable, unambiguous result.
- Exercise pagination, malformed inputs, oversized results, rate limits, connection expiry, and retried writes.
- Complete an end-to-end setup and workflow in Codex, then check interoperability with another compatible MCP client.
