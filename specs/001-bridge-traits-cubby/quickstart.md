# Quickstart: Testing the Trait Extraction Bridge

To test the newly bridged `candidate-processor.ts` integration locally:

1. Clone `HR-2026-E2E`
2. Spin up a local CEF Cubby mock server (if applicable) or point your local `.env` to the staging CEF endpoint.
3. Post a mock candidate webhook payload (simulating Wellfound or Join.com).
   ```bash
   curl -X POST http://localhost:3000/webhook/wellfound \
        -H "Content-Type: application/json" \
        -d @mock-payloads/wellfound-candidate.json
   ```
4. Verify the Notion entry was created.
5. Query the `hiring-traits` Cubby via `CubbyClient` or your local mock storage to confirm that the `TraitSignal` was correctly written, matching the candidate's ID, and containing zero PII.
