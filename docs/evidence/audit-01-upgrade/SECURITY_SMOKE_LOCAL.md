# Local production HTTP guards

Date: 2026-08-27 23:52 CEST  
Target: optimized local build served by `next start`, no provider call.

```text
health         status=200 cache-control=no-store body={"status":"ok"}
GET research   status=405 cache-control=no-store allow=POST code=method_not_allowed
foreign origin status=403 cache-control=no-store code=origin_rejected
bad MIME       status=415 cache-control=no-store code=content_type_required
invalid JSON   status=400 cache-control=no-store code=invalid_json
unknown field  status=400 cache-control=no-store code=unknown_field
```

The local Next.js server canonicalizes the route request origin as
`http://localhost:3100` even when reached through `127.0.0.1`; matching that
origin produced the two 400 validation results above. All malformed requests
terminated before admission and provider construction. Unit tests separately
cover declared/streamed 1,024-byte limits, Unicode normalization, cancellation,
eight requests per ten minutes, and two concurrent in-flight requests.
