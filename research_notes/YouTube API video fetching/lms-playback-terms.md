# LMS playback of fetched YouTube videos

Checked against Google and YouTube pages retrieved 21 October 2026. Audience: an engineer whose product already optionally calls `search.list` and must show fetched videos inside YouTube's terms. Quotations are short; the linked pages are the authority.

The binding set for an API client is the YouTube API Services Terms of Service plus the Developer Policies, Branding Guidelines, Required Minimum Functionality (RMF), YouTube Guidelines, credentials, Google Software Principles, and the YouTube Terms of Service. If those documents conflict on API use, the API Terms of Service take precedence. — [API Terms §2.1 and §2.4](https://developers.google.com/youtube/terms/api-services-terms-of-service)

Dates on the pages themselves:

- Developer Policies: "Last updated 2026-10-15 UTC." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- RMF: "Last updated 2026-10-15 UTC." — [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Branding Guidelines: "Last updated 2025-08-20 UTC." — [Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- YouTube Terms of Service (the consumer terms, incorporated into the API agreement): "Dated: December 15, 2023." — [YouTube Terms](https://www.youtube.com/t/terms)
- API Services revision history, latest entries: 1 June 2026 and 4 May 2026, both about additional policies on derived metrics and data storage. Earlier relevant entries include 7 July 2025 (API client identity for the embedded player) and 23 January 2025 (Android Player API references removed). — [Revision history](https://developers.google.com/youtube/terms/revision-history)
- The API Terms page retrieved on 21 October 2026 did not print its own "last updated" line. The 1 June 2026 history entry describes a policies change, not a rewrite of the numbered Terms sections quoted below.

## How should an LMS play a fetched video?

### Takeaway

Play inside the official embedded player (`https://www.youtube.com/embed/VIDEO_ID` or the privacy-enhanced `https://www.youtube-nocookie.com/embed/VIDEO_ID`), optionally driven by the IFrame Player API. Link out to the watch page when the video cannot be embedded. Do not ship a replacement player, a hidden player, or a downloaded file.

### Cited Findings

- The IFrame Player API "lets you embed a YouTube video player on your website and control the player using JavaScript," including queue, play, pause, stop, volume, and state events. Load `https://www.youtube.com/iframe_api`, implement `onYouTubeIframeAPIReady`, and construct `YT.Player`. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- A hand-written iframe uses `src="https://www.youtube.com/embed/VIDEO_ID"`. The same page's player-parameters example loads `https://www.youtube.com/player_api` instead of `iframe_api`. Both URLs appear in current Google docs. — [Player parameters](https://developers.google.com/youtube/player_parameters); [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- If the iframe is written by the page, set `enablejsapi=1` before `YT.Player` can control it, and "you should also include the `origin` parameter" (scheme plus full domain). `origin` "protects against malicious third-party JavaScript being injected into your page and hijacking control of your YouTube player." — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- `onReady` fires when the player "has finished loading and is ready to begin receiving API calls." — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- `cueVideoById` "loads the specified video's thumbnail and prepares the player to play the video. The player does not request the video until `playVideo()` or `seekTo()` is called." When cued, the player broadcasts video-cued (`5`). `loadVideoById` "loads and plays the specified video." — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- `onStateChange` data values: `-1` unstarted, `0` ended, `1` playing, `2` paused, `3` buffering, `5` video cued. Namespaced constants exist for ended, playing, paused, buffering, and cued. There is no documented `UNSTARTED` constant in that list. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- "A playback only counts toward a video's official view count if it is initiated via a native play button in the player." `onAutoplayBlocked` fires when the browser blocks autoplay or scripted playback, including `loadVideoById` and `playVideo`. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- After a video ID is obtained from the Data API, "replace the `VIDEO_ID` text in the URLs above with that value to create the player URL." — [Player parameters](https://developers.google.com/youtube/player_parameters)
- Embedded players "must have a viewport that is at least 200px by 200px." If controls are shown, they must fit without shrinking below that minimum. Google recommends at least 480×270 for 16:9. A thumbnail that starts playback must be at least 120×70. — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality); same size sentence on [Player parameters](https://developers.google.com/youtube/player_parameters)
- "You must not display overlays, frames, or other visual elements in front of any part of a YouTube embedded player, including player controls." "You must not make changes to the YouTube player that are not explicitly described by the API documentation." — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- Automatic playback must not start until the player is visible and more than half of it is on screen, and a page must not have more than one YouTube player autoplaying at once. — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)
- API clients "must not charge users to watch content in an embedded YouTube player" and must not gate a video behind any action "other than clicking the play button," except that "login or age verification" which is normal functionality of the client, and "not specific to YouTube API Services," is allowed. — [Developer Policies §III.F.3](https://developers.google.com/youtube/terms/developer-policies)
- Clients must not "modify, build upon, or block any portion or functionality of a YouTube player," must not play from "a background player, meaning a player that is not displayed in the page, tab, or screen that the user is viewing," and must not nest iframes "to circumvent YouTube policies or otherwise obfuscate the source of use." — [Developer Policies §III.I.6, §III.I.9, §III.I.21](https://developers.google.com/youtube/terms/developer-policies)
- Consumer terms: "You may also show YouTube videos through the embeddable YouTube player." — [YouTube Terms, 15 December 2023](https://www.youtube.com/t/terms)
- `modestbranding` "is deprecated and has no effect" (announcement dated 15 August 2023). `rel=0` does not turn related videos off; it limits them to the same channel (change effective on or after 25 September 2018). `showinfo` is ignored. — [Player parameters](https://developers.google.com/youtube/player_parameters)
- `controls=0` is a documented parameter that hides player controls; `controls=1` is the default. — [Player parameters](https://developers.google.com/youtube/player_parameters)
- Embedders must send an HTTP Referer. YouTube recommends `Referrer-Policy: strict-origin-when-cross-origin` and forbids `noreferrer` on `window.open`. Missing identity is player error 153; "Watch on YouTube" still works. WebViews where Referer is empty must set it (or, for iOS `SFSafariViewController`, the `origin` player parameter). — [RMF, API Client Identity](https://developers.google.com/youtube/terms/required-minimum-functionality); [Embed videos & playlists](https://support.google.com/youtube/answer/171780?hl=en)
- The IFrame Player API "does not require authorization just as users do not need to log in to the YouTube website to watch a video." Public search also needs no user authorization. — [Developer Policies §III.D.2](https://developers.google.com/youtube/terms/developer-policies)

### Inferences

- Default lesson player: iframe (or `YT.Player`) with `autoplay` left at 0, user presses the player's own play control, viewport at least 200×200 and preferably 480×270, `referrerpolicy="strict-origin-when-cross-origin"`, no overlay, player not in a hidden tab. Use `cueVideoById` when the lesson should show a thumbnail until the student plays. Use `loadVideoById` only when immediate playback is intended, and handle `onAutoplayBlocked`.
- `onStateChange` is appropriate for lesson progress (started, paused, ended). Scripted `playVideo()` is allowed by the API but does not, by YouTube's own note, count as an official view, and browsers may block it.
- When `status.embeddable` is false or the player returns 101/150, send the student to `https://www.youtube.com/watch?v=VIDEO_ID` rather than substituting another player.
- A school login in front of the LMS is the sort of non-YouTube action the policies expressly allow. Whether a paid LMS subscription is "charg[ing] users to watch content in an embedded YouTube player" is not settled by an example in the policies; that sentence should be read by counsel before a paid tier's only video path is an embed. Selling the LMS application itself is listed as a permitted commercial use, subject to the ad and redistribution bans. — [Developer Policies §III.G.2.a and §III.F.3.a](https://developers.google.com/youtube/terms/developer-policies)

### Gaps

- The player-parameters page and the IFrame API sections read for this note do not document a `host` constructor option. Community posts describe `host: 'https://www.youtube-nocookie.com'` on `YT.Player`. The documented privacy-enhanced method is to change the iframe domain (see the privacy section). Do not treat `host` as a documented parameter on the strength of this research.
- No official sentence was retrieved that says a tuition- or subscription-gated course may, or may not, embed YouTube as the course video.

## What do licensedContent, embeddable, and errors 101, 150, and 153 mean?

### Takeaway

`status.embeddable` is the uploader's embed switch, not a guarantee the lesson player will start. `contentDetails.licensedContent` means a content partner claimed the video; partners can block embeds even when `embeddable` is true. Errors 101 and 150 mean the owner (or a claim treated like an owner block) forbids embedded playback. Error 153 means the embed sent no client identity.

### Cited Findings

- `status.embeddable` (boolean): "whether the video can be embedded on another website." The same field notes: "Even if the uploader's settings allow embedding, videos may still be blocked from playback in embedded players due to platform policies or third-party claims (such as Content ID)." — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- `contentDetails.licensedContent` (boolean): "the content was uploaded to a channel linked to a YouTube content partner and then claimed by that partner." — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- Content Manager partners can set embed allow/block rules separately for "Licensed content" and for "User-uploaded content," by domain and by app ID. "Embedding restrictions cannot be applied to iOS apps." — [Restrict embedding](https://support.google.com/youtube/answer/6301625?hl=en)
- Uploaders turn embedding off in YouTube Studio: uncheck "Allow embedding." — [Embed videos & playlists](https://support.google.com/youtube/answer/171780?hl=en)
- Player `onError` codes: `2` invalid parameter (for example a video ID that is not 11 characters); `5` HTML5 player cannot play the content; `100` "the video requested was not found. This error occurs when a video has been removed (for any reason) or has been marked as private"; `101` "The owner of the requested video does not allow it to be played in embedded players"; `150` "the same as `101`. It's just a `101` error in disguise!"; `153` the request "does not include the `HTTP Referer` header or equivalent API Client identification." Error 153 was added to the reference in the 9 July 2025 revision note. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference); [IFrame API revision history](https://developers.google.com/youtube/iframe_api_revision_history)
- `contentDetails.regionRestriction` contains either `allowed[]` or `blocked[]` region codes. If `allowed` is present and the viewer's country is absent, the video is blocked there; an empty `allowed` list means blocked in all countries. If `blocked` is present and the country is absent, the video is viewable there; an empty `blocked` list means viewable in all countries. — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- `contentDetails.contentRating.ytRating` value `ytAgeRestricted` "identif[ies] age-restricted content." — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- `status.privacyStatus` values are `private`, `public`, and `unlisted`. — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- Clients "must not … circumvent, interfere with, or render ineffective, any geographical restrictions, including IP address-based restrictions imposed by YouTube or YouTube API Services." — [Developer Policies §III.I.13](https://developers.google.com/youtube/terms/developer-policies)

### Inferences

- Before rendering a lesson player, `videos.list` with `part=status,contentDetails` can drop obvious failures: `embeddable=false`, a `regionRestriction` that excludes the school's country, and `ytRating=ytAgeRestricted` if the product cannot handle an age gate. `licensedContent=true` is a warning, not a block: the partner may still allow this domain.
- Treat 101 and 150 as one outcome in the UI: embedding is refused; offer the watch-page link. Do not retry with a different player.
- Treat 153 as an integration bug (Referer or `origin`), not as a bad video.
- Treat 100 as "gone or private." Treat 2 as a bad stored ID. Treat 5 as a player/content failure, not an embed-permission failure.
- A video can be public, `embeddable=true`, and still fail in the iframe because of Content ID or a partner domain rule. The metadata check reduces failures; it does not replace an `onError` handler.

### Gaps

- No official matrix was found that maps `licensedContent=true` plus `embeddable=true` to a specific `onError` code. The embeddable-field note cites Content ID blocks without naming 101 or 150.
- This research did not confirm whether an age-restricted video (`ytAgeRestricted`) fails in the embed for signed-out students, or which error code that failure uses.

## Do the API Terms require the official player, ban stored audiovisual content, limit metadata cache, and ban separate streams?

### Takeaway

Yes on all four, with the cache rule living in the Developer Policies (part of the agreement), not in a numbered section of the Terms. Audiovisual files must not be stored. Other API data from a key-based call may be kept at most 30 days unless deleted or refreshed. Audio and video must stay together in the YouTube player. The policies page carrying these rules was last updated 15 October 2026; the derived-metrics storage exception was revised 1 June 2026 and applies only to approved audited analytics clients.

### Cited Findings

- API Terms §16.3: "no rights or licenses are granted to reproduce or distribute audiovisual content or make audiovisual content available in any manner other than through the use of the YouTube API Services in accordance with the Agreement. All rights not expressly granted to you are reserved by YouTube." — [API Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- Developer Policies §III.E.1, Audiovisual Content. Clients must not, and must not encourage others to: "download, import, backup, cache, or store copies of YouTube audiovisual content without YouTube's prior written approval," "make content available for offline playback," or use the API "to facilitate or promote copyright infringement." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Developer Policies §III.I.4: must not "modify, interfere with, replace, or otherwise disable any functionality, data, or content" of the API services, "including any links that appear in YouTube players or in API Data." §III.I.6: must not "modify, build upon, or block any portion or functionality of a YouTube player." §III.I.14: must not "use any technology other than YouTube API Services to access or retrieve API Data, including to access any portion of any YouTube audiovisual content." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Developer Policies §III.I.7: must not "separate, isolate, or modify the audio or video components of any YouTube audiovisual content" made available with the API services. "For example, you must not apply alternate audio tracks to videos." §III.I.8: must not "promote separately the audio or video components" of that content. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Developer Policies §III.E.4.d: clients "may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of the API Client but not longer than 30 calendar days." After 30 days the client "must either delete or refresh the stored data." §III.E.4.e: clients "must use reasonable efforts to ensure that their stored API Data is consistent with the current data available through YouTube API Services." §III.E.4.f: user-facing UI must "display the most updated API Data available," though historical data may be shown "accurately in context of time." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Non-Authorized Data means API Data accessible without user credentials. A search or `videos.list` call made with an API key, not a user's OAuth token, is in that category. — [Developer Policies §IV](https://developers.google.com/youtube/terms/developer-policies)
- Authorized statistics (views, subscriber counts, playlist lengths) may be stored longer than 30 days only with the uploader's authorization, and the client must still re-check every 30 days that authorization remains and that the video "has not been deleted." "An API Client must not store statistics retrieved as Non-Authorized Data for more than 30 days." Other Authorized Data is also capped at 30 days unless it is Analytics API data, Reporting API data, or those statistics. — [Developer Policies §III.E.4.b–c](https://developers.google.com/youtube/terms/developer-policies)
- §III.E.4.h: clients must not "replace API Data with similar, independently calculated data" or "access or use API Data to create new or derived data or metrics." The worked example forbids substituting a like count or computing a score from likes and views. Independently calculated figures may sit beside API figures only with a "clear and prominent disclosure" that they are not from YouTube. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- §III.L, "Additional policies on derived metrics and data storage," applies "only" to "audited developers with analytics use cases that have explicitly applied for permission" via the quota-extension form, "starting June 01, 2026." The 1 June 2026 revision "clarif[ies] that if your use case is accepted for additional derived metrics, you may store some statistical data for a duration beyond 30 days." — [Developer Policies §III.L](https://developers.google.com/youtube/terms/developer-policies); [Revision history](https://developers.google.com/youtube/terms/revision-history)
- On any suspension or termination, the client must "immediately stop accessing and using all YouTube Property and delete all YouTube API Services (including all API Data)" from its servers. — [API Terms §24.3](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- YouTube Terms, 15 December 2023, permissions: users "are not allowed to" "access, reproduce, download, distribute, transmit, broadcast, display, sell, license, alter, modify or otherwise use any part of the Service or any Content except: (a) as expressly authorized by the Service; or (b) with prior written permission from YouTube and, if applicable, the respective rights holders," or to "circumvent, disable, fraudulently engage with, or otherwise interfere with" security or copy-restriction features, or to "access the Service using any automated means (such as robots, botnets or scrapers)" except public search engines following `robots.txt` or with prior written permission. — [YouTube Terms](https://www.youtube.com/t/terms)
- RMF is "an integral part of the YouTube API Terms of Service." Player attributes "are specified in YouTube API documentation," and clients "must not make changes to the YouTube player that are not explicitly described" there. — [RMF](https://developers.google.com/youtube/terms/required-minimum-functionality)

### Inferences

- "Official player only" is the combined effect of §16.3, the audiovisual-storage ban, the ban on modifying or replacing the player, and the ban on reaching audiovisual content by any non-API technology. A custom `<video>` element, a rehosted MP4, or an audio-only lesson extracted from the YouTube file is outside that grant.
- The 30-day rule is a refresh-or-delete rule for metadata, not a rule that the lesson may only exist for 30 days. A stored video ID, title, thumbnail URL, and duration remain compliant if `videos.list` refreshes them at least every 30 days and rows YouTube no longer returns are deleted.
- An LMS that only has an API key cannot rely on the "store statistics longer" or the June 2026 derived-metrics exception. Those require user authorization or an approved audited analytics use case.
- Building a local "quality score" from view counts or likes is the kind of derived metric §III.E.4.h forbids. Storing the API's own title next to a lesson the LMS wrote is not the example given; the report should not stretch the example into a ban on lesson text.

### Gaps

- The Terms page did not show a revision date of its own. "Current revision" for the operative storage and player rules is best stated as: Terms text as published at the URL above, read 21 October 2026, together with Developer Policies last updated 15 October 2026 and revision-history entries through 1 June 2026.
- §16.3 says audiovisual content may be made available only "through the use of the YouTube API Services." The policies also allow display of audiovisual content "through your API Clients" when the client follows the agreement, which includes the embedded player. The documents do not spell out whether a plain watch-page link, with no player, is an API-services use. The consumer terms separately allow showing videos "through the embeddable YouTube player."

## What metadata may be stored, for how long, and what attribution is required?

### Takeaway

Title, thumbnail URL, video ID, channel title, duration, embeddable flag, region restriction, and made-for-kids flag are API data. For a key-based client they may be stored only as long as needed and not longer than 30 days without a refresh or deletion. The lesson UI that shows them must attribute YouTube and must not strip player branding. Thumbnail image files are not a separate, permanent cache.

### Cited Findings

- `snippet.title` is the video title, maximum 100 characters. `snippet.thumbnails.(key).url` is the thumbnail image URL. Documented keys include `default` (120×90), `medium` (320×180), `high` (480×360), `standard` (640×480), `maxres` (1280×720), plus `fhd`, `qhd`, and `uhd` for some videos. `snippet.channelTitle` is the channel name. — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- `contentDetails.duration` is an ISO 8601 duration (`PT#M#S`, `PT#H#M#S`, or `P#DT#H#M#S`). "The returned duration might differ slightly (for example, by 1 second) from the actual playback duration." — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- API Data includes "data, content (including audiovisual content) and information provided to API Clients." §19.5 lists "videos, audio, graphics, photos, text" among API data content. — [API Terms §1 and §19.5](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- The 30-day store-or-refresh rule for Non-Authorized Data is quoted in the previous section. — [Developer Policies §III.E.4.d](https://developers.google.com/youtube/terms/developer-policies)
- Any page or feature that displays YouTube content, "including, without limitation, search results, YouTube videos, channels, playlists, thumbnails, and YouTube players," must "make clear to the viewer that YouTube is the source" by displaying YouTube Brand Features under the Branding Guidelines. Mixed-source results need attribution on the YouTube items, not one generic line for the whole page. Clients must not "interfere with or obscure any attribution provided by YouTube, including attribution provided via or shown in embedded YouTube players." — [Developer Policies §III.F.2](https://developers.google.com/youtube/terms/developer-policies)
- API Terms §10.3: "All API Clients must provide proper attribution in accordance with the YouTube Branding Guidelines." §11: do not remove proprietary notices; where the API does not show them, display them as the Branding Guidelines require. — [API Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- If the application "would still be useful if you removed its YouTube functionality," use the YouTube logo (not the "developed with YouTube" logo) beside the YouTube feature. The logo "must be clickable and needs to link back to YouTube content or to a YouTube component of that application." "Do not display any YouTube branding image as the most prominent element on your page." — [Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- "You must never use the YouTube name" or variants such as "YT" or "You-Tube" "in conjunction with the overall name of your application." The guidelines' examples of forbidden names are "YouTube for Kids" and "YouTube Education." Logos may not be recolored (except the monochrome "developed with YouTube" mark), altered, or partly covered. — [Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines)
- Search UI: clients "must not modify or replace the text, images, information, or other content of, the search results returned" by YouTube, and must not merge other sources into a list "present[ed] as YouTube search results." — [Developer Policies §III.C.5](https://developers.google.com/youtube/terms/developer-policies)
- API clients "must display a link to YouTube's Terms of Service (`https://www.youtube.com/t/terms`)" and "must also state in their own terms of use that, by using those API Clients, users are agreeing to be bound by the YouTube Terms of Service." The privacy policy must notify users that the client "uses YouTube API Services" and must link to the Google Privacy Policy at `http://www.google.com/policies/privacy`. — [Developer Policies §III.A](https://developers.google.com/youtube/terms/developer-policies)
- `videos.list` quota cost on the current quota calculator is listed as 1. The same page says `search.list` and `videos.insert` each have a separate default daily bucket of 100 calls, "The quota cost is 1 per call," and other methods share 10,000 units per day. — [Quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- The made-for-kids guide still says the default 10,000-unit quota "is sufficient to check the MadeForKids video status of up to 5000 videos." — [Made for Kids status](https://developers.google.com/youtube/data/guides/made_for_kids_status)

### Inferences

- Persist the video ID plus the fields the lesson UI actually shows (title, channel title, thumbnail URL, duration, embeddable, region restriction, made-for-kids). Refresh that row with `videos.list` on a schedule shorter than 30 days. If the ID disappears from the response, delete the stored metadata and stop embedding it.
- Hotlink `snippet.thumbnails.*.url` (or show the thumbnail only inside the YouTube player). Copying thumbnail bytes into the LMS origin is still storing API data (the Terms list photos and graphics as API data) and still falls under the 30-day rule.
- An LMS that works without YouTube should use the standard YouTube logo next to the video block, linking to the watch page or to the embedded player, and should not name the product with "YouTube." Player chrome, title, and channel avatar that the player draws must stay visible; `modestbranding` cannot be used to remove them.
- A lesson page that is not a search-results list can show one chosen video with attribution. A picker that lists `search.list` hits must show YouTube's title and images as returned, and must label them as YouTube if other catalogs appear on the same screen.
- The product's existing "a search costs 100" quota copy does not match the quota calculator text retrieved for this note (search in its own 100-call bucket at cost 1; `videos.list` at cost 1 against the 10,000-unit pool). Confirm in Cloud Console before changing the admin string. The made-for-kids guide's "5000 videos" figure also does not match a cost of 1 per `videos.list` call.

### Gaps

- The Branding Guidelines defer minimum logo pixel sizes to "the YouTube brand site" and do not restate those pixels on the developer page.
- No sentence was found that exempts a bare video ID from the definition of API Data. Treat the ID as stored API data and refresh it with the rest of the row.
- The quota calculator was taken from the search-result extract of the official page, not a second full-page read. The conflict with the made-for-kids guide's 5,000-video example is unresolved.

## Can an LMS fetch caption tracks, or must it use the player?

### Takeaway

For someone else's video, the LMS cannot download the transcript through the Data API. `captions.list` and `captions.download` require OAuth, and download requires permission to edit that video. The supported accessibility path is the player's own captions (`cc_load_policy`, `cc_lang_pref`, and the player captions module). `youtube.com/api/timedtext` is not a documented YouTube API method; the policies forbid undocumented APIs.

### Cited Findings

- `contentDetails.caption` is the string `true` or `false`: "Indicates whether captions are available for the video." It does not return the track text. — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- `captions.list` (`GET https://www.googleapis.com/youtube/v3/captions`) "returns a list of caption tracks" and "the API response does not contain the actual captions." Quota cost 50. Authorization scope must be `https://www.googleapis.com/auth/youtube.force-ssl` or `https://www.googleapis.com/auth/youtubepartner`. — [Captions: list](https://developers.google.com/youtube/v3/docs/captions/list)
- `captions.download` "requires the user to have permission to edit the video." Quota cost 200. Same OAuth scopes. Optional `tfmt` values include `srt`, `ttml`, and `vtt`. Optional `tlang` asks for a machine translation. — [Captions: download](https://developers.google.com/youtube/v3/docs/captions/download)
- Player parameter `cc_load_policy=1` "causes closed captions to be shown by default, even if the user has turned captions off." `cc_lang_pref` sets the default caption language (ISO 639-1 or a BCP 47 tag) when captions are shown. `hl` sets player UI language and "also affects the default caption track," but YouTube may still pick a track from the viewer's language preferences. — [Player parameters](https://developers.google.com/youtube/player_parameters)
- The only player module documented for options is `captions`. Documented options are `fontSize` (`-1` through `3`) and `reload` (set `true` to reload caption data). `onApiChange` signals that the module loaded. The reference does not list an option that returns caption text to the page. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- "You must not use undocumented APIs without express permission. You must access data from YouTube API services only according to the means stipulated in the authorized documentation of that YouTube API service." — [Developer Policies §III.D.7](https://developers.google.com/youtube/terms/developer-policies)
- A 2019 Able Player issue discusses `https://www.youtube.com/api/timedtext` and records the maintainer's "concerns about its lack of official documentation." That thread is not YouTube documentation. — [Able Player issue 251](https://github.com/ableplayer/ableplayer/issues/251)

### Inferences

- Lesson player for third-party videos: set `cc_load_policy=1` and `cc_lang_pref` to the lesson language, and tell students captions live in the YouTube player. Use `contentDetails.caption` only as a hint that a track may exist.
- `captions.download` is a fit only when the LMS user is the owner or an editor of that video (the school's own channel), with OAuth, and the downloaded track is still API data subject to the storage rules. It is not a general transcript API for search results.
- Calling timedtext, or any unpublished caption URL, to fill an LMS transcript panel conflicts with §III.D.7. This note does not describe that request.

### Gaps

- No current Google page was found that names `timedtext` in order to deprecate it. Absence from the Data API method list and from the IFrame reference, plus §III.D.7, is the basis for treating it as unsupported. A private written permission from YouTube would change that for the holder of the permission; nothing retrieved here grants it.
- Whether a caption file downloaded by the video owner may be shown as a transcript beside the embed, and for how long, is not spelled out beyond the general API-data rules. The separate-audio/video ban is about audiovisual components, not about caption text, but no page says caption text may be displayed outside the player.

## Privacy: nocookie, Restricted Mode, made-for-kids, and age-restricted playback

### Takeaway

`youtube-nocookie.com` is YouTube's privacy-enhanced embed: that view is not used to personalize YouTube or off-site ads. It does not replace a child-directed designation. Restricted Mode for a school network is a DNS or `YouTube-Restrict` header setting, not an embed parameter. Every embedded video's `status.madeForKids` value must be checked; made-for-kids players need tracking off and COPPA/GDPR-compliant collection. A child-directed LMS has further duties under the API Terms and policies.

### Cited Findings

- Privacy-enhanced mode: change the embed domain from `https://www.youtube.com` to `https://www.youtube-nocookie.com`. Views in that mode "will not be used to personalize the YouTube browsing experience" inside that player or later on YouTube, and ads in that player "will likewise be non-personalized." The view "will not be used to personalize advertising shown to the viewer outside of your site or app." Network admins must allow `youtube-nocookie.com`. "Privacy Enhanced Mode is available only for embedded players on websites." Apps should use "a WebView instance of the embedded player." The API Terms and Developer Policies still apply. — [Embed videos & playlists](https://support.google.com/youtube/answer/171780?hl=en)
- The same help page: a child-oriented site or app that embeds YouTube "must self-designate" with Google's tools, "even if you embed YouTube videos with the Privacy Enhanced Mode player." That designation "will ensure Google does not serve personalized ads on these sites or apps and some features will be turned off in the embedded player." — [Embed videos & playlists](https://support.google.com/youtube/answer/171780?hl=en)
- When the embedded player loads, the client "collects and shares some basic user data with YouTube via the YouTube embedded player" for thumbnail, title, playability, content restrictions, and fraud. More data is shared on playback. Autoplay shares playback data on page load. "You can limit the data shared with YouTube before a user interacts with the YouTube embedded player by setting Autoplay to `false`." — [Developer Policies §III.E.4.i](https://developers.google.com/youtube/terms/developer-policies)
- §III.E.4.j: clients "must look up the Made For Kids status of each YouTube video" they embed. For each video "designated Made For Kids," they "must turn off tracking" and keep "all data collection with respect to that player" compliant with COPPA and GDPR. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- Lookup: `videos.list` with the video ID and at least `part=id,status`, then read `status.madeForKids`. — [Made for Kids status](https://developers.google.com/youtube/data/guides/made_for_kids_status)
- `status.madeForKids` is "the current 'made for kids' status of the video." `status.selfDeclaredMadeForKids` "is only returned if the channel owner authorized the API request." — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- API Terms §9.1(iii): a child-directed API client (children as defined under COPPA, GDPR, and other applicable law) must comply with Developer Policies §III.J, including notifying Google. Write actions from users of a known child-directed client "will not be implemented on YouTube." — [API Terms §9.1](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- §III.J: a child-directed client must stay COPPA- and GDPR-compliant, must notify Google using the tools the policy links to, must not use personalized ads or remarketing on that client's users, and must not perform YouTube write actions (upload, comment, playlist create/share) through that client. — [Developer Policies §III.J](https://developers.google.com/youtube/terms/developer-policies)
- YouTube Terms age rule, 15 December 2023: "You must be at least 13 years old to use the Service; however, children of all ages may use the Service and YouTube Kids (where available) if enabled by a parent or legal guardian." — [YouTube Terms](https://www.youtube.com/t/terms)
- School Restricted Mode, for networks used by employees or students, not as an ISP setting: Strict or Moderate. DNS CNAME for `www.youtube.com`, `m.youtube.com`, `youtubei.googleapis.com`, `youtube.googleapis.com`, and `www.youtube-nocookie.com` to `restrict.youtube.com` (strict) or `restrictmoderate.youtube.com` (moderate). Or send header `YouTube-Restrict: Strict` or `YouTube-Restrict: Moderate` on requests to those hosts. "HTTP header filtering is not supported for native mobile applications." Do not CNAME `youtube.com`, `s.ytimg.com`, `youtu.be`, `googleapis.com`, or `youtubeeducation.com`. — [Control YouTube content available to users](https://support.google.com/a/answer/6214622?hl=en)
- EU users: the API client must comply with the EU User Consent Policy. — [API Terms §9.2](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- Each API client must have a published privacy policy describing what it collects and stores, including API data, before users access the features. — [API Terms §7](https://developers.google.com/youtube/terms/api-services-terms-of-service); [Developer Policies §III.A.2](https://developers.google.com/youtube/terms/developer-policies)

### Inferences

- For a logged-in school web app, prefer `https://www.youtube-nocookie.com/embed/VIDEO_ID` with autoplay off, so playback data is not sent merely because the lesson page opened. Keep the Referer requirement; nocookie does not remove error 153.
- On each embed, branch on `status.madeForKids`. If true, disable the LMS's own trackers for that player (analytics, session replay, ad pixels) in addition to relying on YouTube. Nocookie is not that check.
- If the product, or a section of it, is directed to children, the operator has to notify Google and must not expose YouTube write actions (comments, playlist saves, uploads) in that client. A K-12 deployment may or may not be "child-directed" under COPPA depending on the school and the age mix; the policies do not define a school LMS as automatically in or out.
- Restricted Mode belongs in the school's network or device management, and it must cover `www.youtube-nocookie.com` or privacy-enhanced embeds can bypass the restriction. The LMS should not try to spoof Restricted Mode inside the iframe URL, and it must not proxy around a region or Restricted Mode block.

### Gaps

- The policy and help pages say to self-designate or notify Google "using the tools provided," but the fetched text did not include the destination URL.
- `search.list`'s `safeSearch` parameter was not re-read for this note. Do not confuse it with network Restricted Mode. Whether `safeSearch=strict` matches Strict Restricted Mode was not verified here.
- No page retrieved here states how an embed behaves for `ytAgeRestricted` when the student is signed out or under 18.
- The help text says privacy-enhanced mode "is available only for embedded players on websites" and, in the next instruction, that applications should use a WebView of the embedded player. It does not say whether a desktop WebView receives privacy-enhanced behavior.

## What fails after search if the video is later deleted, made private, or region-blocked?

### Takeaway

Search once, store the video ID, revalidate with `videos.list`, then render the iframe. Deletion and a later private setting surface as player error 100 (and the ID should disappear for a non-owner on refresh). Embedding turned off or a Content ID / owner block surfaces as 101 or 150. Region blocks remain visible in `contentDetails.regionRestriction` and must not be bypassed. A failed embed should fall back to the watch page only when the video still exists and the watch page is the right recovery; a deleted or private video has nowhere to play.

### Cited Findings

- Player parameters tell Data API clients to build `https://www.youtube.com/embed/VIDEO_ID` from IDs "retriev[ed] … from search results, playlist item resources, video resources, or other resources." — [Player parameters](https://developers.google.com/youtube/player_parameters)
- Error `100`: video "has been removed (for any reason) or has been marked as private." Errors `101` and `150`: owner does not allow embedded playback. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- `status.privacyStatus` can be `public`, `private`, or `unlisted`. `status.embeddable` can change independently of privacy. Region rules are the `regionRestriction` object described above. — [Videos resource](https://developers.google.com/youtube/data/reference/rest/v3/videos)
- Stored non-authorized API data must be deleted or refreshed within 30 days, and clients should reflect metadata changes "as quickly as possible." For the authorized-statistics case, the client must verify every 30 days "that the video has not been deleted." — [Developer Policies §III.E.4](https://developers.google.com/youtube/terms/developer-policies)
- Geographical restrictions must not be circumvented. — [Developer Policies §III.I.13](https://developers.google.com/youtube/terms/developer-policies)
- Error 153 still leaves a "Watch on YouTube" control, but that control is about a missing Referer, not about a deleted video. — [Embed videos & playlists](https://support.google.com/youtube/answer/171780?hl=en)

### Inferences

- Practical loop for this LMS: `search.list` only to choose a video; persist the ID and display fields; on lesson open (and at least every 30 days) call `videos.list` with `part=snippet,contentDetails,status`. If the item is missing, show a "video unavailable" state and delete the cached metadata. If `embeddable` is false or `regionRestriction` excludes the deployment country, do not iframe it. If the iframe then returns 101/150, replace the player with a link to the watch page. If it returns 100, do not link to a watch page that will also fail; show the unavailable state.
- Unlisted videos are a documented privacy status. This note did not confirm that `search.list` returns them. A stored unlisted ID can still be loaded by ID if the uploader left it unlisted and embeddable; a later switch to private should be treated like error 100.
- Do not cache the search response as the lesson's permanent catalog. Search results are API data under the same 30-day rule, and §III.C.5 forbids rewriting them when they are shown as search results.

### Gaps

- The `videos.list` page was not re-fetched for the exact response shape when an ID is unknown or private (empty `items` versus an error). Player error 100 is the documented playback signal for removed or private. Confirm the list-call behavior against the current `videos.list` reference before coding the refresh parser.
- No page stated whether a region-blocked video is omitted from `videos.list` or returned with `regionRestriction` populated. The field exists so clients can read it; do not assume the API caller's IP is the student's playback country. Pass the school's country into the product check explicitly if students and the server are in different regions. That last sentence is an inference from the field definition, not a documented query parameter.

## Official alternatives to the Data API, and what conflicts with the terms

### Takeaway

oEmbed and the IFrame Player API are official YouTube embed paths and do not replace the Data API for search. oEmbed returns an iframe snippet, title, author, and thumbnail, with no API key. Scraping YouTube and using a downloader such as yt-dlp to save or split streams conflicts with the YouTube Terms, the API scraping ban, and the ban on non-API access to audiovisual content. This note does not describe how those tools work.

### Cited Findings

- IFrame Player API and the embed URL are documented YouTube developer features, as cited above. The player can be used without the Data API; the Data API is how this LMS already discovers IDs. — [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference); [Player parameters](https://developers.google.com/youtube/player_parameters)
- YouTube's oEmbed endpoint is `https://www.youtube.com/oembed`, with the watch URL in the `url` parameter and `format=json`. The oEmbed spec's video type requires `html`, `width`, and `height`. A current provider write-up shows a JSON body whose `html` is an iframe pointed at `https://www.youtube.com/embed/VIDEO_ID`, plus `title`, `author_name`, `provider_name` "YouTube", and `thumbnail_url`. — [oembed.org](https://oembed.org/docs); [YouTube oEmbed provider summary](https://www.oembedproviders.com/oembed-providers/youtube/)
- The older example on oembed.com still shows a Flash `<object>` / `<embed>` pointing at `https://www.youtube.com/v/VIDEO_ID`, not an iframe. — [oembed.com](https://oembed.com/)
- No oEmbed method appeared in the YouTube Data API method list retrieved for captions and videos. oEmbed was not found as a page under `developers.google.com/youtube` in this search.
- Developer Policies §III.E.6: clients must not "scrape YouTube Applications or Google Applications, or obtain scraped YouTube data or content." Public search engines may scrape "only in accordance with YouTube's robots.txt file or with YouTube's prior written permission." — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- §III.D.7 (undocumented APIs) and §III.I.14 (no technology other than the YouTube API Services to retrieve API data or any portion of audiovisual content) are quoted above. §III.E.1 bans downloading or storing audiovisual copies and offline playback. — [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- YouTube Terms, 15 December 2023, ban download except as the Service expressly authorizes or with prior written permission, ban circumventing copy controls, and ban automated access by "robots, botnets or scrapers" outside the `robots.txt` exception. — [YouTube Terms](https://www.youtube.com/t/terms)

### Inferences

- oEmbed is a reasonable no-key way to turn a known watch URL into YouTube's iframe HTML plus title and thumbnail. It does not search, does not return `embeddable`, `licensedContent`, `madeForKids`, or `regionRestriction`, and it does not relax the player, storage, or attribution rules if the same product is also a YouTube API client. Prefer the iframe HTML YouTube returns; do not swap in a custom player. The Flash sample on oembed.com is stale relative to the iframe sample on oembed.org.
- If oEmbed metadata is kept beside Data API metadata, apply the same 30-day refresh-or-delete practice. oEmbed's response is still YouTube content under the consumer terms even if it is not "API Data" from `googleapis.com`.
- yt-dlp and page scraping are outside both the API agreement and the consumer terms because they obtain audiovisual content, or YouTube data, by a means other than the API services and the embeddable player. Naming that conflict is enough for the engineering note; no procedure belongs in the LMS.

### Gaps

- YouTube does not, on the pages found here, publish an oEmbed reference next to the Data API. The endpoint is real enough to be the example in the oEmbed specification, but it was not confirmed against a `developers.google.com` page in this pass. Response fields can change; the Flash example and the iframe example already disagree.
- Whether oEmbed JSON is "API Data" under the 30-day clause, or only "Content" under the consumer terms, is not answered by a Google sentence retrieved here. The safer implementation is to refresh or drop it on the same 30-day cycle.
