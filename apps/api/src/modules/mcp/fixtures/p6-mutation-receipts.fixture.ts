/** Actual committed receipts produced through tools/call using the historical
 * DocumentMutationService at 2aad764b1c5028c9ed2175da8f02d1871d42b2bc.
 * Old source SHA256: 3c1aa5f82e052f16e822fc2796117c1b1cc9e9106cc99588bd933407c25a1aed.
 * See p6-mutation-receipts.provenance.json; never regenerate with the current runner.
 */
export const P6_LEGACY_RECEIPTS = [
  {
    "tool": "eotion_create_page",
    "idempotencyKey": "p6-legacy-create-static",
    "requestHash": "d316d94a1353622fac112c2c0161170900a1f2c364975e1a415a7da9bca05b03",
    "payload": {
      "workspaceId": "mcp-write-a-one",
      "parentPageId": null,
      "title": "Legacy P6 create",
      "idempotencyKey": "p6-legacy-create-static",
      "blocks": [
        {
          "type": "paragraph",
          "text": "from P6"
        }
      ]
    },
    "result": {
      "id": "49f64c77-b87c-4571-b16d-f970ddcfd011",
      "workspaceId": "mcp-write-a-one",
      "title": "Legacy P6 create",
      "parentPageId": null,
      "updatedAt": "2026-10-26T03:03:58.503Z",
      "blocks": [
        {
          "type": "paragraph",
          "text": "from P6",
          "id": "d04a63d4-5102-4b7d-8746-61a42a41677b",
          "parentBlockId": null,
          "depth": 0
        }
      ]
    }
  },
  {
    "tool": "eotion_update_page",
    "idempotencyKey": "p6-legacy-update-static",
    "requestHash": "a8a6480a023aa6b1d8871ea4e3b80e23cf19a9a82b62a2784437d65ea92876f4",
    "payload": {
      "pageId": "c35d5a68-4a52-4532-9be2-d79bea14d9b5",
      "expectedUpdatedAt": "2026-10-26T03:03:58.587Z",
      "title": "Legacy P6 updated",
      "blocks": [
        {
          "id": "6c436b3b-d6a7-4714-be65-455e1bec5140",
          "type": "paragraph",
          "text": "updated by P6"
        }
      ],
      "idempotencyKey": "p6-legacy-update-static"
    },
    "result": {
      "id": "c35d5a68-4a52-4532-9be2-d79bea14d9b5",
      "workspaceId": "mcp-write-a-one",
      "title": "Legacy P6 updated",
      "parentPageId": null,
      "updatedAt": "2026-10-26T03:03:58.692Z",
      "blocks": [
        {
          "type": "paragraph",
          "text": "updated by P6",
          "id": "6c436b3b-d6a7-4714-be65-455e1bec5140",
          "parentBlockId": null,
          "depth": 0
        }
      ]
    }
  }
] as const;
