INSERT INTO "verification_documents" ("verification_request_id", "document_id")
SELECT request."id", evidence.document_id::UUID
FROM "verification_requests" AS request
CROSS JOIN LATERAL (
  SELECT value AS document_id
  FROM jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(request."documents_json"->'documentIds') = 'array'
      THEN request."documents_json"->'documentIds'
      ELSE '[]'::jsonb
    END
  ) AS value
  WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
) AS evidence
JOIN "documents" AS document ON document."id" = evidence.document_id::UUID
WHERE document."user_id" = request."user_id"
  AND document."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
