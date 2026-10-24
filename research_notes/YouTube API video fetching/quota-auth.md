# YouTube Data API v3 quota, cost, and authentication

Research date: 21 October 2026. Scope is read access for an LMS that looks up public lesson videos. Uploading and live streaming are listed only where their quota buckets change the shared pool.

Source labels used below:

- **Documented** — text retrieved from a Google page on this date.
- **Historical official** — a Google page or Issue Tracker reply whose date is earlier than the current quota model.
- **Conflict** — two passages on current Google pages disagree; both are quoted.
- No Stack Overflow or blog numbers are used as quota figures. Where a number is missing from a retrieved page, it is listed under Gaps rather than filled in.

Pages whose “Last updated” line was retrieved: YouTube Data API Overview, 2026-10-15 UTC; YouTube API Services Developer Policies, 2026-10-15 UTC. The Quota Calculator page itself timed out on two direct fetches; its table is taken from Google’s indexed copy of that URL returned by search on 21 October 2026, and is cross-checked against method pages that did load in full.

## Is the API free, what is the default daily quota, and how do you get more?

### Takeaway

As of the pages current on 21 October 2026, YouTube Data API v3 is still a quota system, not a published price list. Enabling it gives three default daily buckets: 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units for every other method. More quota is requested through a compliance audit, not by buying units. The shared 10,000-unit default is still documented; what changed on 1 June 2026 is that search and upload left that shared pool.

### Cited Findings

- Projects that enable the YouTube Data API have a default allocation of 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints. Daily quotas reset at midnight Pacific Time. Usage is shown on the Quotas page in the Google Cloud console. Default quota “is subject to change.” — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**, last updated 2026-10-15 UTC); same three numbers — [Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits); same three numbers and the midnight PT reset — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) (indexed copy).
- The overview’s own examples of cost, on the same 2026-10-15 page: a read that lists channels, videos, or playlists usually costs 1 unit; a write that creates, updates, or deletes a resource usually costs 50 units; a search query costs 1 unit; a video upload costs 1 unit. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- `search.list` and `videos.insert` have their own quota buckets. Each has a default daily limit of 100. The quota cost is 1 per call. All other methods are charged to the existing bucket. — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) (indexed copy); [Revision History, 1 June 2026](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- `search.list` method page: “Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Search Queries quota bucket.” — [Search: list](https://developers.google.com/youtube/v3/docs/search/list) (**Documented**, full page retrieved). The reference URL that loaded was `https://developers.google.com/youtube/data/reference/rest/v3/search/list`; it is the same method.
- 1 June 2026 revision: the API “is transitioning to a granular quota system covering smaller sets of methods, starting with `videos.insert` and `search.list`.” The stated reason is so YouTube can verify quota-increase requests against specific method usage. Developers request more through the Quota Extension Form. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- Quota beyond the default requires an audit against the YouTube API Services Terms of Service, via the YouTube API Services - Audit and Quota Extension Form. A compliant audit within the last 12 months can be followed by another extension request on the same form. A failed audit can be appealed. YouTube also runs periodic audits, and a change of control of a project requires a separate form. Approved extra quota may be used only for the approved use case; a changed use case needs a new audit. — [Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits); [Developer Policies, III.D.4 Usage and Quotas](https://developers.google.com/youtube/terms/developer-policies) (**Documented**, policies last updated 2026-10-15 UTC).
- The audit form states that all requests for additional quota must go through a compliance audit, and that an application must show “significant independent value to the YT ecosystem and its users.” Applications that cannot meet the requirements “may not be granted additional quota.” — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**, form text retrieved 21 October 2026).
- Inactivity: YouTube may disable or curtail access, revoke credentials, or reduce or eliminate quotas if an API project is inactive for 90 consecutive days. The developer may reapply. — [Developer Policies, III.D.4 Inactivity](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- Creating extra Google Cloud projects to obtain more quota for one use case (“sharding”) is prohibited. Separate projects are allowed for genuinely separate clients, including one production server project and one development server project. Each API client must have exactly one API project. — [Complying with YouTube's Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) (indexed extract); [Developer Policies, III.D.1.c](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- **Historical official, 9 November 2020:** a Google Issue Tracker reply marked Won’t Fix says there is no cost for using the YouTube API, that the default is 10,000 units per day, that this default is subject to change, and that there were then “no plans to increase the 10,000 default quota.” Increases were already by a quota extension form. — [Issue Tracker 172776504](https://issuetracker.google.com/issues/172776504) (**Historical official**). That reply does not mention separate search or upload buckets.
- **Conflict:** the Quota Calculator’s auto-generated page summary still says methods such as `videos.insert` have the highest cost of 1,600 points. The table on the same indexed page, the 1 June 2026 revision, and the 15 October 2026 overview all say `videos.insert` is 1 unit in a 100-call bucket. The 4 December 2025 revision is the bridge: upload cost was changed “from approximately 1600 units to approximately 100 units,” and the 1 June 2026 change then moved uploads into their own bucket at 1 per call. — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost); [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Conflict**; the table plus revision history are the later statements).

### Inferences

- No 2026 page retrieved here lists a dollar price, a SKU, or a self-serve paid tier. The operational path to more than the default is the audit form. Treat “free with a quota” as the model the current docs describe, and treat the explicit sentence “there is no cost” as a 2020 Issue Tracker statement that has not been reissued in the 2026 pages reviewed.
- For an LMS, the June 2026 split is the practical change. Public metadata reads (`videos.list`, `playlistItems.list`, `playlists.list`, `channels.list`) still draw on 10,000 units. Search does not. One hundred searches a day is the default ceiling even though each search is now 1 unit.
- The older planning rule “search costs 100, so 10,000 units is 100 searches” produced the same daily search count. It is the wrong accounting after 1 June 2026, because those searches no longer spend the 10,000-unit pool.

### Gaps

- No Google Cloud pricing page stating a 2026 price of $0, or any other price, for YouTube Data API v3 was retrieved. Absence of a price in the API docs is not the same as a billing-console screenshot.
- No archived official page was retrieved that states, in those words, that `search.list` cost 100 units before 1 June 2026. The 100-call default after the split matches that old arithmetic; the pre-change unit cost itself is not quoted from a primary page in this note.
- The form does not publish approval timelines, acceptance rates, or the quota sizes Google typically grants.

## What does each read method cost?

### Takeaway

After 1 June 2026, `search.list` costs 1 unit in a bucket whose default is 100 calls a day. `videos.list`, `playlistItems.list`, `playlists.list`, and `channels.list` each cost 1 unit from the shared 10,000-unit pool. `captions.list` costs 50 units from that same pool. `captions.download` costs 200 units and is not a substitute for listing public caption tracks.

### Cited Findings

Costs below are one call, from the Quota Calculator table unless another page is named. The calculator says every request, including an invalid one, costs at least one point. — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) (**Documented**, indexed table).

| Method | Documented cost | Bucket |
| --- | --- | --- |
| `search.list` | 1 unit per call; default 100 calls/day | Search Queries. Also on the method page. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list) |
| `videos.list` | 1 | Shared 10,000. Method page: “A call to this method has a quota cost of 1 unit.” — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list) |
| `videos.getRating` | 1 | Shared pool |
| `videos.batchGetStats` | 1 unit in its own bucket; default 10,000 units/day | Separate from the shared pool. Added 3 June 2026. — [Revision History](https://developers.google.com/youtube/v3/revision_history) |
| `playlistItems.list` | 1 | Shared pool |
| `playlists.list` | 1 | Shared pool |
| `channels.list` | 1 | Shared pool |
| `channelSections.list` | 1 | Shared pool |
| `activities.list` | 1 | Shared pool |
| `comments.list` | 1 | Shared pool |
| `commentThreads.list` | 1 | Shared pool |
| `subscriptions.list` | 1 | Shared pool |
| `videoCategories.list` | 1 | Shared pool |
| `videoAbuseReportReasons.list` | 1 | Shared pool |
| `guideCategories.list`, `i18nLanguages.list`, `i18nRegions.list` | 1 each | Shared pool |
| `members.list`, `membershipsLevels.list`, `superChatEvents.list` | 1 each | Shared pool; not needed for public lesson lookup |
| `captions.list` | 50 | Shared pool |
| `captions.download` | 200 | Method page, not the calculator table excerpt. — [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download) |
| `captions.insert` / `update` / `delete` | 400 / 450 / 50 | Shared pool. Write methods; listed only so they are not confused with `captions.list`. |
| `videos.insert` | 1 unit per call; default 100 calls/day | Own bucket. Not used for fetching lessons. |
| `videos.update`, `videos.rate`, `videos.reportAbuse`, `videos.delete` | 50 each | Shared pool |
| `playlists.insert` / `update` / `delete`, `playlistItems.insert` / `update` / `delete` | 50 each | Shared pool |

- A new page of results is another call. The calculator says that if a method such as `search.list` returns multiple pages, each request for an additional page incurs that method’s quota cost again. — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost) (**Documented**).
- `search.list` tells developers not to use it to list a channel’s latest uploads. Use `playlistItems.list` on the channel’s uploads playlist. Search results for one channel are also capped at 500 videos when `channelId` is set, `type=video`, and none of `forContentOwner`, `forDeveloper`, or `forMine` is set. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list) (**Documented**).
- `videos.list` `id` is a comma-separated list of video IDs, so one call can request multiple videos. The retrieved parameter text does not state a maximum count of IDs. `maxResults` on `videos.list` applies with `myRating` (1 to 50, default 5) and is not supported with `id`. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list) (parameter extract).

### Inferences

- An LMS that already knows video IDs should call `videos.list`, not `search.list`. At 1 unit per call against 10,000, the metadata pool is about four orders of magnitude larger than the 100-search bucket.
- An LMS that knows a channel or a playlist should walk `playlistItems.list` (1 unit per page) instead of searching. That is what the search method page itself recommends for recent uploads, and it avoids the 100-search cap.
- `captions.list` at 50 units is a poor fit for bulk subtitle discovery, and `captions.download` at 200 units is only available when the caller can edit the video (see OAuth section). Neither is a general way to pull captions for other people’s public lesson videos.
- `videos.batchGetStats` (1 June-adjacent, 3 June 2026) is a separate 10,000-unit bucket for statistics. It does not spend the shared metadata pool. Whether an LMS is allowed to store those statistics is a policy question, not a quota question (30-day cap on non-authorized statistics; see the audit section).

### Gaps

- The calculator table excerpt did not include `captions.download`. The 200-unit figure is from the method page only. It was not re-checked against a successfully fetched calculator HTML table.
- The maximum number of comma-separated IDs accepted by one `videos.list` call was not in the retrieved parameter text.
- `playlistItems.list` and `playlists.list` `maxResults` limits were not re-fetched as full method pages. Only their 1-unit costs were confirmed from the calculator table.

## Do page size and the part parameter change the cost?

### Takeaway

Documented cost is per call, not per item and not per `part`. One `videos.list` call is 1 unit whether the overview’s own example asks for one part or for `snippet,contentDetails,statistics,status`. Asking for the next page is a second call and costs the method price again. `maxResults` changes how many items that one call may return; it is not described as a multiplier.

### Cited Findings

- `part` is required on any request that returns a resource. It selects top-level property groups so the server does less work and the response is smaller. The overview’s purpose statement for `part` is latency and bandwidth. The same page’s quota section prices “a read operation” and “a search query,” not each part. Example 1 on that page is a single `videos.list` URL with `part=snippet,contentDetails,statistics,status`. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- `fields` further filters properties inside the parts already requested. It is described as a bandwidth control. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- `videos.list`: “A call to this method has a quota cost of 1 unit.” The sentence is not qualified by how many parts were requested. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list).
- `search.list`: one call costs 1 unit in the Search Queries bucket. `part` for search must be `snippet`. `maxResults` accepts 0 to 50, default 5. The API may return fewer items than `maxResults`. Further pages use `pageToken` / `nextPageToken`, and each of those requests is another charged call. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list); pagination rule — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost).
- `videos.list` `maxResults` is 1 to 50, default 5, and only with `myRating`, which itself requires authorization. It is not supported with `id`. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list).

### Inferences

- Requesting several parts on one `videos.list` call still costs 1 unit. That follows from the per-call wording plus the overview’s multi-part example. The current pages do not contain a separate sentence of the form “parts do not affect quota.”
- Raising `maxResults` from the default of 5 toward 50 on `search.list` does not, in any retrieved formula, multiply the 1-unit cost. It reduces how many page-calls are needed. Each extra page still costs 1 search-bucket unit, so a 50-result page and a 5-result page cost the same unit, and the smaller page burns the 100-call cap faster.
- Invalid calls still cost at least one point, so a bad `part` value (`unknownPart` / `unexpectedPart`, HTTP 400) is not free. Whether a rejected `search.list` specifically decrements the 100-call Search Queries bucket, rather than only the generic “at least one point” rule, is not spelled out.

### Gaps

- No current sentence was found that says the quota cost is identical regardless of the number of parts. The conclusion above is an inference from per-call pricing.
- No formula was found that scales cost by `maxResults` or by the number of IDs in `videos.list`. Absence of a multiplier is not a statement that Google’s servers ignore response size for abuse controls.

## Rate limits, 403 quotaExceeded, 403 forbidden, 400 invalid, and backoff

### Takeaway

The Data API error reference distinguishes a quota miss (`403 quotaExceeded`) from an authorization miss (`403 forbidden`) and from a malformed request (`400` with reasons such as `invalidPart` or `invalidPageToken`). It does not publish a queries-per-second cap for `search.list` or `videos.list`. A YouTube-specific backoff schedule was not on the pages retrieved. Do not copy retry numbers from Google’s separate “Developer Knowledge” API guide onto this API.

### Cited Findings

- Core errors: `403` / `forbidden` — “Access forbidden. The request may not be properly authorized.” `403` / `quotaExceeded` — “The request cannot be completed because you have exceeded your quota.” — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**, full page retrieved).
- Common `400 badRequest` reasons include `incompatibleParameters`, `invalidFilters`, `invalidPageToken`, `missingRequiredParameter`, `unexpectedParameter`. Request-context `400` reasons include `invalidPart`, `unexpectedPart`, `unknownPart`, `invalidRegionCode`, `invalidLanguage`. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- `401 unauthorized` / `authorizationRequired` when `mine` is used without proper authorization. `401` / `youtubeSignupRequired` when the Google account has no YouTube channel. The same error is “commonly seen if you try to use the OAuth 2.0 Service Account flow.” The error page states that YouTube does not support service accounts. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- `403` / `insufficientPermissions` — the OAuth token’s scopes are insufficient. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- `captions.list` can return `403 forbidden` when permissions are insufficient to retrieve the tracks, and `404` `videoNotFound` or `captionNotFound`. `captions.download` can return `403 forbidden` when permissions are insufficient, and `400` `couldNotConvert` when `tfmt` or `tlang` cannot be applied. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- Method-specific rate errors that were actually in the error reference: `videos.reportAbuse` returns `400` / `rateLimitExceeded` (“too many requests in a given timeframe”); `thumbnails.set` returns `429` / `uploadRateLimitExceeded`. These are not the lesson-lookup methods. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- Daily quotas reset at midnight Pacific Time. — [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost); [Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- The quota-extension form asks for “Peak Per Min Quota” as well as “Total Per Day Quota” and a written justification. That is a field on the request form, not a published default per-minute cap. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- A different Google product page, “Error handling, rate limiting, and quota management” under Developer Knowledge, describes HTTP 429 and a truncated exponential backoff formula `min(max_delay, initial_delay * (2 ^ attempt) + jitter)` with examples of 1 second initial delay and 32 second cap. That page’s status table is about the Developer Knowledge API (`INVALID_ARGUMENT`, document paths, `BatchGetDocuments`). It is not the YouTube Data API error reference. — [Developer Knowledge error handling](https://developers.google.com/knowledge/error-handling-and-limits) (**Documented for a different API**; not a YouTube quota figure).

### Inferences

- On `403 quotaExceeded`, retrying immediately spends more of a bucket that is already empty. The documented recovery points are the midnight PT reset, or an approved extension. Backoff does not create units.
- On `400` invalid-parameter errors, the request is wrong. The error reference does not say to retry it unchanged. Those calls still cost at least one point, so a retry loop on `400` burns quota.
- On `403 forbidden` or `403 insufficientPermissions`, the caller needs a different credential or scope, or is asking for a private resource. That is not the search bucket being empty.
- Because no QPS number for Data API v3 list methods was found, an LMS should not invent one. The form’s “peak per minute” field only shows that Google asks about burst rate when someone requests an extension.

### Gaps

- No YouTube Data API page retrieved here gives a queries-per-second or queries-per-100-seconds limit for `search.list`, `videos.list`, or `playlistItems.list`.
- No YouTube Data API page retrieved here specifies a retry count, jitter range, or “do not retry quotaExceeded” procedure. Recommending a particular backoff schedule would be outside the sources.
- `userRateLimitExceeded` did not appear in the general-error tables of the retrieved errors page. It is not reported here as a current reason code.

## Where keys are created, and why a server-side LMS should restrict by IP

### Takeaway

Create the key in the Google Cloud console for a project that has YouTube Data API enabled. A standard API key identifies the project for quota; it does not identify a user. Google Cloud allows one application restriction per key: HTTP referrer, IP address, Android app, or iOS app. A server that calls the API without a browser `Referer` header matches the IP restriction, not the website restriction.

### Cited Findings

- Setup sequence on the overview: a Google account; a project in the Google Developers Console; authorization credentials; YouTube Data API must appear on the project’s Enabled APIs page (enable it from the API Library if it does not); OAuth only if the app calls methods that need user authorization. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- Credentials page: two credential types. OAuth 2.0 when the request needs private user data. An API key when the request does not send an OAuth token. The key “identifies your project and provides API access, quota, and reports.” Create it with Create credentials > API key, then Restrict key before production. — [Obtaining authorization credentials](https://developers.google.com/youtube/registering_an_application) (search extract of that page, **Documented**).
- Every Data API request must send either an API key (`key` parameter) or an OAuth 2.0 token. The token may be `access_token` or `Authorization: Bearer`. — [API Reference](https://developers.google.com/youtube/v3/docs) via [the REST reference](https://developers.google.com/youtube/data/reference/rest) (**Documented**, full reference page retrieved).
- Cloud console key types: a standard API key does not authenticate a principal; it associates the request with a project for billing and quota. That “billing and quota” sentence is general Google Cloud text, not a YouTube price. Authorization keys bound to service accounts are a different product and are not how YouTube Data API user authorization works. YouTube’s own error page says service accounts are unsupported. — [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys); [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).
- One client-restriction type per key: `browserKeyRestrictions` (HTTP referrers), `serverKeyRestrictions` (caller IP addresses: IPv4, IPv6, or CIDR), `androidKeyRestrictions` (package name plus signing certificate), `iosKeyRestrictions` (bundle IDs). Android and iOS cannot share one restricted key. — [Adding restrictions to API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys) (**Documented**, Google Cloud, not YouTube-specific).
- Cloud best practices: add restrictions; do not put the key in client code or a repository; the client should call your server, and the server should attach the credential; prefer the `x-goog-api-key` header over a query parameter because the key then appears in the URL. — [Best practices for managing API keys](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices) (**Documented**, Google Cloud generally). YouTube’s own reference still documents the `key` query parameter. — [API Reference](https://developers.google.com/youtube/data/reference/rest) (**Documented**). Both are current Google instructions aimed at different layers.
- Developer policies: credentials are created in the Google Developers Console at `https://console.cloud.google.com/`. Do not share credentials with a third party or embed them in an open-source project. Agents may hold them only under a written confidentiality duty. — [Developer Policies, III.D.1](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).

### Inferences

- Restrict a server-side LMS key by the server’s public egress IP (or CIDR), and also restrict the API target to YouTube Data API v3. An HTTP-referrer restriction expects a browser `Referer`. Server-to-server calls typically do not send one, so a referrer-only key fails from the LMS backend. An Android or iOS restriction likewise does not match a server.
- An IP restriction limits replay of a leaked key to those addresses. It does not hide the key if the key is still shipped to browsers. The Cloud best-practice page says the server should add the credential. That is the reason to keep the YouTube key on the LMS server rather than in front-end JavaScript.
- The header-versus-query advice is Cloud-wide. YouTube samples still show `key=`. Either can work; the header avoids putting the secret in URLs, logs, and history. This note does not claim YouTube rejects the query form.

### Gaps

- The YouTube registering-an-application page was not fetched in full. Restriction type names are from the Google Cloud API Keys documents, which apply to API keys generally, not from a YouTube page that says “restrict YouTube keys to IP.”
- No retrieved page states that localhost or private RFC1918 addresses are rejected specifically for YouTube. A Maps security page discusses public source addresses and NAT; that was not used as a YouTube rule.

## API key versus OAuth, and which scopes matter

### Takeaway

An API key is enough for public `search.list` and public `videos.list`. OAuth is required for the signed-in user’s private data, for any insert/update/delete, and for caption download. `youtube.readonly` is the read scope for the user’s own account. `youtube.force-ssl` is the scope the caption-download method lists. YouTube does not support service-account OAuth for this API.

### Cited Findings

- List methods can be called unauthorized or authorized. Unauthorized list calls return public data. Authorized list calls can also return information that is private to the authenticated user. Insert, update, and delete always require user authorization. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started) (**Documented**).
- The policies’ own example: an API client can search for public videos with no user authorization, and needs user authorization to upload to the user’s channel. The IFrame Player API, which embeds a video, also needs no user login. — [Developer Policies, III.D.2](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- JavaScript quickstart: create an API key for requests that do not need user authorization, “for example” information about a public channel; create an OAuth web client for requests that do, “for example” the authenticated user’s channel (`channels.list` with `mine=true`), which uses scope `https://www.googleapis.com/auth/youtube.readonly`. — [JavaScript quickstart](https://developers.google.com/youtube/v3/quickstart/js) (search extract, **Documented**).
- Scopes listed for Data API v3, with Google’s descriptions: `https://www.googleapis.com/auth/youtube` “Manage your YouTube account”; `https://www.googleapis.com/auth/youtube.readonly` “View your YouTube account”; `https://www.googleapis.com/auth/youtube.force-ssl` “See, edit, and permanently delete your YouTube videos, ratings, comments and captions”; `https://www.googleapis.com/auth/youtube.upload` “Manage your YouTube videos”; `https://www.googleapis.com/auth/youtubepartner` “View and manage your assets and associated content on YouTube”; `https://www.googleapis.com/auth/youtubepartner-channel-audit` for partner audit data; `https://www.googleapis.com/auth/youtube.channel-memberships.creator` for channel members. — [OAuth 2.0 for Web Server Applications](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) (same table on the installed-apps guide) (**Documented**).
- Policies tell clients that only read to request the read scope, not the read-write scope, and not to request write access before a write feature exists. Public apps that use sensitive user scopes go through Google’s OAuth verification if the consent screen shows the app as unverified. — [Developer Policies, III.D.2.a.2](https://developers.google.com/youtube/terms/developer-policies); verification note — [OAuth installed-apps guide](https://developers.google.com/youtube/v3/guides/auth/installed-apps) (**Documented**).
- `search.list` filters that require authorization: `forMine`, `forDeveloper`, `forContentOwner`. A public text query does not. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list) (**Documented**).
- `videos.list` filter `myRating` (`like` or `dislike`) “can only be used in a properly authorized request.” `id` and `chart=mostPopular` are the filters described without that sentence. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list).
- `captions.download` “requires the user to have permission to edit the video.” Authorization scopes listed for that method are only `youtube.force-ssl` and `youtubepartner`. Quota cost 200. — [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download) (**Documented**). The `captions.list` response “does not contain the actual captions”; download does. — [Captions resource](https://developers.google.com/youtube/data/reference/rest/v3/captions).
- 1 September 2026: `videos.getRating` now accepts `youtube.readonly`. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**). That is a change in which scope is enough for one method, not a change to public `videos.list`.
- Service accounts: using that flow yields `youtubeSignupRequired`. — [YouTube Data API errors](https://developers.google.com/youtube/v3/docs/errors) (**Documented**).

### Inferences

- Public lesson search and public `videos.list` by video ID do not need OAuth. A restricted API key is the matching credential.
- OAuth with `youtube.readonly` is the matching credential when the LMS must read the signed-in teacher’s own channel, uploads, or private/unlisted videos. `youtube.force-ssl` is broader than that job; the policies say not to request it unless a feature needs edit or caption access.
- Caption download is not available for arbitrary public educational videos. The method requires a user who can edit that video, plus `youtube.force-ssl` or `youtubepartner`. An LMS API key cannot download those tracks.
- The exact scope list on `captions.list` was not on a page retrieved in full. The errors page shows that insufficient permission is a `403`, and the download method is explicit. Do not assume `captions.list` works with an API key against other channels’ videos.

### Gaps

- The `captions.list` authorization-scope table was not retrieved. Only the download method’s scopes and the list method’s `403` behavior were confirmed.
- Whether `playlistItems.list` on a public playlist works with an API key was not given a dedicated sentence in a fetched `playlistItems.list` page. It follows the general rule that unauthorized list calls return public data, which is an inference from the overview, not a method-page quote.
- OAuth app-verification timelines and which of these scopes Google currently treats as “sensitive” or “restricted” were not re-checked against the 2026 OAuth verification help center.

## What the quota audit actually asks for

### Takeaway

Extra quota is an audit of the client, not a billing upgrade. For an education product the form asks for player/embed screenshots. The developer policies independently forbid storing copies of YouTube audiovisual files and limit how long API metadata may be kept. Those are compliance conditions, not quota-unit prices.

### Cited Findings

- Form purpose: business identity, the API client, and how YouTube API Services are used, both for policy compliance and for quota extensions. One form is one API client. Multiple clients need separate forms. Up to 10 Cloud project numbers per form. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Required identity fields include legal name, organization legal name, website, address, country, a business category (the list includes “Education and E-Learning”), organization size, contacts, target audience, monetization, and whether there is a Google or YouTube partner manager. The client section requires the product name, a note that the name must not contain “YouTube” without prior written approval, a primary URL, a public privacy-policy URL, whether the client is publicly accessible, and optional demo-account credentials with full access. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Per project, the form asks which use-case categories apply, whether users sign in with Google (OAuth), expected volume (bands from under 1,000 requests/day through more than 10 million/day), total per-day quota, peak per-minute quota, and a justification. It points applicants at the Quota Calculator. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Required evidence uploads, per project: privacy-policy screenshots that show the YouTube sections, a link to the Google Privacy Policy, and deletion policies; a homepage screenshot showing the privacy-policy link “with YouTube branding visible”; terms-of-service documentation. Files must be JPEG, PNG, or PDF. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Conditional evidence: OAuth screenshots (consent screen, scopes, revocation) if OAuth is used; upload-interface screenshots if the use case is video uploading and account management; “Player / Embed Screenshots” if the use case is “Education & Research,” “Smart TVs, Consoles & Hardware,” or “Websites & Mobile Apps”; dashboard screenshots for internal tools or analytics. — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Audiovisual content: clients must not, and must not encourage others to, download, import, back up, cache, or store copies of YouTube audiovisual content without prior written approval; must not make that content available for offline playback; must not use the API to facilitate copyright infringement. — [Developer Policies, III.E.1](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- Non-authorized API data (data fetched without user credentials, which is the API-key case) may be stored only as long as needed and for no more than 30 calendar days, then deleted or refreshed. Statistics fetched as non-authorized data must not be stored more than 30 days. Example in the policy: do not store a channel’s subscriber count for more than 30 days without the channel owner’s authorization. Other authorized data not in the analytics/reporting/statistics exception must be deleted or refreshed after 30 days. Stored data must be kept consistent with current API data. — [Developer Policies, III.E.4.b–e](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- Clients must not replace API data with independently calculated substitutes, and must not use API data to create derived metrics, unless they fall under the separate audited-analytics allowance. — [Developer Policies, III.E.4.h](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- From 1 June 2026, audited analytics applicants can ask to amend those rules: derived metrics if labeled as the developer’s own, and storage of public stats (views, likes, comment counts) and derived metrics for up to 36 months. Titles, creator names, and comment text stay on the 30-day refresh-or-delete rule. The form says Google decides whether the use case qualifies. The policies say this allowance is only for audited developers who explicitly applied. — [Developer Policies, III.L](https://developers.google.com/youtube/terms/developer-policies); form acknowledgement text — [Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form) (**Documented**).
- Playback rules that sit next to the embed requirement: do not charge users to watch inside an embedded YouTube player; do not gate playback on a YouTube-specific action other than play (a login that the product already requires for non-YouTube reasons is called out as allowed); do not modify, build upon, or block the player; do not play YouTube audio or video from a hidden background player; do not access audiovisual content by any technology other than YouTube API Services. — [Developer Policies, III.F.3 and III.I.6, III.I.9, III.I.14](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- Search UI rule: do not modify or replace YouTube search-result text, images, or other content, and do not mix other sources into a list presented as YouTube results. Pages that show YouTube content must show YouTube brand features per the branding guidelines. — [Developer Policies, III.C.5 and III.F.2](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).
- Privacy-policy contents the policies require, which match the screenshots the form demands: a link to YouTube’s Terms of Service (`https://www.youtube.com/t/terms`) and a statement that users of the client are bound by them; the client’s privacy policy must say that it uses YouTube API Services, link to `http://www.google.com/policies/privacy`, and explain what API data is stored. If authorized data is used, the policy must link to `https://security.google.com/settings/security/permissions`. — [Developer Policies, III.A](https://developers.google.com/youtube/terms/developer-policies) (**Documented**).

### Inferences

- An LMS that only needs the default buckets does not have to pass this audit to call the API. The audit is the gate for quota above the default, and YouTube can also audit later.
- An education LMS applying for more quota should expect to show the embedded player, not a downloaded video file. The form asks for those screenshots for “Education & Research,” and III.E.1 forbids storing the audiovisual file without written approval. Metadata such as title, channel, and video ID is API data and falls under the 30-day refresh-or-delete rule when fetched with an API key.
- Keeping a lesson’s YouTube video ID and re-fetching title and thumbnail within 30 days fits the written storage rule. Caching the video file, or offering offline playback of the YouTube file, does not.

### Gaps

- The Required Minimum Functionality document was not fetched. This note therefore does not quote an RMF clause that says playback must use the IFrame player. The player obligation used here is the audit form’s screenshot requirement plus the player and audiovisual clauses in the Developer Policies.
- The form text says use-case questions “would dynamically expand” after a category is selected. The conditional screenshot rules above are what the retrieved form HTML listed. Category-specific checklists beyond those lines were not expanded.
- No retrieved page states how long an audit decision takes.

## What changed in 2024–2026, and is v3 still current?

### Takeaway

YouTube Data API v3 is the API these pages still document, with revisions through 30 September 2026 and policy pages stamped 15 October 2026. No v4 release and no v3 shutdown notice appear in the revision entries reviewed. The quota change that matters for an LMS is 1 June 2026, not a new API version.

### Cited Findings

- The revision history is titled as the history of YouTube Data API (v3). Entries continue through 30 September 2026 (comment `snippet.imageUrl`, “available to all users in November 2026”). — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- 1 June 2026: granular quota begins with `videos.insert` and `search.list` moved onto their own buckets. 3 June 2026: `videos.batchGetStats`, 1 unit, own bucket, default 10,000 units/day. 4 December 2025: video-upload quota documented as changing from about 1,600 units to about 100 units (later superseded for bucket accounting by 1 June 2026). — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- 21 July 2025 (announced 10 July 2025): `videos.list` `chart=mostPopular` stops mirroring the Trending Now list and instead returns videos from the Trending Music, Movies, and Gaming charts, alongside deprecation of YouTube’s Trending page. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- 31 March 2025: Shorts view counting changes, and `channels.statistics.viewCount` and `videos.statistics.viewCount` follow that definition. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- 30 October 2024: `status.containsSyntheticMedia` can be set on insert/update and is returned on the video resource. This is an added field, not a removal. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- Deprecations in 2024: 30 April 2024, channel discussions can no longer be inserted or retrieved. 13 March 2024, `sync` on `captions.insert` and `captions.update` deprecated and unsupported as of 12 April 2024; caption uploads must include timing. 7 March 2024, `brandingSettings.channel.moderateComments` deprecated. Earlier, still relevant to search code: `search.list` `relatedToVideoId` was deprecated 12 June 2023 and removed from the docs on 7 August 2023. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- Other 2026 additions that do not change public-read quota: 14 September 2026, thumbnail and playlist-image upload size limits raised from 2 MB to 50 MB; 11 September 2026, `fhd`, `qhd`, and `uhd` thumbnail keys documented for some videos; a `brandPartner` part on `videos` for `videos.list`, `videos.insert`, and `videos.update`. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**). The exact calendar date on the `brandPartner` entry was garbled in the fetched text (“2026” without a month adjacent to that bullet); the entry sits between 23 June 2026 and 1 September 2026.
- 1 September 2026: `videos.getRating` accepts `youtube.readonly`. — [Revision History](https://developers.google.com/youtube/v3/revision_history) (**Documented**).
- Developer Policies section III.L, the 36-month stats allowance, is explicitly “starting June 01, 2026” and only for audited analytics use cases that applied for it. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (**Documented**, last updated 2026-10-15 UTC).

### Inferences

- An LMS integration written against Data API v3 is still aimed at the current documented API. Nothing retrieved announces a v4 or a shutdown date.
- Code that still assumes `search.list` costs 100 units out of a single 10,000-unit pool is following the pre-1 June 2026 accounting. The default number of searches per day is unchanged at 100; the pool those searches draw from is not.
- `relatedToVideoId` and channel discussions should not be in new LMS code. They are already removed.

### Gaps

- The revision history file was read from September 2026 back through April 2022 in full detail, not every older year. A v4 mention buried only in pre-2022 text would have been missed. No v4 mention appears in the 2022–2026 entries that were read, and the page is still headed as v3.
- No Google blog post from 2024–2026, separate from the revision history, was fetched. The revision history is the primary changelog used here.
- Community claims of a paid tier, of a default below or above 10,000, or of a v3 shutdown were not adopted, because no such claim was needed and no primary page supported one. That is an absence of evidence in this search, not a survey of forums.
