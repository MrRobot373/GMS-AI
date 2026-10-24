# YouTube Data API v3 video fetching for an LMS

Retrieved 21 October 2026 from Google’s YouTube Data API reference and one live no-key oEmbed response. Quota policy beyond the cost line printed on a method page is out of scope for this note.

## What is the current base URL and version of the YouTube Data API?

### Takeaway
The current API is YouTube Data API v3. Method paths are relative to `https://www.googleapis.com/youtube/v3`, and every call sends either an API key (`key`) or an OAuth 2.0 token.

### Cited Findings
- The API reference indexes methods as “URIs relative to `https://www.googleapis.com/youtube/v3`” and was last updated 2026-09-14 UTC. Video list is `GET /videos`, search is `GET /search`, playlist items are `GET /playlistItems`, playlists are `GET /playlists`, captions list is `GET /captions`, caption download is `GET /captions/id`, channels are `GET /channels`, and video categories are `GET /videoCategories`. — [API Reference](https://developers.google.com/youtube/v3/docs)
- `videos.list` is `GET https://www.googleapis.com/youtube/v3/videos`. That page was last updated 2026-10-15 UTC. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `search.list` is `GET https://www.googleapis.com/youtube/v3/search`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Every request must specify an API key with the `key` parameter or provide an OAuth 2.0 token. An authorization token is required for every insert, update, and delete, and for any request that retrieves the authenticated user’s private data. A token may be sent as `access_token` or as `Authorization: Bearer`. — [API Reference](https://developers.google.com/youtube/v3/docs)
- List methods can serve unauthorized requests for public data and authorized requests for the authenticated user’s private data. Write operations always require user authorization. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started)
- `part` is required on requests that return a resource and names top-level property groups. `fields` can further restrict nested properties. Partial responses are mandatory in the sense that the caller must choose parts. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started)
- The overview’s sample `videos.list` JSON still uses a `videos` array, `contentDetails.aspectRatio`, `statistics.dislikeCount`, `statistics.favoriteCount`, `status.uploadStatus` value `STATUS_PROCESSED`, and `status.privacyStatus` value `PRIVACY_PUBLIC`. The current video resource uses `items`, `definition` rather than `aspectRatio`, lowercase `processed` / `public`, owner-only `dislikeCount`, and a deprecated `favoriteCount`. The overview page was also last updated 2026-10-15 UTC. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started); contradicted by the current property table in [Videos](https://developers.google.com/youtube/v3/docs/videos)

### Inferences
- Public lesson metadata (search, video hydrate, public playlists, public channels, video categories) is an API-key call. Caption download and any owner-only video part are not.
- Treat the overview code samples as stale. Use the resource property tables updated through 15 October 2026 for field names and enums.

### Gaps
- This note does not restate daily quota buckets or the 1 June 2026 granular-quota transition except where a method page itself prints a cost. See [Revision History](https://developers.google.com/youtube/v3/revision_history) and the overview’s quota section for that other research task.

## How does search.list work, and what does a search item return?

### Takeaway
`search.list` finds videos, channels, and playlists. A video hit returns an ID plus a short snippet (title, description, thumbnails, channel, publish time, live state). It does not return duration, privacy, license, embeddable status, statistics, or caption tracks. Those require `videos.list`.

### Cited Findings
- HTTP request: `GET https://www.googleapis.com/youtube/v3/search`. No request body. The method page prints: “Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Search Queries quota bucket.” — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Required `part`: the parameter text says set the value to `snippet`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `q` is the query. It supports NOT (`-`) and OR (`|`). The pipe must be URL-escaped as `%7C`. Example documented on the page: `boating|sailing -fishing`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `type` is a comma-separated list. Default is `video,channel,playlist`. Acceptable values are `channel`, `playlist`, and `video`. A non-default `order` can weaken that filter. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `videoEmbeddable` requires `type=video`. Values: `any` (embeddable or not) and `true` (only embeddable). The page does not list `false`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `safeSearch`: `moderate` (default; filters some content and at least content restricted in the locale), `none` (no filter), `strict` (tries to exclude all restricted content). Removal or demotion are both described for `moderate` and `strict`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `relevanceLanguage` is typically an ISO 639-1 two-letter code. Use `zh-Hans` or `zh-Hant` for Chinese. Results in other languages are still returned when they are highly relevant. An invalid value returns `invalidRelevanceLanguage`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `maxResults` accepts `0` to `50`, default `5`. The API may return fewer items than requested even when more results exist. Pagination must follow `nextPageToken`, not a calculated page count. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `pageToken` selects a page. The response provides `nextPageToken` and `prevPageToken`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `order` default is `relevance`. Other values: `date` (reverse chronological by creation; the page warns of index delay and says a channel’s latest uploads must be read with `playlistItems.list` on the uploads playlist, not `search.list`), `rating` (internal score, not a like-count sort), `title`, `videoCount` (channels only), `viewCount` (live broadcasts sort by concurrent viewers while live). Any order other than `relevance` can shrink or truncate the set, especially with `publishedAfter` or `publishedBefore`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `videoDuration` requires `type=video`. `any` (default), `short` (under four minutes), `medium` (four to 20 minutes, inclusive), `long` (over 20 minutes). This is a filter. The search resource has no duration field. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list); [Search](https://developers.google.com/youtube/v3/docs/search)
- `regionCode` is an ISO 3166-1 alpha-2 country code and limits results to videos that can be viewed in that country. The response echoes `regionCode`. The documented default is `US`. An unsupported region may cause YouTube to pick another region rather than `US`. Supported regions come from `i18nRegions.list`. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Other video filters that also require `type=video`: `videoCaption` (`any`, `closedCaption`, `none`), `videoCategoryId`, `videoDefinition` (`any`, `high` for at least 720p, `standard`), `videoDimension` (`2d`, `3d`, `any`), `videoLicense` (`any`, `creativeCommon`, `youtube`), `videoPaidProductPlacement` (`any`, `true`), `videoSyndicated` (`any`, `true`), `videoType` (`any`, `episode`, `movie`). — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `publishedAfter` and `publishedBefore` are RFC 3339 datetimes. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `channelId` limits results to resources created by that channel. If `channelId` is set, `type=video`, and none of `forContentOwner`, `forDeveloper`, or `forMine` is set, results are constrained to a maximum of 500 videos. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `topicId` still accepts only the curated Freebase IDs published on the method page. Behavior changed on 27 February 2017 after Freebase was deprecated. The “Other topics” entry is `/m/01k8wb` Knowledge. The published list has no ID titled Education. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `relatedToVideoId` was deprecated on 12 June 2023 and removed from the documentation on 7 August 2023. It is not in the current parameter table. — [Revision History](https://developers.google.com/youtube/v3/revision_history); [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Successful response `kind` is `youtube#searchListResponse`. It includes `etag`, `nextPageToken`, `prevPageToken`, `regionCode`, `pageInfo.totalResults`, `pageInfo.resultsPerPage`, and `items`. `pageInfo.totalResults` is an approximation, caps at 1,000,000, and must not be used to build pagination links. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Each item is a `youtube#searchResult`. The documented JSON is only `id` plus `snippet`. `id.kind` is the resource type. `id.videoId` is present when the result is a video (the property prose says `id.type`, the property name and the code samples use `id.kind` with values `youtube#video`, `youtube#channel`, and `youtube#playlist`). `id.channelId` and `id.playlistId` are the other identifiers. — [Search](https://developers.google.com/youtube/v3/docs/search); [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- `snippet` fields: `publishedAt` (ISO 8601 creation time), `channelId`, `title`, `description`, `thumbnails`, `channelTitle`, `liveBroadcastContent` (`upcoming`, `live`, `none`). For a video hit, title and description are the video’s title and description. — [Search](https://developers.google.com/youtube/v3/docs/search)
- Search thumbnail keys: `default` (120×90), `medium` (320×180), `high` (480×360), `standard` (640×480, some videos), `maxres` (1280×720, some videos). The page states that `fhd`, `qhd`, and `uhd` are not supported on search results; higher-resolution thumbnails require the resource endpoint such as `videos.list`. Higher-resolution sizes were added to the docs on 11 September 2026. — [Search](https://developers.google.com/youtube/v3/docs/search); [Revision History](https://developers.google.com/youtube/v3/revision_history)
- The search resource has no `contentDetails`, `status`, `statistics`, `player`, or `topicDetails` object. Duration, `privacyStatus`, `embeddable`, `license`, `caption`, and `definition` are properties of the video resource, not the search result. — [Search](https://developers.google.com/youtube/v3/docs/search); [Videos](https://developers.google.com/youtube/v3/docs/videos)
- The overview states that a search result points at a video, playlist, or channel and does not have its own persistent data. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started)
- Official samples on the method page call `part` as `id,snippet` (Apps Script) and `snippet` (.NET and Ruby). — [Search: list](https://developers.google.com/youtube/v3/docs/search/list)

### Inferences
- For a lesson search, the documented call shape is `part=snippet`, `type=video`, `q`, and whatever of `videoEmbeddable=true`, `safeSearch`, `relevanceLanguage`, `regionCode`, `videoDuration`, `videoCaption`, `videoCategoryId`, `maxResults`, and `pageToken` the product needs. Hydrate `id.videoId` with `videos.list` before storing duration or trusting embed, privacy, or license.
- `videoEmbeddable=true` is an index filter. The hit still does not carry `status.embeddable`.
- `videoCaption=closedCaption` is an index filter. The hit does not carry caption text or `contentDetails.caption`.

### Gaps
- The search resource page does not say whether `snippet.description` is truncated relative to the video’s 5000-byte description.
- The parameter text says `part` must be `snippet`, while an official sample sends `id,snippet`. The page does not say whether `id` is still a legal part name in October 2026.
- The page does not document a maximum number of pages, only that `totalResults` must not drive pagination and that a channel-scoped video search without an owner filter stops at 500 videos.

## How does videos.list hydrate IDs, and which fields matter for a lesson?

### Takeaway
`videos.list` with `id` and `part=snippet,contentDetails,status` is the hydrate call. It returns the lesson fields the search hit lacks: full title and description, ISO 8601 duration, thumbnails through 4K when present, `embeddable`, `privacyStatus`, `license`, caption availability, definition, `publishedAt`, `channelTitle`, and the two language fields. `player` adds embed HTML. `statistics` and `topicDetails` are optional. Caption text is not in this resource.

### Cited Findings
- `GET https://www.googleapis.com/youtube/v3/videos`. No request body. The page prints: “Quota impact: A call to this method has a quota cost of 1 unit.” Last updated 2026-10-15 UTC. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- Required `part` accepts: `brandPartner`, `contentDetails`, `fileDetails`, `id`, `liveStreamingDetails`, `localizations`, `paidProductPlacementDetails`, `player`, `processingDetails`, `recordingDetails`, `snippet`, `statistics`, `status`, `suggestions`, `topicDetails`. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- Specify exactly one filter: `chart`, `id`, or `myRating`. `id` is a comma-separated list of video IDs. `myRating` (`like` or `dislike`) requires authorization and paginates at most the most recent 1000 videos. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `maxResults` (`1` to `50`, default `5`) and `pageToken` work with `myRating` and do not work with `id`. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `chart=mostPopular` is the only chart value. `regionCode` and `videoCategoryId` apply only with `chart`. `videoCategoryId` default is `0`. As of 21 July 2025, `mostPopular` returns Trending Music, Movies, and Gaming rather than the old Trending Now list. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list); [Revision History](https://developers.google.com/youtube/v3/revision_history)
- `hl` asks for `snippet.localized` in an `i18nLanguages.list` language. If that localization is missing, `snippet.localized` falls back to the default language. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `maxHeight` and `maxWidth` (`72` to `8192`) scale `player.embedHtml`. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- Response `kind` is `youtube#videoListResponse`. `items` are video resources. `nextPageToken` and `prevPageToken` are in the response schema. A missing video can return `videoNotFound` (404). `fileDetails`, `processingDetails`, and `suggestions` return `forbidden` (403) unless the owner authorizes the call. — [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `snippet.title` max 100 characters. `snippet.description` max 5000 bytes. Both forbid `<` and `>`. `snippet.publishedAt` is ISO 8601 and is the publish time, which can differ from upload time. For a video uploaded as unlisted, it is the upload time and anyone who knows the ID can retrieve the metadata. For a private video, the owner’s read sees the upload time; the property description says a later public release uses the time it was made public. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `snippet.channelTitle`, `snippet.channelId` (this ID can change if the video is reassigned), `snippet.categoryId`, `snippet.tags`, `snippet.liveBroadcastContent` (`live`, `none`, `upcoming`). — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `snippet.defaultLanguage` is the language of `snippet.title` and `snippet.description`. `snippet.defaultAudioLanguage` is the language spoken in the default audio track. The prose also calls that property `default_audio_language`. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- Video thumbnail keys include the search sizes plus, for some videos, `fhd` (1920×1080), `qhd` (2560×1440), and `uhd` (3840×2160). — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `contentDetails.duration` is an ISO 8601 duration: `PT#M#S` under one hour (`PT15M33S` means 15 minutes 33 seconds), `PT#H#M#S` at one hour or more, `P#DT#H#M#S` at one day or more. The returned value can differ by about one second from playback because of transcoding. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `contentDetails.definition` is `hd` or `sd`. `contentDetails.dimension` is 2D or 3D. `contentDetails.caption` is the string `true` or `false`, meaning captions are or are not available. It is not the caption track. `contentDetails.licensedContent` is a boolean for content-partner claimed video. `contentDetails.projection` is `360` or `rectangular`. `contentDetails.regionRestriction` contains either `allowed` or `blocked` ISO country lists. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `status.privacyStatus`: `private`, `public`, `unlisted`. `status.license`: `creativeCommon` or `youtube`. `status.embeddable` is a boolean for whether the video can be embedded on another site. The same paragraph says that even when the uploader allows embedding, playback in an embedded player can still be blocked by platform policy or a third-party claim such as Content ID. `status.uploadStatus`: `deleted`, `failed`, `processed`, `rejected`, `uploaded`. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `status.madeForKids` is the current made-for-kids designation. `status.selfDeclaredMadeForKids` is returned only when the channel owner authorized the request. `status.containsSyntheticMedia` discloses realistic altered or synthetic content and, if set, is returned on the video resource (added 30 October 2024). — [Videos](https://developers.google.com/youtube/v3/docs/videos); [Revision History](https://developers.google.com/youtube/v3/revision_history)
- `statistics.viewCount`, `statistics.likeCount`, and `statistics.commentCount` are public statistics. From 24 August 2026, `viewCount` counts a view when playback starts, including autoplay, for long-form, Live, and Shorts. `statistics.dislikeCount` has been private since 13 December 2021 and is returned only to the video owner. `statistics.favoriteCount` has been deprecated since 28 August 2015 and is always `0`. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `player.embedHtml` is an embed tag for the video. `player.embedHeight` and `player.embedWidth` are returned only when `maxHeight` and/or `maxWidth` were set and the aspect ratio is known. Unknown aspect ratio defaults the player to 4:3. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `topicDetails.topicCategories` is a list of Wikipedia URLs describing the video. `topicDetails.topicIds` has been deprecated since 10 November 2016 and the API no longer returns it. `topicDetails.relevantTopicIds` was deprecated the same day and the page says it would be supported until 10 November 2017; the property is still listed, with the curated Freebase ID table. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `recordingDetails.recordingDate` is ISO 8601. `recordingDetails.locationDescription` and `recordingDetails.location` latitude/longitude were deprecated 1 June 2017. Altitude was deprecated 9 July 2018. — [Videos](https://developers.google.com/youtube/v3/docs/videos)
- `fileDetails`, `processingDetails`, and `suggestions` are owner-only. `contentDetails.hasCustomThumbnail` is only visible to the uploader. — [Videos](https://developers.google.com/youtube/v3/docs/videos); [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- `videos.batchGetStats` was added 3 June 2026 and returns statistics, not the snippet, duration, or status parts. The video resource page lists it. The API reference index retrieved this session, last updated 2026-09-14, does not list it in the Videos method table. — [Revision History](https://developers.google.com/youtube/v3/revision_history); [Videos](https://developers.google.com/youtube/v3/docs/videos); [API Reference](https://developers.google.com/youtube/v3/docs)
- Search uses `videoDefinition=high|standard`. The video resource uses `contentDetails.definition=hd|sd`. They are different parameter names and different enums. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list); [Videos](https://developers.google.com/youtube/v3/docs/videos)

### Inferences
- A lesson record that needs title, description, duration, thumbnails, embeddable, privacy, license, caption availability, definition, publish time, channel title, and languages is one `videos.list` call with `part=snippet,contentDetails,status`. Add `player` for official embed HTML, `statistics` for view and like counts, and `topicDetails` for Wikipedia topic URLs.
- `status.embeddable=true` is the uploader flag. The docs say it is not a guarantee that an embed will play.
- `contentDetails.caption=true` only means a caption track exists. It is not a transcript.

### Gaps
- The `videos.list` page retrieved on 21 October 2026 does not state a maximum number of comma-separated IDs.
- The page does not say whether a mixed `id` list omits unknown IDs or fails the whole call. It only documents `videoNotFound` when the video being retrieved cannot be found.
- Whether `status.embeddable` and `status.privacyStatus` are present on an API-key call for a public video is how the part is documented (not in the owner-only list). This note did not execute a live `videos.list` call.

## How do playlistItems.list and playlists.list work when a course is a YouTube playlist?

### Takeaway
`playlists.list` returns the course playlist’s title, description, privacy, item count, and embed HTML. `playlistItems.list` returns the ordered videos. Neither call returns duration or `status.embeddable`. Pass each item’s video ID to `videos.list`. A channel’s uploads are a special playlist whose ID is `contentDetails.relatedPlaylists.uploads`.

### Cited Findings
- `GET https://www.googleapis.com/youtube/v3/playlistItems`. The page prints a quota cost of 1 unit. `part` accepts `contentDetails`, `id`, `snippet`, `status`. Exactly one of `id` (playlist item IDs) or `playlistId` (the playlist). Optional: `maxResults` `0` to `50` (default `5`), `pageToken`, `videoId` (only items containing that video), and partner-only `onBehalfOfContentOwner`. — [PlaylistItems: list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- A playlist item `kind` is `youtube#playlistItem`. `snippet.publishedAt` is when the item was added (ISO 8601). `snippet.position` is zero-based. `snippet.resourceId.kind` and `snippet.resourceId.videoId` identify the video when the kind is `youtube#video`. `snippet` also has `title`, `description`, `thumbnails`, `channelTitle`, `videoOwnerChannelTitle`, `videoOwnerChannelId`, and `playlistId`. Thumbnail keys include `fhd`, `qhd`, and `uhd` for some videos. — [PlaylistItems](https://developers.google.com/youtube/v3/docs/playlistItems)
- `contentDetails.videoId` is the ID to pass as `videos.list` `id`. `contentDetails.videoPublishedAt` is ISO 8601. `contentDetails.note` is at most 280 characters. `contentDetails.startAt` and `contentDetails.endAt` are deprecated and ignored if set. — [PlaylistItems](https://developers.google.com/youtube/v3/docs/playlistItems)
- `status.privacyStatus` is the playlist item’s privacy status, set by the uploading channel through `videos.insert` or `videos.update`. The playlist-item page does not enumerate the allowed strings. — [PlaylistItems](https://developers.google.com/youtube/v3/docs/playlistItems)
- The playlist-item resource has no duration, `embeddable`, `license`, `caption`, or `definition` field. — [PlaylistItems](https://developers.google.com/youtube/v3/docs/playlistItems)
- `GET https://www.googleapis.com/youtube/v3/playlists`. The page prints a quota cost of 1 unit. `part` accepts `contentDetails`, `id`, `localizations`, `player`, `snippet`, `status`. Exactly one of `channelId`, `id`, or `mine`. `mine=true` requires authorization. `hl` requests localized metadata. — [Playlists: list](https://developers.google.com/youtube/v3/docs/playlists/list)
- The same `part` description still says the snippet contains `author`, `title`, `description`, and `timeCreated`. The playlist resource property table does not define `author` or `timeCreated`. It defines `snippet.publishedAt`, `channelId`, `title`, `description`, `thumbnails`, `channelTitle`, `defaultLanguage`, and `localized`. — [Playlists: list](https://developers.google.com/youtube/v3/docs/playlists/list); [Playlists](https://developers.google.com/youtube/v3/docs/playlists)
- `status.privacyStatus` for a playlist is `private`, `public`, or `unlisted`. `status.podcastStatus` is `enabled`, `disabled`, or `unspecified`. `contentDetails.itemCount` is the number of videos. `player.embedHtml` embeds a player for the playlist. `snippet.tags` is deprecated. The resource page was last updated 2026-10-15 UTC. — [Playlists](https://developers.google.com/youtube/v3/docs/playlists)
- YouTube uses playlists for special channel collections. The API reference still names uploaded videos, liked videos, watch history, and watch later, and says their IDs come from the channel resource, then `playlistItems.list` retrieves the videos. The playlist resource page retrieved the same day names only uploaded videos and liked videos in that introductory list. — [API Reference](https://developers.google.com/youtube/v3/docs); [Playlists](https://developers.google.com/youtube/v3/docs/playlists)
- `channels.list` `contentDetails.relatedPlaylists.uploads` is the playlist ID of the channel’s uploaded videos. `relatedPlaylists.likes` is the liked-video playlist. `relatedPlaylists.favorites` is deprecated with the 28 August 2015 favorites deprecation and may point at an empty unlistable playlist. The channel page says those playlists can be retrieved with `playlists.list`. `search.list` says the videos in the uploads playlist are retrieved with `playlistItems.list`. — [Channels](https://developers.google.com/youtube/v3/docs/channels); [Search: list](https://developers.google.com/youtube/v3/docs/search/list)
- Official playlist embed URL shape, separate from the Data API, is `https://www.youtube.com/embed?listType=playlist&list=PLAYLIST_ID`. That page also says to prepend `PL` to the playlist ID. — [YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters)

### Inferences
- Course-as-playlist read path: `playlists.list` with `id` and `part=snippet,contentDetails,status,player`, then `playlistItems.list` with `playlistId`, `part=snippet,contentDetails,status`, and `pageToken` until `nextPageToken` is absent, then `videos.list` on `contentDetails.videoId` for duration and embeddable status.
- Channel-uploads path: `channels.list` `part=contentDetails`, read `relatedPlaylists.uploads`, then the same `playlistItems.list` loop. Do not use `search.list` `order=date` for that job.
- `contentDetails.itemCount` is a count, not the lesson list. Item order is `snippet.position`.

### Gaps
- The retrieved `playlists.list` text was cut off at `hl`. `maxResults` and `pageToken` were not in that excerpt, so this note does not assert their limits for `playlists.list`.
- The playlist-item `status.privacyStatus` enum is not printed on the playlist-item resource page.
- The `PL` prefix instruction on the player-parameters page was not checked against current playlist IDs.

## How do captions.list and caption download work, and can an API key retrieve track text?

### Takeaway
No. `captions.list` and `captions.download` both require OAuth (`youtube.force-ssl` or `youtubepartner`). Download also requires permission to edit the video and returns the track as a file. An API-key-only LMS cannot retrieve caption text. It can only see the `true`/`false` availability flag on `videos.list`.

### Cited Findings
- A caption resource is one track on exactly one video. `captions.list` returns tracks for a `videoId` and “does not contain the actual captions.” `captions.download` retrieves the track. — [API Reference](https://developers.google.com/youtube/v3/docs); [Captions: list](https://developers.google.com/youtube/v3/docs/captions/list)
- `GET https://www.googleapis.com/youtube/v3/captions`. Required: `part` (`id` and/or `snippet`) and `videoId`. Optional: `id` (track IDs belonging to that video) and partner-only `onBehalfOfContentOwner`. Response `kind` is `youtube#captionListResponse`. The page prints a quota cost of 50 units. — [Captions: list](https://developers.google.com/youtube/v3/docs/captions/list)
- `captions.list` authorization scopes are `https://www.googleapis.com/auth/youtube.force-ssl` and `https://www.googleapis.com/auth/youtubepartner`. Insufficient permissions return `forbidden` (403). `videoNotFound` and `captionNotFound` are 404s. — [Captions: list](https://developers.google.com/youtube/v3/docs/captions/list)
- `GET https://www.googleapis.com/youtube/v3/captions/{id}`. The page says: “This method requires the user to have permission to edit the video.” Same two OAuth scopes. The page prints a quota cost of 200 units. Success is a binary body with `Content-Type: application/octet-stream`. — [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download)
- Download `tfmt`: `sbv`, `scc`, `srt`, `ttml`, `vtt`. If omitted, the original format is returned. `tlang` is an ISO 639-1 code; the translation is machine translation. `couldNotConvert` (400) fires when format or language conversion fails or `snippet.status` is `failed`. `forbidden` (403) fires when permissions are insufficient. — [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download)
- Track metadata on `snippet`: `videoId`, `lastUpdated` (ISO 8601), `trackKind` (`ASR`, `forced`, `standard`), `language` (BCP-47), `name` (max 150 characters), `audioTrackType` (`commentary`, `descriptive`, `primary`, `unknown`), `isCC`, `isLarge`, `isEasyReader`, `isDraft` (`true` means not publicly visible), `isAutoSynced`, `status` (`failed`, `serving`, `syncing`), `failureReason` (`processingFailed`, `unknownFormat`, `unsupportedFormat`). None of these fields is the cue text. — [Captions](https://developers.google.com/youtube/v3/docs/captions)
- The `sync` parameter on `captions.insert` and `captions.update` was deprecated 13 March 2024 and unsupported as of 12 April 2024. Uploads must include timing. The caption resource page repeats that notice, but `snippet.isAutoSynced` still describes setting `sync=true` on insert or update. — [Revision History](https://developers.google.com/youtube/v3/revision_history); [Captions](https://developers.google.com/youtube/v3/docs/captions)
- `videos.contentDetails.caption` remains the public availability string `true` or `false` and is not in the owner-only part list. — [Videos](https://developers.google.com/youtube/v3/docs/videos)

### Inferences
- A third-party LMS that only stores an API key can filter with `search.list` `videoCaption=closedCaption` and read `contentDetails.caption`. It cannot list track languages or download SRT/VTT text for another channel’s video.
- Download is an owner (or linked content-partner) operation, not a public-transcript API. `onBehalfOfContentOwner` does not change that; it is the CMS-user path.

### Gaps
- `captions.list` does not repeat the download page’s sentence “permission to edit the video.” It does require the same OAuth scopes and returns 403 when permissions are insufficient. This note did not find a sentence that says an OAuth token for an unrelated user can list another channel’s public tracks.
- No official page retrieved here documents a no-auth timed-text URL as a supported Data API method.
- `snippet.failureReason` says it is present when “the `state` property” is `failed`, but the documented status field is `snippet.status`.

## How do channels.list and videoCategories.list help filter educational content?

### Takeaway
They help only as metadata filters. `videoCategories.list` returns region-specific category titles and IDs; `search.list` can filter on `videoCategoryId`, and a hydrated video exposes `snippet.categoryId`. `channels.list` supplies the uploads playlist, channel text, and Wikipedia topic URLs. There is no educational boolean. Guide-category filtering on `channels.list` is deprecated. The curated topic list has Knowledge, not Education.

### Cited Findings
- `GET https://www.googleapis.com/youtube/v3/channels`. `part` accepts `auditDetails`, `brandingSettings`, `contentDetails`, `contentOwnerDetails`, `id`, `localizations`, `snippet`, `statistics`, `status`, `topicDetails`. Exactly one filter: deprecated `categoryId`, `forHandle`, `forUsername`, `id`, partner-only `managedByMe`, or authorized `mine`. Optional `hl`, `maxResults` `0` to `50` (default `5`), `pageToken`, and `onBehalfOfContentOwner`. — [Channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- `categoryId` on `channels.list` “has been deprecated.” It used to request channels in a YouTube guide category. — [Channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- `forHandle` accepts the handle with or without a leading `@`. — [Channels: list](https://developers.google.com/youtube/v3/docs/channels/list)
- Channel fields useful before accepting a lesson source: `snippet.title`, `snippet.description` (max 1000 characters), `snippet.customUrl`, `snippet.country`, `snippet.defaultLanguage`, `status.privacyStatus` (`private`, `public`, `unlisted`), `status.madeForKids`, `statistics.videoCount` (public videos only), `statistics.subscriberCount` (rounded down to three significant figures), `topicDetails.topicCategories` (Wikipedia URLs). Channel page last updated 2026-09-16 UTC. — [Channels](https://developers.google.com/youtube/v3/docs/channels)
- `topicDetails.topicIds` on a channel was deprecated 10 November 2016, with support described through 10 November 2017. The replacement description of content is `topicDetails.topicCategories`. The curated ID table still printed on the page includes `/m/01k8wb` Knowledge, `/m/07c1v` Technology, and `/m/0kt51` Health. It does not include a topic named Education. — [Channels](https://developers.google.com/youtube/v3/docs/channels)
- `contentDetails.relatedPlaylists.uploads` is the ID to pass to `playlistItems.list` for that channel’s videos. The channel docs phrase the follow-up call as `playlists.list`. — [Channels](https://developers.google.com/youtube/v3/docs/channels)
- `GET /videoCategories` “returns a list of categories that can be associated with YouTube videos.” A `videoCategory` has `id`, `snippet.channelId`, `snippet.title`, and `snippet.assignable`. The resource example sets `snippet.channelId` to `UCBR8-60-B28hp2BmDPdntcQ`. The resource page was last updated 2026-10-15 UTC. — [API Reference](https://developers.google.com/youtube/v3/docs); [VideoCategories](https://developers.google.com/youtube/v3/docs/videoCategories)
- The `videoCategories.list` parameter text retrieved in search includes `id` (comma-separated category IDs) and `regionCode` (categories available in the specified region). The API reference says `hl` values come from `i18nLanguages.list` and that `regionCode` values for this method come from `i18nRegions.list`. — [VideoCategories: list](https://developers.google.com/youtube/v3/docs/videoCategories/list); [API Reference](https://developers.google.com/youtube/v3/docs)
- `search.list` `videoCategoryId` filters video results and requires `type=video`. `videos.snippet.categoryId` is the category stored on the video. `videos.list` `videoCategoryId` applies only to the `mostPopular` chart. — [Search: list](https://developers.google.com/youtube/v3/docs/search/list); [Videos](https://developers.google.com/youtube/v3/docs/videos); [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list)
- The overview still lists `guideCategory` as a resource type. It does not define an education filter. — [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started)

### Inferences
- Educational filtering that the docs actually support is: resolve category titles with `videoCategories.list` for a `regionCode`, keep the ID whose `snippet.title` matches the product’s label and whose `snippet.assignable` is true, then set `search.list` `videoCategoryId` and/or check `videos.snippet.categoryId`. Topic narrowing is `topicId=/m/01k8wb` (Knowledge) or another curated ID, plus Wikipedia URLs on `topicDetails.topicCategories`.
- Do not use `channels.list` `categoryId`. It is a deprecated guide-category filter.
- Category titles are region-scoped. An ID learned from one `regionCode` should be re-read for the lesson’s region rather than hardcoded from memory.

### Gaps
- The full `videoCategories.list` parameter table was not retrieved; the list page timed out. This note does not assert whether `part` is required, whether `id` and `regionCode` are mutually exclusive, or the `hl` behavior beyond the API reference cross-reference.
- No page retrieved here publishes a fixed category ID for “Education” or “Science & Technology.”
- `guideCategories.list` was not fetched. The overview still names the resource; `channels.list` `categoryId` is deprecated. Whether the guide-category method itself remains is unverified here.

## What is the difference between the Data API and the no-key oEmbed endpoint?

### Takeaway
oEmbed answers one question the Data API answers with more machinery: given a public video URL, will YouTube return embed HTML, plus title, author, and a thumbnail? It does not search, does not list playlists, and does not return duration, description, privacy, license, caption availability, or category. It needs no API key. Google’s Data API reference does not document it. A live call on 21 October 2026 returned an iframe.

### Cited Findings
- Data API calls require `key` or an OAuth token. Search and video list return the structured fields in the sections above, including duration and `status.embeddable`. `status.embeddable=true` can still fail in an embed because of policy or Content ID. — [API Reference](https://developers.google.com/youtube/v3/docs); [Videos](https://developers.google.com/youtube/v3/docs/videos)
- The official embed URL in Google’s player-parameters guide is `https://www.youtube.com/embed/VIDEO_ID`. That guide says an application using the Data API can build this URL from a video ID returned by search, playlist items, or video resources. A site-restricted search of `developers.google.com` for a YouTube oEmbed reference returned the iframe player docs, not an oEmbed method page. — [YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters)
- The oEmbed specification uses `https://www.youtube.com/oembed` as its video example, with `url` and `format=json`. The example response on that spec page is a legacy Flash `<object>` embed, not an iframe. — [oEmbed](https://oembed.com/)
- A live GET on 21 October 2026 to `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DjNQXAC9IVRw&format=json` with no API key returned JSON: `type` `video`, `version` `1.0`, `provider_name` `YouTube`, `provider_url` `https://www.youtube.com/`, `title` “Me at the zoo”, `author_name` “jawed”, `author_url` `https://www.youtube.com/@jawed`, `thumbnail_url` `https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg`, `thumbnail_width` 480, `thumbnail_height` 360, `width` 200, `height` 150, and `html` containing an iframe whose `src` is `https://www.youtube.com/embed/jNQXAC9IVRw?feature=oembed`. The body had no duration, description, `privacyStatus`, `license`, caption flag, `definition`, `publishedAt`, or category. — [Live oEmbed response for jNQXAC9IVRw](https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DjNQXAC9IVRw&format=json)
- Protocol write-ups list `url` as required and `maxwidth` as optional, and they describe `format` of json or xml. Those write-ups are not Google Data API pages. — [oEmbed](https://oembed.com/); [What is oEmbed?](https://oembed.org/docs)

### Inferences
- oEmbed is a public-embed probe for a URL the LMS already has. The Data API is the catalog: search, playlist expansion, and the metadata oEmbed does not carry.
- A 200 from oEmbed with `type=video` and iframe `html` confirms that this URL currently produces embed HTML. It does not confirm `contentDetails.duration`, Creative Commons status, or caption availability.
- The spec’s Flash example is stale relative to the live iframe response. Use the live response shape, not the spec’s sample HTML.

### Gaps
- This note probed one public watch URL. It did not record HTTP status or body for a private, deleted, or non-embeddable video, so it does not state how oEmbed fails those cases.
- No `developers.google.com` page retrieved here specifies oEmbed query parameters, error codes, or which URL forms (Shorts, live, playlist) YouTube’s endpoint accepts. Third-party provider lists were not used as authority for that.
- `maxwidth` and `maxheight` were not sent on the live call. Default `width` 200 and `height` 150 are what that one response contained, not a documented contract.

## Which official pages document these methods?

### Takeaway
Use the v3 reference on `developers.google.com`. Method pages below were the ones that matched the LMS read path on 21 October 2026. oEmbed is not one of them.

### Cited Findings
- Index of resources and HTTP paths, last updated 2026-09-14 UTC: [API Reference](https://developers.google.com/youtube/v3/docs).
- Concepts, auth, `part` / `fields`, and a stale sample payload, last updated 2026-10-15 UTC: [YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started).
- Removals and field changes through 30 September 2026: [Revision History](https://developers.google.com/youtube/v3/revision_history).
- Search method: [Search: list](https://developers.google.com/youtube/v3/docs/search/list). Search item schema: [Search](https://developers.google.com/youtube/v3/docs/search).
- Video hydrate method, last updated 2026-10-15 UTC: [Videos: list](https://developers.google.com/youtube/v3/docs/videos/list). Field dictionary: [Videos](https://developers.google.com/youtube/v3/docs/videos).
- Playlist items method: [PlaylistItems: list](https://developers.google.com/youtube/v3/docs/playlistItems/list). Item schema, last updated 2026-10-15 UTC: [PlaylistItems](https://developers.google.com/youtube/v3/docs/playlistItems).
- Playlist method: [Playlists: list](https://developers.google.com/youtube/v3/docs/playlists/list). Playlist schema, last updated 2026-10-15 UTC: [Playlists](https://developers.google.com/youtube/v3/docs/playlists).
- Caption track schema: [Captions](https://developers.google.com/youtube/v3/docs/captions). List: [Captions: list](https://developers.google.com/youtube/v3/docs/captions/list). Download: [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download).
- Channel method: [Channels: list](https://developers.google.com/youtube/v3/docs/channels/list). Channel schema, last updated 2026-09-16 UTC: [Channels](https://developers.google.com/youtube/v3/docs/channels).
- Category schema, last updated 2026-10-15 UTC: [VideoCategories](https://developers.google.com/youtube/v3/docs/videoCategories). List method: [VideoCategories: list](https://developers.google.com/youtube/v3/docs/videoCategories/list). The list page timed out during this retrieval; only a parameter fragment was captured via search.
- Official iframe embed, not oEmbed: [YouTube Embedded Players and Player Parameters](https://developers.google.com/youtube/player_parameters).
- oEmbed protocol example that names YouTube’s endpoint: [oEmbed](https://oembed.com/). Live endpoint behavior: `https://www.youtube.com/oembed`.

### Inferences
- For an LMS design note, cite the resource page for field names and the method page for parameters. Where they disagree (overview sample enums, playlist `part` prose saying `author` / `timeCreated`, search `id.type` versus `id.kind`, caption `state` versus `status`), prefer the resource property table dated 2026-10-15.

### Gaps
- `playlistItems.list`, `playlists.list`, `channels.list`, and `videoCategories.list` were not all fully re-fetched after timeouts. Parameters quoted for those methods come from the portions Google returned in search-result extracts of those official URLs, plus the resource pages that did load. Anything past the cutoff in those extracts is omitted above rather than filled in.
