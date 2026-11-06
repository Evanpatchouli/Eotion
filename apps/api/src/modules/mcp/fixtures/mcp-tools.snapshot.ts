/** Static MCP listTools contract captured from built source 1950ec2 through the official Client over InMemoryTransport. Expectations stay independent of source Zod exports. */
type ToolContractSnapshot = {
  name: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export const MCP_TOOL_CONTRACT_SNAPSHOT: ToolContractSnapshot[] = [
  {
    "name": "eotion_create_page",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "parentPageId": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 128
            },
            {
              "type": "null"
            }
          ]
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "blocks": {
          "default": [],
          "maxItems": 1000,
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "paragraph"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "heading"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "level": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 6
                  }
                },
                "required": [
                  "type",
                  "text",
                  "level"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "todo"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "checked": {
                    "type": "boolean"
                  }
                },
                "required": [
                  "type",
                  "text",
                  "checked"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "code"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "language": {
                    "type": "string",
                    "maxLength": 128
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "callout"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "icon": {
                    "default": "💡",
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 32,
                    "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
                  },
                  "tone": {
                    "default": "neutral",
                    "type": "string",
                    "enum": [
                      "neutral",
                      "info",
                      "warning"
                    ]
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "divider"
                  },
                  "text": {
                    "type": "string",
                    "const": ""
                  }
                },
                "required": [
                  "type"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "bulleted-list"
                  },
                  "items": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "items"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "numbered-list"
                  },
                  "items": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "start": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "maximum": 9007199254740991
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "items"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "quote"
                  },
                  "paragraphs": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type"
                ],
                "additionalProperties": false
              }
            ]
          }
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "workspaceId",
        "title",
        "idempotencyKey"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "workspaceId": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "parentPageId": {
          "type": [
            "string",
            "null"
          ]
        },
        "updatedAt": {
          "type": "string"
        },
        "blocks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "paragraph",
                  "heading",
                  "bulleted-list",
                  "numbered-list",
                  "todo",
                  "quote",
                  "code",
                  "image",
                  "file",
                  "divider",
                  "toggle",
                  "callout",
                  "table",
                  "database"
                ]
              },
              "text": {
                "type": "string"
              },
              "items": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "paragraphs": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "level": {
                "type": "integer",
                "minimum": 1,
                "maximum": 6
              },
              "checked": {
                "type": "boolean"
              },
              "language": {
                "type": "string"
              },
              "start": {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              "fileId": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "mimeType": {
                "type": "string"
              },
              "size": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "icon": {
                "type": "string",
                "minLength": 1,
                "maxLength": 32,
                "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
              },
              "tone": {
                "type": "string",
                "enum": [
                  "neutral",
                  "info",
                  "warning"
                ]
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "viewId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "rows": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "maxItems": 200,
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "id": {
                "type": "string"
              },
              "parentBlockId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "depth": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "summary": {
                "minItems": 1,
                "maxItems": 1,
                "type": "array",
                "items": {
                  "$ref": "#/$defs/__schema0"
                }
              }
            },
            "required": [
              "type",
              "text",
              "id"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "id",
        "workspaceId",
        "title",
        "parentPageId",
        "updatedAt",
        "blocks"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "$defs": {
        "__schema0": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "paragraph",
                "heading",
                "bulleted-list",
                "numbered-list",
                "todo",
                "quote",
                "code",
                "image",
                "file",
                "divider",
                "toggle",
                "callout",
                "table",
                "database"
              ]
            },
            "text": {
              "type": "string"
            },
            "items": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "paragraphs": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "level": {
              "type": "integer",
              "minimum": 1,
              "maximum": 6
            },
            "checked": {
              "type": "boolean"
            },
            "language": {
              "type": "string"
            },
            "start": {
              "type": "integer",
              "minimum": -9007199254740991,
              "maximum": 9007199254740991
            },
            "fileId": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "mimeType": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "icon": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
            },
            "tone": {
              "type": "string",
              "enum": [
                "neutral",
                "info",
                "warning"
              ]
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "viewId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "rows": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "maxItems": 200,
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "entries": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "parts": {
                    "type": "array",
                    "items": {
                      "$ref": "#/$defs/__schema0"
                    }
                  }
                },
                "required": [
                  "parts"
                ],
                "additionalProperties": false
              }
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/__schema0"
              }
            }
          },
          "required": [
            "type",
            "text"
          ],
          "additionalProperties": false
        }
      }
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_create_property",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "type": {
          "type": "string",
          "enum": [
            "title",
            "text",
            "number",
            "checkbox",
            "select",
            "date",
            "relation",
            "rollup",
            "formula"
          ]
        },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              }
            },
            "required": [
              "id",
              "name"
            ],
            "additionalProperties": false
          }
        },
        "config": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "name",
        "type"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "property": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "type": {
              "type": "string",
              "enum": [
                "title",
                "text",
                "number",
                "checkbox",
                "select",
                "date",
                "relation",
                "rollup",
                "formula"
              ]
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "options": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 200
                  }
                },
                "required": [
                  "id",
                  "name"
                ],
                "additionalProperties": false
              }
            },
            "config": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {}
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "name",
            "type",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "property"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_create_record",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "properties": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "additionalProperties": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "number"
              },
              {
                "type": "boolean"
              },
              {
                "type": "null"
              },
              {
                "maxItems": 50,
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                }
              },
              {
                "type": "object",
                "properties": {
                  "start": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "end": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "timeZone": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  }
                },
                "required": [
                  "start"
                ],
                "additionalProperties": false
              }
            ]
          }
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "title"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "record": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "pageId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "properties": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "additionalProperties": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  },
                  {
                    "maxItems": 50,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 256
                    }
                  },
                  {
                    "type": "object",
                    "properties": {
                      "start": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "end": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "timeZone": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    },
                    "required": [
                      "start"
                    ],
                    "additionalProperties": false
                  }
                ]
              }
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "pageVersion": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "pageId",
            "properties",
            "version",
            "createdAt",
            "updatedAt",
            "pageVersion"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "record"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_create_view",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "type": {
          "type": "string",
          "enum": [
            "table",
            "list",
            "board",
            "timeline"
          ]
        },
        "config": {
          "type": "object",
          "properties": {
            "filters": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "operator": {
                    "type": "string",
                    "enum": [
                      "is",
                      "is_not",
                      "contains",
                      "does_not_contain",
                      "is_empty",
                      "is_not_empty",
                      "eq",
                      "ne",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "checked",
                      "unchecked",
                      "before",
                      "after"
                    ]
                  },
                  "value": {
                    "anyOf": [
                      {
                        "type": "string",
                        "maxLength": 2000
                      },
                      {
                        "type": "number"
                      }
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "operator"
                ],
                "additionalProperties": false
              }
            },
            "sorts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "direction": {
                    "type": "string",
                    "enum": [
                      "asc",
                      "desc"
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "direction"
                ],
                "additionalProperties": false
              }
            },
            "visibleProperties": {
              "anyOf": [
                {
                  "maxItems": 100,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  }
                },
                {
                  "type": "null"
                }
              ]
            },
            "propertyOrder": {
              "anyOf": [
                {
                  "maxItems": 100,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  }
                },
                {
                  "type": "null"
                }
              ]
            },
            "options": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {}
            }
          },
          "required": [
            "filters",
            "sorts",
            "visibleProperties",
            "propertyOrder"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "name",
        "type"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "view": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "type": {
              "type": "string",
              "enum": [
                "table",
                "list",
                "board",
                "timeline"
              ]
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "config": {
              "type": "object",
              "properties": {
                "filters": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "operator": {
                        "type": "string",
                        "enum": [
                          "is",
                          "is_not",
                          "contains",
                          "does_not_contain",
                          "is_empty",
                          "is_not_empty",
                          "eq",
                          "ne",
                          "gt",
                          "gte",
                          "lt",
                          "lte",
                          "checked",
                          "unchecked",
                          "before",
                          "after"
                        ]
                      },
                      "value": {
                        "anyOf": [
                          {
                            "type": "string",
                            "maxLength": 2000
                          },
                          {
                            "type": "number"
                          }
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "operator"
                    ],
                    "additionalProperties": false
                  }
                },
                "sorts": {
                  "maxItems": 10,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "direction": {
                        "type": "string",
                        "enum": [
                          "asc",
                          "desc"
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "direction"
                    ],
                    "additionalProperties": false
                  }
                },
                "visibleProperties": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "propertyOrder": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "options": {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {}
                }
              },
              "required": [
                "filters",
                "sorts",
                "visibleProperties",
                "propertyOrder"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "name",
            "type",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "view"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_get_database_schema",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        }
      },
      "required": [
        "workspaceId",
        "databaseId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "properties": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "workspaceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "type": {
                "type": "string",
                "enum": [
                  "title",
                  "text",
                  "number",
                  "checkbox",
                  "select",
                  "date",
                  "relation",
                  "rollup",
                  "formula"
                ]
              },
              "version": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "createdAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "updatedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "options": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
                    },
                    "name": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    }
                  },
                  "required": [
                    "id",
                    "name"
                  ],
                  "additionalProperties": false
                }
              },
              "config": {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {}
              }
            },
            "required": [
              "id",
              "databaseId",
              "workspaceId",
              "name",
              "type",
              "version",
              "createdAt",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "views": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "workspaceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "type": {
                "type": "string",
                "enum": [
                  "table",
                  "list",
                  "board",
                  "timeline"
                ]
              },
              "version": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "createdAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "updatedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "config": {
                "type": "object",
                "properties": {
                  "filters": {
                    "maxItems": 20,
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "propertyId": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 256
                        },
                        "operator": {
                          "type": "string",
                          "enum": [
                            "is",
                            "is_not",
                            "contains",
                            "does_not_contain",
                            "is_empty",
                            "is_not_empty",
                            "eq",
                            "ne",
                            "gt",
                            "gte",
                            "lt",
                            "lte",
                            "checked",
                            "unchecked",
                            "before",
                            "after"
                          ]
                        },
                        "value": {
                          "anyOf": [
                            {
                              "type": "string",
                              "maxLength": 2000
                            },
                            {
                              "type": "number"
                            }
                          ]
                        }
                      },
                      "required": [
                        "propertyId",
                        "operator"
                      ],
                      "additionalProperties": false
                    }
                  },
                  "sorts": {
                    "maxItems": 10,
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "propertyId": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 256
                        },
                        "direction": {
                          "type": "string",
                          "enum": [
                            "asc",
                            "desc"
                          ]
                        }
                      },
                      "required": [
                        "propertyId",
                        "direction"
                      ],
                      "additionalProperties": false
                    }
                  },
                  "visibleProperties": {
                    "anyOf": [
                      {
                        "maxItems": 100,
                        "type": "array",
                        "items": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 256
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "propertyOrder": {
                    "anyOf": [
                      {
                        "maxItems": 100,
                        "type": "array",
                        "items": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 256
                        }
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "options": {
                    "type": "object",
                    "propertyNames": {
                      "type": "string"
                    },
                    "additionalProperties": {}
                  }
                },
                "required": [
                  "filters",
                  "sorts",
                  "visibleProperties",
                  "propertyOrder"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "id",
              "databaseId",
              "workspaceId",
              "name",
              "type",
              "version",
              "createdAt",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "capabilities": {
          "type": "object",
          "properties": {
            "viewTypes": {
              "maxItems": 4,
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "table",
                  "list",
                  "board",
                  "timeline"
                ]
              }
            },
            "supportsTemporaryFiltersAndSorts": {
              "type": "boolean",
              "const": true
            }
          },
          "required": [
            "viewTypes",
            "supportsTemporaryFiltersAndSorts"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "properties",
        "views",
        "capabilities"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_get_page",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": [
        "pageId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "workspaceId": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "parentPageId": {
          "type": [
            "string",
            "null"
          ]
        },
        "updatedAt": {
          "type": "string"
        },
        "blocks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "paragraph",
                  "heading",
                  "bulleted-list",
                  "numbered-list",
                  "todo",
                  "quote",
                  "code",
                  "image",
                  "file",
                  "divider",
                  "toggle",
                  "callout",
                  "table",
                  "database"
                ]
              },
              "text": {
                "type": "string"
              },
              "items": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "paragraphs": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "level": {
                "type": "integer",
                "minimum": 1,
                "maximum": 6
              },
              "checked": {
                "type": "boolean"
              },
              "language": {
                "type": "string"
              },
              "start": {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              "fileId": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "mimeType": {
                "type": "string"
              },
              "size": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "icon": {
                "type": "string",
                "minLength": 1,
                "maxLength": 32,
                "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
              },
              "tone": {
                "type": "string",
                "enum": [
                  "neutral",
                  "info",
                  "warning"
                ]
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "viewId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "rows": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "maxItems": 200,
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "id": {
                "type": "string"
              },
              "parentBlockId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "depth": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "summary": {
                "minItems": 1,
                "maxItems": 1,
                "type": "array",
                "items": {
                  "$ref": "#/$defs/__schema0"
                }
              }
            },
            "required": [
              "type",
              "text",
              "id"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "id",
        "workspaceId",
        "title",
        "parentPageId",
        "updatedAt",
        "blocks"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "$defs": {
        "__schema0": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "paragraph",
                "heading",
                "bulleted-list",
                "numbered-list",
                "todo",
                "quote",
                "code",
                "image",
                "file",
                "divider",
                "toggle",
                "callout",
                "table",
                "database"
              ]
            },
            "text": {
              "type": "string"
            },
            "items": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "paragraphs": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "level": {
              "type": "integer",
              "minimum": 1,
              "maximum": 6
            },
            "checked": {
              "type": "boolean"
            },
            "language": {
              "type": "string"
            },
            "start": {
              "type": "integer",
              "minimum": -9007199254740991,
              "maximum": 9007199254740991
            },
            "fileId": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "mimeType": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "icon": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
            },
            "tone": {
              "type": "string",
              "enum": [
                "neutral",
                "info",
                "warning"
              ]
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "viewId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "rows": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "maxItems": 200,
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "entries": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "parts": {
                    "type": "array",
                    "items": {
                      "$ref": "#/$defs/__schema0"
                    }
                  }
                },
                "required": [
                  "parts"
                ],
                "additionalProperties": false
              }
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/__schema0"
              }
            }
          },
          "required": [
            "type",
            "text"
          ],
          "additionalProperties": false
        }
      }
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_get_record",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "recordId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "recordId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "pageId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "properties": {
          "type": "object",
          "propertyNames": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "additionalProperties": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "number"
              },
              {
                "type": "boolean"
              },
              {
                "type": "null"
              },
              {
                "maxItems": 50,
                "type": "array",
                "items": {
                  "type": "string",
                  "maxLength": 256
                }
              },
              {
                "type": "object",
                "properties": {
                  "start": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "end": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 64
                  },
                  "timeZone": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  }
                },
                "required": [
                  "start"
                ],
                "additionalProperties": false
              }
            ]
          }
        },
        "version": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "createdAt": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        },
        "updatedAt": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        },
        "pageVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        }
      },
      "required": [
        "id",
        "databaseId",
        "workspaceId",
        "pageId",
        "properties",
        "version",
        "createdAt",
        "updatedAt",
        "pageVersion"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_list_databases",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "cursor": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "limit": {
          "default": 25,
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "workspaceId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "items": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "workspaceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "version": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "createdAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "updatedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              }
            },
            "required": [
              "id",
              "workspaceId",
              "name",
              "version",
              "createdAt",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_list_pages",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "cursor": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "limit": {
          "default": 50,
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "workspaceId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "workspaceId": {
                "type": "string"
              },
              "title": {
                "type": "string"
              },
              "parentPageId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "updatedAt": {
                "type": "string"
              }
            },
            "required": [
              "id",
              "workspaceId",
              "title",
              "parentPageId",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "nextCursor": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_list_workspaces",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "workspaces": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "name": {
                "type": "string"
              }
            },
            "required": [
              "id",
              "name"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "workspaces"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_query_database",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "viewId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "cursor": {
          "type": "string",
          "minLength": 1,
          "maxLength": 16384
        },
        "limit": {
          "default": 25,
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "filters": {
          "maxItems": 20,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "propertyId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "operator": {
                "type": "string",
                "enum": [
                  "is",
                  "is_not",
                  "contains",
                  "does_not_contain",
                  "is_empty",
                  "is_not_empty",
                  "eq",
                  "ne",
                  "gt",
                  "gte",
                  "lt",
                  "lte",
                  "checked",
                  "unchecked",
                  "before",
                  "after"
                ]
              },
              "value": {
                "anyOf": [
                  {
                    "type": "string",
                    "maxLength": 2000
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "propertyId",
              "operator"
            ],
            "additionalProperties": false
          }
        },
        "sorts": {
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "propertyId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "direction": {
                "type": "string",
                "enum": [
                  "asc",
                  "desc"
                ]
              }
            },
            "required": [
              "propertyId",
              "direction"
            ],
            "additionalProperties": false
          }
        },
        "propertyIds": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          }
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "viewId"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "view": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "type": {
              "type": "string",
              "enum": [
                "table",
                "list",
                "board",
                "timeline"
              ]
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "config": {
              "type": "object",
              "properties": {
                "filters": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "operator": {
                        "type": "string",
                        "enum": [
                          "is",
                          "is_not",
                          "contains",
                          "does_not_contain",
                          "is_empty",
                          "is_not_empty",
                          "eq",
                          "ne",
                          "gt",
                          "gte",
                          "lt",
                          "lte",
                          "checked",
                          "unchecked",
                          "before",
                          "after"
                        ]
                      },
                      "value": {
                        "anyOf": [
                          {
                            "type": "string",
                            "maxLength": 2000
                          },
                          {
                            "type": "number"
                          }
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "operator"
                    ],
                    "additionalProperties": false
                  }
                },
                "sorts": {
                  "maxItems": 10,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "direction": {
                        "type": "string",
                        "enum": [
                          "asc",
                          "desc"
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "direction"
                    ],
                    "additionalProperties": false
                  }
                },
                "visibleProperties": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "propertyOrder": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "options": {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {}
                }
              },
              "required": [
                "filters",
                "sorts",
                "visibleProperties",
                "propertyOrder"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "name",
            "type",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "properties": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "workspaceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "type": {
                "type": "string",
                "enum": [
                  "title",
                  "text",
                  "number",
                  "checkbox",
                  "select",
                  "date",
                  "relation",
                  "rollup",
                  "formula"
                ]
              },
              "version": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "createdAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "updatedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "options": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 256
                    },
                    "name": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 200
                    }
                  },
                  "required": [
                    "id",
                    "name"
                  ],
                  "additionalProperties": false
                }
              },
              "config": {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {}
              }
            },
            "required": [
              "id",
              "databaseId",
              "workspaceId",
              "name",
              "type",
              "version",
              "createdAt",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "records": {
          "maxItems": 100,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "workspaceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "pageId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "properties": {
                "type": "object",
                "propertyNames": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                "additionalProperties": {
                  "anyOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "number"
                    },
                    {
                      "type": "boolean"
                    },
                    {
                      "type": "null"
                    },
                    {
                      "maxItems": 50,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "object",
                      "properties": {
                        "start": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 64
                        },
                        "end": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 64
                        },
                        "timeZone": {
                          "type": "string",
                          "minLength": 1,
                          "maxLength": 128
                        }
                      },
                      "required": [
                        "start"
                      ],
                      "additionalProperties": false
                    }
                  ]
                }
              },
              "version": {
                "type": "integer",
                "exclusiveMinimum": 0,
                "maximum": 9007199254740991
              },
              "createdAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "updatedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              },
              "pageVersion": {
                "type": "string",
                "minLength": 1,
                "maxLength": 64
              }
            },
            "required": [
              "id",
              "databaseId",
              "workspaceId",
              "pageId",
              "properties",
              "version",
              "createdAt",
              "updatedAt",
              "pageVersion"
            ],
            "additionalProperties": false
          }
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 16384
            },
            {
              "type": "null"
            }
          ]
        },
        "effectiveQuery": {
          "type": "object",
          "properties": {
            "filters": {
              "maxItems": 20,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "operator": {
                    "type": "string",
                    "enum": [
                      "is",
                      "is_not",
                      "contains",
                      "does_not_contain",
                      "is_empty",
                      "is_not_empty",
                      "eq",
                      "ne",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "checked",
                      "unchecked",
                      "before",
                      "after"
                    ]
                  },
                  "value": {
                    "anyOf": [
                      {
                        "type": "string",
                        "maxLength": 2000
                      },
                      {
                        "type": "number"
                      }
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "operator"
                ],
                "additionalProperties": false
              }
            },
            "sorts": {
              "maxItems": 10,
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "direction": {
                    "type": "string",
                    "enum": [
                      "asc",
                      "desc"
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "direction"
                ],
                "additionalProperties": false
              }
            },
            "propertyIds": {
              "maxItems": 100,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              }
            }
          },
          "required": [
            "filters",
            "sorts",
            "propertyIds"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "view",
        "properties",
        "records",
        "nextCursor",
        "effectiveQuery"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_rename_database",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "name"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_resolve_relation_records",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "search"
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "search": {
              "type": "string",
              "maxLength": 200
            },
            "cursor": {
              "type": "string",
              "minLength": 1,
              "maxLength": 16384
            },
            "limit": {
              "default": 25,
              "type": "integer",
              "minimum": 1,
              "maximum": 50
            }
          },
          "required": [
            "mode",
            "workspaceId",
            "databaseId"
          ],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "mode": {
              "type": "string",
              "const": "resolve"
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "recordIds": {
              "maxItems": 50,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              }
            }
          },
          "required": [
            "mode",
            "workspaceId",
            "databaseId",
            "recordIds"
          ],
          "additionalProperties": false
        }
      ]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "items": {
          "maxItems": 50,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "recordId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "pageId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "title": {
                "type": "string"
              }
            },
            "required": [
              "recordId",
              "pageId",
              "title"
            ],
            "additionalProperties": false
          }
        },
        "nextCursor": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 16384
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_search_pages",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "query": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "cursor": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "limit": {
          "default": 20,
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      },
      "required": [
        "workspaceId",
        "query"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string"
              },
              "workspaceId": {
                "type": "string"
              },
              "title": {
                "type": "string"
              },
              "parentPageId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "updatedAt": {
                "type": "string"
              }
            },
            "required": [
              "id",
              "workspaceId",
              "title",
              "parentPageId",
              "updatedAt"
            ],
            "additionalProperties": false
          }
        },
        "nextCursor": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "items",
        "nextCursor"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_update_page",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pageId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "expectedUpdatedAt": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "title": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "blocks": {
          "maxItems": 1000,
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "paragraph"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "heading"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "level": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 6
                  }
                },
                "required": [
                  "type",
                  "text",
                  "level"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "todo"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "checked": {
                    "type": "boolean"
                  }
                },
                "required": [
                  "type",
                  "text",
                  "checked"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "code"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "language": {
                    "type": "string",
                    "maxLength": 128
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "callout"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  },
                  "icon": {
                    "default": "💡",
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 32,
                    "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
                  },
                  "tone": {
                    "default": "neutral",
                    "type": "string",
                    "enum": [
                      "neutral",
                      "info",
                      "warning"
                    ]
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "divider"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "text": {
                    "type": "string",
                    "const": ""
                  }
                },
                "required": [
                  "type"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "bulleted-list"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "items": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "items"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "numbered-list"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "items": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "start": {
                    "type": "integer",
                    "exclusiveMinimum": 0,
                    "maximum": 9007199254740991
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type",
                  "items"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "quote"
                  },
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "paragraphs": {
                    "minItems": 1,
                    "maxItems": 1000,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 100000
                    }
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 100000
                  }
                },
                "required": [
                  "type"
                ],
                "additionalProperties": false
              }
            ]
          }
        }
      },
      "required": [
        "pageId",
        "expectedUpdatedAt",
        "idempotencyKey"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "workspaceId": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "parentPageId": {
          "type": [
            "string",
            "null"
          ]
        },
        "updatedAt": {
          "type": "string"
        },
        "blocks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "type": {
                "type": "string",
                "enum": [
                  "paragraph",
                  "heading",
                  "bulleted-list",
                  "numbered-list",
                  "todo",
                  "quote",
                  "code",
                  "image",
                  "file",
                  "divider",
                  "toggle",
                  "callout",
                  "table",
                  "database"
                ]
              },
              "text": {
                "type": "string"
              },
              "items": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "paragraphs": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "level": {
                "type": "integer",
                "minimum": 1,
                "maximum": 6
              },
              "checked": {
                "type": "boolean"
              },
              "language": {
                "type": "string"
              },
              "start": {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              "fileId": {
                "type": "string"
              },
              "name": {
                "type": "string"
              },
              "mimeType": {
                "type": "string"
              },
              "size": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "icon": {
                "type": "string",
                "minLength": 1,
                "maxLength": 32,
                "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
              },
              "tone": {
                "type": "string",
                "enum": [
                  "neutral",
                  "info",
                  "warning"
                ]
              },
              "databaseId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "viewId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "rows": {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "maxItems": 200,
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                }
              },
              "id": {
                "type": "string"
              },
              "parentBlockId": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "depth": {
                "type": "integer",
                "minimum": 0,
                "maximum": 9007199254740991
              },
              "summary": {
                "minItems": 1,
                "maxItems": 1,
                "type": "array",
                "items": {
                  "$ref": "#/$defs/__schema0"
                }
              }
            },
            "required": [
              "type",
              "text",
              "id"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "id",
        "workspaceId",
        "title",
        "parentPageId",
        "updatedAt",
        "blocks"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false,
      "$defs": {
        "__schema0": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": [
                "paragraph",
                "heading",
                "bulleted-list",
                "numbered-list",
                "todo",
                "quote",
                "code",
                "image",
                "file",
                "divider",
                "toggle",
                "callout",
                "table",
                "database"
              ]
            },
            "text": {
              "type": "string"
            },
            "items": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "paragraphs": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "level": {
              "type": "integer",
              "minimum": 1,
              "maximum": 6
            },
            "checked": {
              "type": "boolean"
            },
            "language": {
              "type": "string"
            },
            "start": {
              "type": "integer",
              "minimum": -9007199254740991,
              "maximum": 9007199254740991
            },
            "fileId": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "mimeType": {
              "type": "string"
            },
            "size": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "icon": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[^\\u0000-\\u001f\\u007f-\\u009f]*$"
            },
            "tone": {
              "type": "string",
              "enum": [
                "neutral",
                "info",
                "warning"
              ]
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "viewId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "rows": {
              "maxItems": 1000,
              "type": "array",
              "items": {
                "maxItems": 200,
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            },
            "entries": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "parts": {
                    "type": "array",
                    "items": {
                      "$ref": "#/$defs/__schema0"
                    }
                  }
                },
                "required": [
                  "parts"
                ],
                "additionalProperties": false
              }
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/__schema0"
              }
            }
          },
          "required": [
            "type",
            "text"
          ],
          "additionalProperties": false
        }
      }
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_update_property",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "propertyId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedPropertyVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "options": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              }
            },
            "required": [
              "id",
              "name"
            ],
            "additionalProperties": false
          }
        },
        "config": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "propertyId",
        "expectedPropertyVersion"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "property": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "type": {
              "type": "string",
              "enum": [
                "title",
                "text",
                "number",
                "checkbox",
                "select",
                "date",
                "relation",
                "rollup",
                "formula"
              ]
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "options": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 200
                  }
                },
                "required": [
                  "id",
                  "name"
                ],
                "additionalProperties": false
              }
            },
            "config": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {}
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "name",
            "type",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "property"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_update_record_cell",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "recordId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "propertyId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "value": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "type": "null"
            },
            {
              "maxItems": 50,
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              }
            },
            {
              "type": "object",
              "properties": {
                "start": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                },
                "end": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64
                },
                "timeZone": {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 128
                }
              },
              "required": [
                "start"
              ],
              "additionalProperties": false
            }
          ]
        },
        "expectedRecordVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "expectedPageUpdatedAt": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "recordId",
        "propertyId",
        "value",
        "expectedRecordVersion"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "record": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "pageId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "properties": {
              "type": "object",
              "propertyNames": {
                "type": "string",
                "minLength": 1,
                "maxLength": 256
              },
              "additionalProperties": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "null"
                  },
                  {
                    "maxItems": 50,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "maxLength": 256
                    }
                  },
                  {
                    "type": "object",
                    "properties": {
                      "start": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "end": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 64
                      },
                      "timeZone": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 128
                      }
                    },
                    "required": [
                      "start"
                    ],
                    "additionalProperties": false
                  }
                ]
              }
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "pageVersion": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "pageId",
            "properties",
            "version",
            "createdAt",
            "updatedAt",
            "pageVersion"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "record"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    }
  },
  {
    "name": "eotion_update_view",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "databaseId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedDatabaseVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128
        },
        "viewId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "expectedViewVersion": {
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 9007199254740991
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "config": {
          "type": "object",
          "properties": {
            "filters": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "operator": {
                    "type": "string",
                    "enum": [
                      "is",
                      "is_not",
                      "contains",
                      "does_not_contain",
                      "is_empty",
                      "is_not_empty",
                      "eq",
                      "ne",
                      "gt",
                      "gte",
                      "lt",
                      "lte",
                      "checked",
                      "unchecked",
                      "before",
                      "after"
                    ]
                  },
                  "value": {
                    "anyOf": [
                      {
                        "type": "string",
                        "maxLength": 2000
                      },
                      {
                        "type": "number"
                      }
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "operator"
                ],
                "additionalProperties": false
              }
            },
            "sorts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "propertyId": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  },
                  "direction": {
                    "type": "string",
                    "enum": [
                      "asc",
                      "desc"
                    ]
                  }
                },
                "required": [
                  "propertyId",
                  "direction"
                ],
                "additionalProperties": false
              }
            },
            "visibleProperties": {
              "anyOf": [
                {
                  "maxItems": 100,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  }
                },
                {
                  "type": "null"
                }
              ]
            },
            "propertyOrder": {
              "anyOf": [
                {
                  "maxItems": 100,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 256
                  }
                },
                {
                  "type": "null"
                }
              ]
            },
            "options": {
              "type": "object",
              "propertyNames": {
                "type": "string"
              },
              "additionalProperties": {}
            }
          },
          "required": [
            "filters",
            "sorts",
            "visibleProperties",
            "propertyOrder"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "workspaceId",
        "databaseId",
        "expectedDatabaseVersion",
        "idempotencyKey",
        "viewId",
        "expectedViewVersion"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "database": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            }
          },
          "required": [
            "id",
            "workspaceId",
            "name",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        "view": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "databaseId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "workspaceId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 256
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            },
            "type": {
              "type": "string",
              "enum": [
                "table",
                "list",
                "board",
                "timeline"
              ]
            },
            "version": {
              "type": "integer",
              "exclusiveMinimum": 0,
              "maximum": 9007199254740991
            },
            "createdAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "updatedAt": {
              "type": "string",
              "minLength": 1,
              "maxLength": 64
            },
            "config": {
              "type": "object",
              "properties": {
                "filters": {
                  "maxItems": 20,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "operator": {
                        "type": "string",
                        "enum": [
                          "is",
                          "is_not",
                          "contains",
                          "does_not_contain",
                          "is_empty",
                          "is_not_empty",
                          "eq",
                          "ne",
                          "gt",
                          "gte",
                          "lt",
                          "lte",
                          "checked",
                          "unchecked",
                          "before",
                          "after"
                        ]
                      },
                      "value": {
                        "anyOf": [
                          {
                            "type": "string",
                            "maxLength": 2000
                          },
                          {
                            "type": "number"
                          }
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "operator"
                    ],
                    "additionalProperties": false
                  }
                },
                "sorts": {
                  "maxItems": 10,
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "propertyId": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      },
                      "direction": {
                        "type": "string",
                        "enum": [
                          "asc",
                          "desc"
                        ]
                      }
                    },
                    "required": [
                      "propertyId",
                      "direction"
                    ],
                    "additionalProperties": false
                  }
                },
                "visibleProperties": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "propertyOrder": {
                  "anyOf": [
                    {
                      "maxItems": 100,
                      "type": "array",
                      "items": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 256
                      }
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "options": {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {}
                }
              },
              "required": [
                "filters",
                "sorts",
                "visibleProperties",
                "propertyOrder"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "id",
            "databaseId",
            "workspaceId",
            "name",
            "type",
            "version",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "database",
        "view"
      ],
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": true,
      "idempotentHint": true,
      "openWorldHint": false
    }
  }
];
