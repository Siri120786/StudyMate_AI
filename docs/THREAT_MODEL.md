# Threat model

What could go wrong, what stops it, and what is still open. Each defence below has a test or a check behind it unless it says otherwise.

## What we protect

1. **Students' notes and progress.** Notes can be personal or unpublished coursework.
2. **The AI quota and the keys.** The Gemini key and the Supabase service key are the most valuable secrets.
3. **Availability.** One student must not be able to use up the free AI quota for everyone.

## Who might attack, and how

| Threat | Defence | Evidence |
|---|---|---|
| **A signed-out person calls the API** | Every route requires a valid token. The only open routes are the health check and the public share page. | A test walks every route and fails if one is open by accident. |
| **A student reads another student's data** | Each query filters by the verified user id (`own_row`). The database also has row-level security, so the browser's public key can read only the caller's own rows. | The route-coverage test; `schema.sql` enables RLS on every table. A live cross-account test is still to be run once the database exists. |
| **A forged or stolen token** | Tokens are verified against Supabase's public key, with audience and issuer checked. Expired, foreign-key and wrong-audience tokens are refused. | Unit tests for each case. |
| **Spamming AI buttons** | Per-user limits: 12 AI calls a minute and 150 a day; imports 6 a minute and 40 a day; public pages per address. Answers are HTTP 429 with a `Retry-After` header. | Tests prove the 13th call in a minute is refused and that every AI and upload route has a limit. |
| **Importing a link that points at the server's own network (SSRF)** | Only public http(s) addresses; private, loopback, link-local and reserved addresses are refused, and every redirect is re-checked. | Tests for localhost, 10.x, 192.168.x, the cloud metadata address, `file://` and `ftp://`. |
| **A malicious upload** | 12 MB cap, allowed types only, text is extracted and never executed, unsupported types are refused. | Upload tests, including oversize and `.exe`. |
| **Script injection through notes or AI output** | Summaries are drawn with a Markdown renderer that does not allow raw HTML. A Content-Security-Policy allows scripts only from the app itself plus one hashed inline script. | CSP unit tests: no `unsafe-inline` or `unsafe-eval` for scripts. |
| **Clickjacking and sniffing** | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy, HSTS over HTTPS. | Header tests. |
| **Prompt injection** (notes that say "ignore your instructions") | The system prompts tell the model to use only the notes. The model's output is shown as text and never run, and it cannot call tools or read other users' data. The worst outcome is a bad summary of the attacker's own notes. | By design. Not exhaustively red-teamed. |
| **Vulnerable libraries** | Dependencies are pinned and scanned. | `pip-audit` and `npm audit`: no known vulnerabilities at the time of writing (the scan found 4 vulnerable Python packages and 2 in the router, all upgraded). |
| **Leaked secrets** | Keys live in `.env` (git-ignored) or AWS Secrets Manager. The browser build contains only the public Supabase key. Credentials for the demo account are written to an ignored file. | `.gitignore`, `.dockerignore`; the Docker image does not copy `.env`. |
| **Share links** | Links are unguessable (128-bit random), show only a summary and flashcards, and can be turned off. Importing copies the notes only on the receiver's request. | Revocation is checked on every read. |
| **Study groups** | Members see only each other's display name and weekly XP. Codes are random and exclude look-alike characters. | By design. |
| **Offline cache** | The service worker never stores `/api` responses, so signed-in data is not left on the device. | Code review of `sw.js`. |

## Known gaps (honest list)

- **Limits are per process.** With more than one server instance each counts separately, so the real ceiling is the limit times the instance count. A shared store such as Redis would fix this.
- **Tokens are valid until they expire (one hour)** even after sign-out, which is how stateless tokens work.
- **No malware scanning of uploads.** Text is extracted and not opened as a program.
- **Prompt injection is mitigated, not eliminated.** A hostile document can make its own summary unreliable.
- **Reminder notifications and the offline shell run in the browser**, and were not testable in the development environment's embedded browser.
- **The share page is readable by anyone with the link**, including search engines if the link is posted publicly.
- **AI answers can be wrong.** See [`EVALUATION.md`](EVALUATION.md) for measured behaviour and the app's own warning text.
