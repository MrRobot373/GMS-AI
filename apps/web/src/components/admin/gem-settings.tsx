"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Section } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { msg, useT } from "@/i18n";
import { get, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import { REASON_NAMES } from "@/lib/learning";
import type { VideoReason } from "@aatmiq/shared";

type WebProvider = "searxng" | "ollama" | "brave" | "tavily" | "serper";

interface Gem {
  modules: { learning: boolean; calculators: boolean; knowledge: boolean };
  betaCalculators: boolean;
  coursesPerDay: number;
  lessonsPerDay: number;
  videoSource: "auto" | "ytdlp" | "api" | "off";
  youtube: "settings" | "environment" | "none";
  videos: { source: "api" | "ytdlp" | null; ytDlp: { version: string | null; error: string | null; cookies: boolean; proxy: boolean } };
  /** The provider in use (WEB_SEARCH_PROVIDER until one is chosen here). */
  webProvider: "off" | WebProvider;
  webUrl: string | null;
  chatWebSearch: boolean;
  lessonCheck: boolean;
  web: {
    provider: WebProvider | null;
    providerFrom: "settings" | "environment" | "none";
    url: string | null;
    urlFrom: "settings" | "environment" | "work" | "none";
    key: "settings" | "environment" | "none";
    ready: boolean;
  };
}

interface WebTest {
  ok: boolean;
  results: number;
  ms: number;
  sample: { title: string; url: string }[];
  error: string | null;
}

interface RatedVideo {
  videoId: string;
  title: string | null;
  channel: string | null;
  up: number;
  ok: number;
  down: number;
}

/** GET /api/admin/gem/videos/feedback */
interface VideoReport {
  totals: { ratings: number; up: number; ok: number; down: number; videos: number; people: number; blocked: number };
  mostDisliked: (RatedVideo & { reasons: { reason: VideoReason; n: number }[]; leftOut: boolean })[];
  mostLiked: RatedVideo[];
  blocked: { videoId: string; title: string | null; channel: string | null; reason: string | null; blockedBy: string | null; createdAt: string }[];
}

const WEB_PROVIDERS: { value: "off" | WebProvider; label: string }[] = [
  { value: "off", label: msg("Off") },
  { value: "searxng", label: msg("SearXNG (self-hosted)") },
  { value: "ollama", label: msg("Ollama web search") },
  { value: "brave", label: msg("Brave Search") },
  { value: "tavily", label: msg("Tavily") },
  { value: "serper", label: msg("Serper") },
];

const providerName = (p: "off" | WebProvider) => WEB_PROVIDERS.find((x) => x.value === p)!.label;

/** A setting with its switch. */
function switchRow(name: string, hint: string, on: boolean, flip: (v: boolean) => void) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div>
        <div className="text-[13.5px] text-fg">{name}</div>
        <div className="text-[12.5px] text-fg-subtle">{hint}</div>
      </div>
      <Switch checked={on} onCheckedChange={flip} label={name} />
    </div>
  );
}

/** A part of the page that didn't load: what, why, and Try again. */
function LoadFailed({ text, error, retry, busy }: { text: string; error: Error | null; retry: () => void; busy: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-danger" role="alert">
      <span>
        {text}
        {error?.message ? ` ${error.message}` : ""}
      </span>
      <Button size="sm" variant="outline" onClick={retry} loading={busy}>
        {t("Try again")}
      </Button>
    </div>
  );
}

/** Web search for chat and lessons: the provider, its server or key, a test, and where it's used. */
function WebSearchCard({ g, save }: { g: Gem; save: (body: Record<string, unknown>) => void }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [outcome, setOutcome] = useState<WebTest | null>(null);
  const test = useMutation({
    mutationFn: (body: Record<string, unknown>) => post<WebTest>("/api/admin/gem/test-web", body),
    onSuccess: setOutcome,
    onError: (e: Error) => toast.error(e.message),
  });
  const p = g.webProvider;
  const typedUrl = url ?? g.webUrl ?? "";
  const urlHint =
    g.web.urlFrom === "work" ? t("Same as Work AI: {url}", { url: g.web.url ?? "" }) : g.web.urlFrom === "environment" ? t("From WEB_SEARCH_URL: {url}", { url: g.web.url ?? "" }) : "http://searxng:8080";
  const name = t(providerName(p));
  // Where search is used now: the two switches below decide, not only the provider.
  const status = g.web.ready
    ? g.chatWebSearch && g.lessonCheck
      ? t("Chat and lessons search the web with {provider}.", { provider: name })
      : g.chatWebSearch
        ? t("Chat searches the web with {provider}. Lessons don't: lesson checks are off.", { provider: name })
        : g.lessonCheck
          ? t("Lessons are researched with {provider}. Chat doesn't: web search in chat is off.", { provider: name })
          : t("{provider} is set up, but web search in chat and lesson checks are both off.", { provider: name })
    : p === "off"
      ? t("Off: chat and lessons don't search the web.")
      : p === "searxng"
        ? t("Add your SearXNG server's address, or set one in Admin → Work AI.")
        : t("Add the API key from your {provider} account.", { provider: name });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13.5px] text-fg">
            {t("Web search")}
            {g.web.providerFrom === "environment" && p !== "off" && <Badge>{t("From WEB_SEARCH_PROVIDER")}</Badge>}
          </div>
          <div className="text-[12.5px] text-fg-subtle">{status}</div>
        </div>
        <select
          value={p}
          onChange={(e) => {
            setOutcome(null);
            save({ webProvider: e.target.value });
          }}
          aria-label={t("Web search provider")}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]"
          data-testid="web-provider"
        >
          {WEB_PROVIDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </div>
      {p === "searxng" && (
        <Field label={t("SearXNG URL")} hint={t("Leave empty to use WEB_SEARCH_URL when it's set, else Work AI's server.")}>
          <div className="flex flex-wrap gap-2">
            <Input value={typedUrl} onChange={(e) => setUrl(e.target.value)} placeholder={urlHint} className="max-w-sm" data-testid="web-url" />
            <Button
              disabled={typedUrl.trim() === (g.webUrl ?? "")}
              onClick={() => {
                save({ webUrl: typedUrl.trim() });
                setUrl(null);
              }}
            >
              {t("Save URL")}
            </Button>
          </div>
        </Field>
      )}
      {p !== "off" && p !== "searxng" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted">
            {t("API key")}
            <Badge tone={g.web.key === "none" ? "neutral" : "success"}>{g.web.key === "settings" ? t("Stored encrypted") : g.web.key === "environment" ? t("From WEB_SEARCH_KEY") : t("Not set")}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("Paste a key")} className="max-w-sm" autoComplete="off" data-testid="web-key" />
            <Button
              disabled={!key.trim()}
              onClick={() => {
                save({ webProvider: p, webKey: key.trim() });
                setKey("");
              }}
            >
              {t("Save key")}
            </Button>
            {g.web.key === "settings" && (
              <Button variant="ghost" onClick={() => save({ webKey: "" })}>
                {t("Remove")}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-fg-subtle">{t("Each provider keeps its own key, and a key is only ever sent to its provider.")}</p>
        </div>
      )}
      {p !== "off" && (
        <div className="space-y-2">
          <Button
            variant="outline"
            loading={test.isPending}
            onClick={() => test.mutate({ provider: p, ...(p === "searxng" && url !== null ? { url: typedUrl.trim() } : {}), ...(key.trim() ? { key: key.trim() } : {}) })}
            data-testid="web-test"
          >
            {t("Test")}
          </Button>
          {outcome &&
            (outcome.ok ? (
              <div className="space-y-1 text-[12.5px]">
                <div className="text-success">{t("Works: {results} results in {ms} ms for a test search", { results: outcome.results, ms: outcome.ms })}</div>
                <ul className="space-y-0.5 text-fg-subtle">
                  {outcome.sample.map((r) => (
                    <li key={r.url} className="truncate">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-fg hover:underline">
                        {r.title}
                      </a>{" "}
                      · {new URL(r.url).hostname}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-[12.5px] text-danger">{outcome.error ?? t("Search failed")}</div>
            ))}
        </div>
      )}
      <p className="text-[12.5px] text-fg-subtle">
        {t("Search words go to the provider you choose; with SearXNG they stay on your own server. Pages from the results are read by this server, at public addresses only. Links come only from search results, never from what a model wrote.")}
      </p>
      <div>
        {switchRow(t("Let people search the web in chat"), t("A Search the web switch in the chat box, when a provider is set."), g.chatWebSearch, (v) => save({ chatWebSearch: v }))}
        {switchRow(
          t("Check lessons before they're saved"),
          t("Your Advanced model checks each lesson's facts, formulas and references, with web sources when search is set up, and corrections are listed with the lesson. Uses more tokens."),
          g.lessonCheck,
          (v) => save({ lessonCheck: v }),
        )}
      </div>
    </Card>
  );
}

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
const subhead = "mb-1 text-[12px] font-medium tracking-wide text-fg-subtle uppercase";

/** One video in the ratings lists: its title (a link built from the ID), channel and what's said of it. */
function VideoLine({ v, detail, action }: { v: { videoId: string; title: string | null; channel: string | null }; detail: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-[13px] text-fg underline-offset-2 hover:underline">
          {v.title ?? v.videoId}
        </a>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
          {v.channel && <span>{v.channel}</span>}
          {detail}
        </div>
      </div>
      {action}
    </li>
  );
}

/** How people rated lesson videos: totals, the most disliked (with Block), the most liked, and what's blocked. */
function VideoRatings() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-gem-videos"], queryFn: () => get<VideoReport>("/api/admin/gem/videos/feedback") });
  // Block and Unblock move the row to the other list: focus goes to the button now in its place
  // (the next row's), or to the Blocked videos heading, not back to the top of the page.
  const box = useRef<HTMLDivElement>(null);
  const moved = useRef<{ list: "disliked" | "blocked"; index: number } | null>(null);
  useEffect(() => {
    const m = moved.current;
    if (!m || !q.data) return;
    moved.current = null;
    const buttons = box.current?.querySelectorAll<HTMLButtonElement>(`[data-list="${m.list}"] button`);
    const next = buttons?.length ? buttons[Math.min(m.index, buttons.length - 1)] : null;
    (next ?? box.current?.querySelector<HTMLElement>("[data-heading=blocked]"))?.focus();
  }, [q.data]);
  const block = useMutation({
    mutationFn: (b: { videoId: string; blocked: boolean }) => put(`/api/admin/gem/videos/${encodeURIComponent(b.videoId)}/block`, { blocked: b.blocked }),
    onSuccess: (_, b) => {
      qc.invalidateQueries({ queryKey: ["admin-gem-videos"] });
      toast.success(b.blocked ? t("Blocked: lessons won't offer it again") : t("Unblocked"));
    },
    onError: (e: Error) => {
      moved.current = null;
      toast.error(e.message);
    },
  });
  const act = (list: "disliked" | "blocked", index: number, videoId: string) => {
    moved.current = { list, index };
    block.mutate({ videoId, blocked: list === "disliked" });
  };
  if (!q.data && q.isError) return <LoadFailed text={t("Ratings couldn't be loaded.")} error={q.error} retry={() => q.refetch()} busy={q.isFetching} />;
  if (!q.data) return <Skeleton className="h-16" />;
  const r = q.data;
  const counts = (v: { up: number; ok: number; down: number }) => t("{up} helpful, {ok} okay, {down} not helpful", { up: v.up, ok: v.ok, down: v.down });
  const busy = (id: string) => block.isPending && block.variables?.videoId === id;
  return (
    <div ref={box} className="space-y-4 border-t border-border pt-4">
      <div>
        <div className="text-[13.5px] text-fg">{t("Ratings")}</div>
        <div className="text-[12.5px] text-fg-subtle">
          {r.totals.ratings
            ? `${t.n(r.totals.ratings, "{n} rating", "{n} ratings")} · ${t.n(r.totals.people, "{n} person", "{n} people")} · ${counts(r.totals)}`
            : t("No ratings yet. People rate each lesson video Helpful, Okay or Not helpful, and new lessons leave out videos your organization found unhelpful.")}
        </div>
      </div>
      {r.mostDisliked.length > 0 && (
        <div>
          <h3 className={subhead}>{t("Most disliked")}</h3>
          <ul data-list="disliked">
            {r.mostDisliked.map((v, i) => (
              <VideoLine
                key={v.videoId}
                v={v}
                detail={
                  <>
                    <span>{counts(v)}</span>
                    {v.reasons.map((x) => (
                      <Badge key={x.reason}>
                        {t(REASON_NAMES[x.reason])} {x.n}
                      </Badge>
                    ))}
                    {v.leftOut && <Badge tone="warning">{t("Not offered to new lessons")}</Badge>}
                  </>
                }
                action={
                  <Button size="sm" variant="outline" loading={busy(v.videoId)} onClick={() => act("disliked", i, v.videoId)} aria-label={t("Block {title}", { title: v.title ?? v.videoId })}>
                    {t("Block")}
                  </Button>
                }
              />
            ))}
          </ul>
        </div>
      )}
      {r.mostLiked.length > 0 && (
        <div>
          <h3 className={subhead}>{t("Most liked")}</h3>
          <ul>
            {r.mostLiked.map((v) => (
              <VideoLine key={v.videoId} v={v} detail={<span>{counts(v)}</span>} />
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className={cn(subhead, "outline-none")} tabIndex={-1} data-heading="blocked">
          {t("Blocked videos")}
        </h3>
        {r.blocked.length ? (
          <ul data-list="blocked">
            {r.blocked.map((v, i) => (
              <VideoLine
                key={v.videoId}
                v={v}
                detail={
                  <>
                    <span>
                      {v.blockedBy
                        ? t("Blocked by {name} on {date}", { name: v.blockedBy, date: t.date(v.createdAt, { day: "numeric", month: "short", year: "numeric" }) })
                        : t("Blocked on {date}", { date: t.date(v.createdAt, { day: "numeric", month: "short", year: "numeric" }) })}
                    </span>
                    {v.reason && <span>· {v.reason}</span>}
                  </>
                }
                action={
                  <Button size="sm" variant="ghost" loading={busy(v.videoId)} onClick={() => act("blocked", i, v.videoId)} aria-label={t("Unblock {title}", { title: v.title ?? v.videoId })}>
                    {t("Unblock")}
                  </Button>
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-fg-subtle">{t("No videos are blocked. A blocked video leaves the lessons that have it the next time they're opened, and isn't offered again.")}</p>
        )}
      </div>
    </div>
  );
}

/** Admin → Settings → GEM AI: switch modules on and off without touching chat, work or code. */
export function GemSettings() {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-gem"], queryFn: () => get<Gem>("/api/admin/gem") });
  const [key, setKey] = useState("");
  const [limits, setLimits] = useState<{ courses: string; lessons: string } | null>(null);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => put("/api/admin/gem", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-gem"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("Saved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data && q.isError) return <LoadFailed text={t("GEM AI settings couldn't be loaded.")} error={q.error} retry={() => q.refetch()} busy={q.isFetching} />;
  if (!q.data) return <Skeleton className="h-40" />;
  const g = q.data;
  const l = limits ?? { courses: String(g.coursesPerDay), lessons: String(g.lessonsPerDay) };
  return (
    <Section title={t("GEM AI modules")} description={t("Learning, Calculators and Knowledge. Switch one off and it disappears for everyone, without affecting Chat, Work AI or Code. Each person's access is set per workspace.")}>
      <Card className="p-5">
        {switchRow(t("Learning"), t("Courses written by your models, saved lesson by lesson."), g.modules.learning, (v) => save.mutate({ modules: { learning: v } }))}
        {switchRow(t("Calculators"), t("Tested engineering formulas, keypads, unit converter; and the calculator tool in chat."), g.modules.calculators, (v) => save.mutate({ modules: { calculators: v } }))}
        {switchRow(t("Knowledge"), t("Questions answered only from one project's documents, with citations."), g.modules.knowledge, (v) => save.mutate({ modules: { knowledge: v } }))}
        {switchRow(t("Beta calculators"), t("Calculators checked against fewer than five reference cases. Off: only the verified ones show."), g.betaCalculators, (v) => save.mutate({ betaCalculators: v }))}
      </Card>
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("New courses per person per day")}>
            <Input type="number" min={0} value={l.courses} onChange={(e) => setLimits({ ...l, courses: e.target.value })} />
          </Field>
          <Field label={t("Lessons written per person per day")}>
            <Input type="number" min={0} value={l.lessons} onChange={(e) => setLimits({ ...l, lessons: e.target.value })} />
          </Field>
        </div>
        <Button onClick={() => save.mutate({ coursesPerDay: Number(l.courses) || 0, lessonsPerDay: Number(l.lessons) || 0 })}>{t("Save limits")}</Button>
      </Card>
      <WebSearchCard g={g} save={(body) => save.mutate(body)} />
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] text-fg">{t("Lesson videos")}</div>
            <div className="text-[12.5px] text-fg-subtle">
              {g.videos.source === "ytdlp" ? t("Lessons find videos with yt-dlp now.") : g.videos.source === "api" ? t("Lessons find videos with the YouTube Data API now.") : t("Lessons get no videos now.")}
            </div>
          </div>
          <select
            value={g.videoSource}
            onChange={(e) => save.mutate({ videoSource: e.target.value })}
            aria-label={t("Where lesson videos come from")}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]"
          >
            <option value="auto">{t("Automatic: the API key if set, else yt-dlp")}</option>
            <option value="ytdlp">{t("yt-dlp (no key)")}</option>
            <option value="api">{t("YouTube Data API key")}</option>
            <option value="off">{t("Off")}</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
          yt-dlp
          <Badge tone={g.videos.ytDlp.version ? "success" : "neutral"}>{g.videos.ytDlp.version ? t("Version {v}", { v: g.videos.ytDlp.version }) : t("Not installed")}</Badge>
          {g.videos.ytDlp.cookies && <Badge>{t("Cookies file")}</Badge>}
          {g.videos.ytDlp.proxy && <Badge>{t("Proxy")}</Badge>}
        </div>
        <p className="text-[12.5px] text-fg-subtle">
          {t("yt-dlp searches YouTube without a key, the way Agent-Reach does, and each result is confirmed public through YouTube's oEmbed. Only real search results become links, never one a model wrote. If YouTube asks the server to sign in, set YT_DLP_COOKIES (a cookies.txt file) or YT_DLP_PROXY.")}
        </p>
        {!g.videos.ytDlp.version && g.videos.ytDlp.error && <p className="font-mono text-[11.5px] text-fg-subtle">{g.videos.ytDlp.error}</p>}
        <VideoRatings />
      </Card>
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-[13.5px] text-fg">
          {t("YouTube Data API key")}
          <Badge tone={g.youtube === "none" ? "neutral" : "success"}>{g.youtube === "settings" ? t("Set here") : g.youtube === "environment" ? t("From YOUTUBE_API_KEY") : t("Not set")}</Badge>
        </div>
        <p className="text-[12.5px] text-fg-subtle">{t("Optional. With a key, lessons search through the official API (10,000 quota units a day; a search costs 100). The key is stored encrypted.")}</p>
        <div className="flex flex-wrap gap-2">
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("Paste a key")} className="max-w-sm" autoComplete="off" />
          <Button disabled={!key.trim()} onClick={() => { save.mutate({ youtubeApiKey: key.trim() }); setKey(""); }}>{t("Save key")}</Button>
          {g.youtube === "settings" && (
            <Button variant="ghost" onClick={() => save.mutate({ youtubeApiKey: "" })}>{t("Remove")}</Button>
          )}
        </div>
      </Card>
    </Section>
  );
}
