export interface McpTokenMetadata {
  id: string
  name: string
  createdAt: string
}

export interface CreatedMcpToken {
  token: string
  credential: McpTokenMetadata
}

export interface McpTokenContext {
  userId: string
}
