export interface McpTokenMetadata {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

export interface CreatedMcpToken {
  token: string
  credential: McpTokenMetadata
}

export interface McpTokenContext {
  userId: string
}
