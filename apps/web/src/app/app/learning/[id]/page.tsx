"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  BookOpenCheck,
  Check,
  CircleAlert,
  CircleDashed,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { VideoRating, VideoReason } from "@aatmiq/shared";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TopBar, TopBarButton } from "@/components/app/frame";
import { useCanUseModule } from "@/components/app/session";
import { domainOf, webHref } from "@/components/chat/citations";
import { Equation, MathMarkdown } from "@/components/learning/math-markdown";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Meter } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  LEVEL_NAMES,
  PART_NAMES,
  SEVERITY_NAMES,
  STAGE_TEXT,
  VIDEO_REASONS,
  WEB_PROVIDER_NAMES,
  useCourse,
  useLesson,
  type LessonDetail,
  type LessonRow,
  type LessonVerification,
  type LessonVideo,
  type VideoCounts,
} from "@/lib/learning";
import { ModuleOff } from "@/components/app/module-off";

export default function CoursePageRoute() {
  return (
    <Suspense>
      <CoursePage />
    </Suspense>
  );
}

function CoursePage() {
  const t = useT();
  const allowed = useCanUseModule("learning");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const course = useCourse(id);
  const c = course.data;
  const fromUrl = search.get("lesson");
  const ordinal = fromUrl !== null ? Number(fromUrl) : (c?.lastLesson ?? (c?.lessons.length ? 0 : null));
  const select = (n: number) => router.replace(`/app/learning/${id}?lesson=${n}`, { scroll: false });

  const generateAll = useMutation({
    mutationFn: () => post<{ queued: number }>(`/api/learning/courses/${id}/generate-all`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["course", id] });
      toast(t.n(r.queued, "{n} lesson is being written", "{n} lessons are being written"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const retry = useMutation({ mutationFn: () => post(`/api/learning/courses/${id}/retry`), onSuccess: () => qc.invalidateQueries({ queryKey: ["course", id] }), onError: (e: Error) => toast.error(e.message) });

  if (!allowed) return <ModuleOff />;
  if (course.isError) return <EmptyState title={t("Course not found")} action={<Button asChild><Link href="/app/learning">{t("Back to Learning")}</Link></Button>} />;

  const done = c?.lessons.filter((l) => l.completedAt).length ?? 0;
  const waiting = c?.lessons.filter((l) => l.status === "pending" || l.status === "failed").length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        icon={<BookOpenCheck />}
        leading={
          <Link href="/app/learning" aria-label={t("Back to Learning")} className="rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
            <ArrowLeft className="size-4" />
          </Link>
        }
        title={c?.title ?? t("Course")}
        actions={
          c?.status === "ready" && waiting > 0 ? (
            <TopBarButton onClick={() => generateAll.mutate()} disabled={generateAll.isPending}>
              <Sparkles /> {t("Write the remaining lessons")}
            </TopBarButton>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Outline */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-bg-subtle/40 lg:block">
          <div className="p-4">
            {!c ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{t(LEVEL_NAMES[c.level])}</Badge>
                  {c.tags.map((x) => (
                    <Badge key={x}>#{x}</Badge>
                  ))}
                </div>
                {c.lessons.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 text-[12px] text-fg-subtle">{t("{done} of {total} complete", { done, total: c.lessons.length })}</div>
                    <Meter value={done / c.lessons.length} />
                  </div>
                )}
                <nav className="mt-5 space-y-5" aria-label={t("Course outline")}>
                  {c.modules.map((m, mi) => (
                    <div key={mi}>
                      <div className="mb-1.5 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">
                        {mi + 1}. {m.title}
                      </div>
                      <div className="space-y-px">
                        {m.lessons.map((l) => (
                          <OutlineItem key={l.ordinal} l={l} active={l.ordinal === ordinal} onClick={() => select(l.ordinal)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </>
            )}
          </div>
        </aside>

        {/* Lesson */}
        <div className="min-h-0 flex-1 overflow-y-auto" id="lesson-scroll">
          {!c ? (
            <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-40" />
            </div>
          ) : c.status === "generating" ? (
            <EmptyState icon={<Loader2 className="size-5 animate-spin" />} title={t("Writing the course outline…")} description={t("This takes a minute with a large model. You can leave this page: it carries on.")} />
          ) : c.status === "failed" ? (
            <EmptyState
              icon={<CircleAlert className="size-5" />}
              title={t("The outline couldn't be written")}
              description={c.error ?? undefined}
              action={<Button onClick={() => retry.mutate()} loading={retry.isPending}><RefreshCw className="size-3.5" /> {t("Try again")}</Button>}
            />
          ) : ordinal !== null ? (
            <>
              {/* On narrow screens the outline is a picker. */}
              <div className="border-b border-border p-3 lg:hidden">
                <select
                  value={ordinal}
                  onChange={(e) => select(Number(e.target.value))}
                  aria-label={t("Lesson")}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px]"
                >
                  {c.lessons.map((l) => (
                    <option key={l.ordinal} value={l.ordinal}>
                      {l.ordinal + 1}. {l.title}
                    </option>
                  ))}
                </select>
              </div>
              <LessonReader courseId={id} ordinal={ordinal} total={c.lessons.length} onGo={select} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OutlineItem({ l, active, onClick }: { l: LessonRow; active: boolean; onClick: () => void }) {
  const icon =
    l.status === "generating" ? (
      <Loader2 className="size-3.5 animate-spin text-fg-subtle" />
    ) : l.status === "failed" ? (
      <CircleAlert className="size-3.5 text-danger" />
    ) : l.completedAt ? (
      <Check className="size-3.5 text-success" />
    ) : l.status === "ready" ? (
      <BookOpen className="size-3.5 text-fg-subtle" />
    ) : (
      <CircleDashed className="size-3.5 text-fg-subtle/60" />
    );
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{l.title}</span>
      {l.bookmarkedAt && <Bookmark className="mt-0.5 size-3 shrink-0 text-fg-subtle" />}
    </button>
  );
}

function Part({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6" aria-labelledby={`part-${n}`}>
      <h2 id={`part-${n}`} className="mb-3 flex items-center gap-2 text-[15px] font-medium text-fg">
        <span className="flex size-6 items-center justify-center rounded-md bg-surface-2 text-fg-muted [&>svg]:size-3.5">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const fmtDuration = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

function LessonReader({ courseId, ordinal, total, onGo }: { courseId: string; ordinal: number; total: number; onGo: (n: number) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [version, setVersion] = useState<number | null>(null);
  const lesson = useLesson(courseId, ordinal, version);
  const l = lesson.data;
  const asked = useRef<string>("");
  useEffect(() => setVersion(null), [ordinal]);
  useEffect(() => document.getElementById("lesson-scroll")?.scrollTo({ top: 0 }), [ordinal]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lesson", courseId, ordinal] });
    qc.invalidateQueries({ queryKey: ["course", courseId] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  };
  const generate = useMutation({ mutationFn: () => post(`/api/learning/courses/${courseId}/lessons/${ordinal}/generate`), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const regenerate = useMutation({ mutationFn: () => post(`/api/learning/courses/${courseId}/lessons/${ordinal}/regenerate`), onSuccess: () => { refresh(); toast(t("A new version is being written. This one stays until it's ready.")); }, onError: (e: Error) => toast.error(e.message) });
  const check = useMutation({ mutationFn: () => post(`/api/learning/courses/${courseId}/lessons/${ordinal}/check`), onSuccess: () => { refresh(); toast(t("The lesson is being checked. This version stays until the checked one is ready.")); }, onError: (e: Error) => toast.error(e.message) });
  const restore = useMutation({ mutationFn: (v: number) => post(`/api/learning/courses/${courseId}/lessons/${ordinal}/restore`, { version: v }), onSuccess: () => { setVersion(null); refresh(); } });
  const state = useMutation({
    mutationFn: (body: { completed?: boolean; bookmarked?: boolean; note?: string | null }) => put(`/api/learning/courses/${courseId}/lessons/${ordinal}/state`, body),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  // A lesson nobody has written yet is written when it's first opened.
  const key = `${courseId}:${ordinal}`;
  useEffect(() => {
    if (l && l.status === "pending" && l.current && asked.current !== key) {
      asked.current = key;
      generate.mutate();
    }
  }, [l, key, generate]);

  if (lesson.isLoading || !l) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const busy = l.status === "generating" || l.status === "pending";
  const newer = l.versions.find((v) => v.status === "generating");

  return (
    <article className="mx-auto max-w-3xl px-6 py-8 sm:px-10" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
        <span>{t("Lesson {n} of {total}", { n: ordinal + 1, total })}</span>
        {l.versions.length > 1 && (
          <select
            value={l.version}
            onChange={(e) => setVersion(Number(e.target.value))}
            aria-label={t("Version")}
            className="h-6 rounded-md border border-border bg-surface px-1.5 text-[12px]"
          >
            {l.versions.filter((v) => v.status === "ready").map((v) => (
              <option key={v.version} value={v.version}>
                {t("Version {v}", { v: v.version })}{v.current ? ` · ${t("shown")}` : ""}
              </option>
            ))}
          </select>
        )}
        {!l.current && l.status === "ready" && (
          <Button size="sm" variant="outline" onClick={() => restore.mutate(l.version)} loading={restore.isPending}>
            {t("Show this version")}
          </Button>
        )}
        {newer && (
          <span className="flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> {t("A new version is being written")}
            {newer.stage ? ` · ${t(STAGE_TEXT[newer.stage])}` : ""}
          </span>
        )}
      </div>

      {busy ? (
        <div className="mt-10">
          <EmptyState
            icon={<Loader2 className="size-5 animate-spin" />}
            title={l.stage ? t(STAGE_TEXT[l.stage]) : t("Writing this lesson…")}
            description={t("It's saved when it's done, so you only wait once.")}
          />
        </div>
      ) : l.status === "failed" ? (
        <div className="mt-10">
          <EmptyState
            icon={<CircleAlert className="size-5" />}
            title={t("This lesson couldn't be written")}
            description={l.error ?? undefined}
            action={<Button onClick={() => generate.mutate()} loading={generate.isPending}><RefreshCw className="size-3.5" /> {t("Try again")}</Button>}
          />
        </div>
      ) : l.content ? (
        <LessonBody l={l} courseId={courseId} />
      ) : null}

      {/* 10. Save, bookmark, mark complete */}
      {l.status === "ready" && (
        <footer className="mt-10 space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={l.state?.completedAt ? "secondary" : "primary"} onClick={() => state.mutate({ completed: !l.state?.completedAt })}>
              <Check className="size-3.5" /> {l.state?.completedAt ? t("Completed") : t("Mark complete")}
            </Button>
            <Button onClick={() => state.mutate({ bookmarked: !l.state?.bookmarkedAt })} aria-pressed={!!l.state?.bookmarkedAt}>
              {l.state?.bookmarkedAt ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />} {l.state?.bookmarkedAt ? t("Bookmarked") : t("Bookmark")}
            </Button>
            <Button variant="ghost" onClick={() => regenerate.mutate()} loading={regenerate.isPending} disabled={!!newer}>
              <RefreshCw className="size-3.5" /> {t("Write a new version")}
            </Button>
            {/* The check works on the current version, so it's offered only there. */}
            {l.canCheck && l.current && (
              <Button variant="ghost" onClick={() => check.mutate()} loading={check.isPending} disabled={!!newer}>
                <ShieldCheck className="size-3.5" /> {t("Check this lesson")}
              </Button>
            )}
          </div>
          <NoteBox key={`${l.id}-note`} initial={l.state?.note ?? ""} onSave={(note) => state.mutate({ note: note || null })} />
          <div className="flex justify-between">
            <Button variant="ghost" disabled={ordinal === 0} onClick={() => onGo(ordinal - 1)}>
              <ArrowLeft className="size-3.5" /> {t("Previous")}
            </Button>
            <Button variant="ghost" disabled={ordinal >= total - 1} onClick={() => onGo(ordinal + 1)}>
              {t("Next")} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </footer>
      )}
    </article>
  );
}

function NoteBox({ initial, onSave }: { initial: string; onSave: (s: string) => void }) {
  const t = useT();
  const [v, setV] = useState(initial);
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-fg-muted">{t("Your notes")}</span>
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== initial && onSave(v)}
        rows={2}
        maxLength={4000}
        placeholder={t("Only you see these. Saved when you click away.")}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-fg-subtle focus:border-border-strong"
      />
    </label>
  );
}

function LessonBody({ l, courseId }: { l: LessonDetail; courseId: string }) {
  const t = useT();
  const c = l.content!;
  const [checkOpen, setCheckOpen] = useState(false);
  return (
    <div className="mt-3 space-y-8">
      {/* 1. Title and objectives */}
      <header>
        <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em] text-fg">{c.title}</h1>
        {l.verification && <CheckBadges v={l.verification} onOpen={() => setCheckOpen(true)} />}
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg">
            <Target className="size-4 text-fg-subtle" /> {t("You'll be able to")}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-fg-muted">
            {c.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      </header>

      {/* 2. Prerequisites and theory */}
      <Part n={2} icon={<BookOpen />} title={t("Prerequisites and theory")}>
        {c.prerequisites.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {c.prerequisites.map((p, i) => (
              <Badge key={i}>{p}</Badge>
            ))}
          </div>
        )}
        <MathMarkdown content={c.theory} />
      </Part>

      {/* 3. Explanation */}
      <Part n={3} icon={<Lightbulb />} title={t("Explanation")}>
        <MathMarkdown content={c.explanation} />
      </Part>

      {/* 4. Equations, units, symbols, validity */}
      {c.equations.length > 0 && (
        <Part n={4} icon={<Sigma />} title={t("Equations and units")}>
          <div className="space-y-3">
            {c.equations.map((e, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 text-[13px] font-medium text-fg">{e.name}</div>
                <Equation latex={e.latex} expression={e.expression} />
                {e.symbols.length > 0 && (
                  <table className="mt-3 w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-fg-subtle">
                        <th className="py-1 pr-3 font-normal">{t("Symbol")}</th>
                        <th className="py-1 pr-3 font-normal">{t("Meaning")}</th>
                        <th className="py-1 font-normal">{t("Unit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.symbols.map((s, j) => (
                        <tr key={j} className="border-t border-border">
                          <td className="py-1 pr-3 font-mono text-fg">{s.symbol}</td>
                          <td className="py-1 pr-3 text-fg-muted">{s.meaning}</td>
                          <td className="py-1 font-mono text-fg-muted">{s.unit || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                  <span className="font-medium">{t("Applies when:")}</span> {e.validity}
                </p>
              </div>
            ))}
          </div>
        </Part>
      )}

      {/* 5. Worked example */}
      <Part n={5} icon={<ListChecks />} title={t("Worked example")}>
        <div className="rounded-xl border border-border bg-surface p-4">
          <MathMarkdown content={c.workedExample.problem} />
          {c.workedExample.given.length > 0 && (
            <div className="mt-3">
              <div className="text-[12px] font-medium text-fg-subtle uppercase">{t("Given")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-fg-muted">
                {c.workedExample.given.map((g, i) => (
                  <li key={i}>
                    <MathMarkdown content={g} className="inline" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px]">
            {c.workedExample.steps.map((s, i) => (
              <li key={i}>
                <MathMarkdown content={s} />
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-[13.5px] text-success">
            <span className="font-medium">{t("Answer:")}</span> <MathMarkdown content={c.workedExample.answer} className="inline" />
          </div>
        </div>
      </Part>

      {/* 6. Diagrams: only real, referenced figures */}
      {c.diagrams.length > 0 && (
        <Part n={6} icon={<ImageIcon />} title={t("Diagrams to look at")}>
          <p className="mb-3 text-[12.5px] text-fg-subtle">{t("GEM AI doesn't draw made-up figures. These are published figures worth finding.")}</p>
          <div className="space-y-2">
            {c.diagrams.map((d, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-[13.5px] font-medium text-fg">{d.title}</div>
                <p className="mt-1 text-[13px] text-fg-muted">{d.description}</p>
                <p className="mt-2 text-[12.5px] text-fg-subtle">
                  {t("Find it in:")} {d.reference}
                </p>
              </div>
            ))}
          </div>
        </Part>
      )}

      {/* 7. Common mistakes */}
      <Part n={7} icon={<AlertTriangle />} title={t("Common mistakes")}>
        <ul className="space-y-1.5 text-[13.5px]">
          {c.commonMistakes.map((m, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <MathMarkdown content={m} />
            </li>
          ))}
        </ul>
      </Part>

      {/* 8. Videos (YouTube search: yt-dlp or the Data API) and references */}
      <Part n={8} icon={<PlayCircle />} title={t("Videos and references")}>
        {l.videos && l.videos.length > 0 ? (
          <LessonVideos courseId={courseId} ordinal={l.ordinal} videos={l.videos} />
        ) : (
          <p className="text-[13px] text-fg-subtle">
            {l.videosNote === "not_configured"
              ? t("Video suggestions are off: your admin can turn them on in Admin → Settings.")
              : l.videosNote === "blocked"
                ? t("YouTube asked this server to sign in, so no videos were added. Your admin can give yt-dlp a cookies file or a proxy.")
                : l.videosNote === "quota"
                ? t("YouTube's daily quota is used up. Videos are added again tomorrow when you open the lesson.")
                : l.videosNote === "unavailable"
                  ? t("YouTube couldn't be reached when this lesson was written.")
                  : t("No suitable videos were found.")}
          </p>
        )}
        {c.references.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-[13px]">
            {c.references.map((r, i) => (
              <li key={i} className="flex gap-2">
                <Badge className="shrink-0">{r.kind}</Badge>
                <span className="text-fg">
                  {r.title}
                  {r.author ? <span className="text-fg-muted"> · {r.author}</span> : null}
                  {r.note ? <span className="text-fg-subtle"> · {r.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-fg-subtle">{t("References are suggested by the model: check them before you rely on them.")}</p>
      </Part>

      {/* 9. Takeaways */}
      <Part n={9} icon={<Check />} title={t("Takeaways")}>
        <ul className="space-y-1.5 text-[13.5px]">
          {c.takeaways.map((k, i) => (
            <li key={i} className="flex gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              <MathMarkdown content={k} />
            </li>
          ))}
        </ul>
      </Part>

      {l.verification && <CheckDetails v={l.verification} open={checkOpen} onToggle={setCheckOpen} />}
    </div>
  );
}

type Rated = { myRating: VideoRating | null; myReason: VideoReason | null; counts: VideoCounts };

/** The lesson's videos (up to seven), each rated Helpful, Okay or Not helpful: ratings steer later picks for everyone. */
function LessonVideos({ courseId, ordinal, videos }: { courseId: string; ordinal: number; videos: LessonVideo[] }) {
  const t = useT();
  const qc = useQueryClient();
  const rate = useMutation({
    mutationFn: (b: { videoId: string; rating: VideoRating | null; reason?: VideoReason | null }) =>
      put<Rated>(`/api/learning/courses/${courseId}/lessons/${ordinal}/videos/${encodeURIComponent(b.videoId)}/feedback`, { rating: b.rating, reason: b.reason ?? null }),
    // One rating per person and video: every cached version of this lesson shows it.
    onSuccess: (r, b) =>
      qc.setQueriesData<LessonDetail>({ queryKey: ["lesson", courseId, ordinal] }, (old) =>
        old?.videos ? { ...old, videos: old.videos.map((v) => (v.videoId === b.videoId ? { ...v, ...r } : v)) } : old,
      ),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {videos.map((v) => (
          <VideoCard key={v.videoId} v={v} busy={rate.isPending && rate.variables?.videoId === v.videoId} onRate={(rating, reason) => rate.mutate({ videoId: v.videoId, rating, reason })} />
        ))}
      </div>
      <p className="mt-2 text-[12px] text-fg-subtle">{t("Your ratings help pick better videos for everyone in your organization.")}</p>
    </>
  );
}

const chip = (on: boolean) =>
  cn(
    "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11.5px] transition-colors disabled:opacity-50 [&_svg]:size-3",
    on ? "border-accent-line bg-accent-soft text-accent-text" : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
  );

function VideoCard({ v, busy, onRate }: { v: LessonVideo; busy: boolean; onRate: (rating: VideoRating | null, reason?: VideoReason | null) => void }) {
  const t = useT();
  // Not helpful: folded away, with Undo and an optional reason.
  if (v.myRating === "down") {
    return (
      <div className="rounded-xl border border-border bg-surface p-3" data-testid="video-not-helpful">
        <div className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-muted">
          <ThumbsDown className="size-3.5" aria-hidden />
          <span>{t("You marked this not helpful")}</span>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => onRate(null)} disabled={busy} className="text-fg underline-offset-2 hover:underline disabled:opacity-50">
            {t("Undo")}
          </button>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-subtle">{v.title}</div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t("Why wasn't it helpful?")}>
          {VIDEO_REASONS.map((r) => (
            <button key={r.value} type="button" aria-pressed={v.myReason === r.value} disabled={busy} onClick={() => onRate("down", v.myReason === r.value ? null : r.value)} className={chip(v.myReason === r.value)}>
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const button = (rating: VideoRating, label: string, count: number, icon?: ReactNode) => (
    <button type="button" aria-pressed={v.myRating === rating} disabled={busy} onClick={() => onRate(v.myRating === rating ? null : rating)} className={chip(v.myRating === rating)}>
      {icon}
      {label}
      {count > 0 && <span className="text-fg-subtle tabular-nums">{count}</span>}
    </button>
  );
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
      <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative aspect-video bg-surface-2">
          {v.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
          )}
          <PlayCircle className="absolute inset-0 m-auto size-10 text-white/90 drop-shadow" />
          {v.durationSeconds ? <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 text-[11px] text-white">{fmtDuration(v.durationSeconds)}</span> : null}
        </div>
        <div className="px-3 pt-3">
          <div className="line-clamp-2 text-[13px] text-fg">{v.title}</div>
          <div className="mt-0.5 text-[12px] text-fg-subtle">{v.channel}</div>
        </div>
      </a>
      {v.why && <p className="px-3 pt-1 text-[12px] text-fg-muted">{v.why}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1 p-3 pt-2" role="group" aria-label={t("Rate this video")}>
        {button("up", t("Helpful"), v.counts.up, <ThumbsUp aria-hidden />)}
        {button("ok", t("Okay"), v.counts.ok)}
        {button("down", t("Not helpful"), v.counts.down, <ThumbsDown aria-hidden />)}
      </div>
    </div>
  );
}

/** "Checked", "Checked · 3 corrections" or "Not checked" by the title; they open the details below. */
function CheckBadges({ v, onOpen }: { v: LessonVerification; onOpen: () => void }) {
  const t = useT();
  const fixed = v.issues.filter((i) => !i.open).length;
  const open = v.issues.length - fixed;
  const link = "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-strong";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <a href="#lesson-check" onClick={onOpen} className={link}>
        {v.status === "not_checked" ? (
          <Badge tone="warning">
            <ShieldAlert className="size-3" /> {t("Not checked")}
          </Badge>
        ) : (
          <Badge tone="success">
            <ShieldCheck className="size-3" /> {fixed ? t.n(fixed, "Checked · {n} correction", "Checked · {n} corrections") : t("Checked")}
          </Badge>
        )}
      </a>
      {open > 0 && (
        <a href="#lesson-check" onClick={onOpen} className={link}>
          <Badge tone="danger">{t.n(open, "{n} value to verify", "{n} values to verify")}</Badge>
        </a>
      )}
    </div>
  );
}

const fmtNum = (v: number) => String(Number(v.toPrecision(6)));
const subhead = "mb-2 text-[12px] font-medium tracking-wide text-fg-subtle uppercase";

/** How this lesson was checked: model and date, corrections, arithmetic and the web sources. */
function CheckDetails({ v, open, onToggle }: { v: LessonVerification; open: boolean; onToggle: (open: boolean) => void }) {
  const t = useT();
  const sourceHref = (n: number) => webHref(v.sources.find((s) => s.n === n)?.url);
  return (
    <section id="lesson-check" className="scroll-mt-6 border-t border-border pt-6">
      <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
        <summary className="flex cursor-pointer items-center gap-2 text-[15px] font-medium text-fg">
          <span className="flex size-6 items-center justify-center rounded-md bg-surface-2 text-fg-muted [&>svg]:size-3.5">{v.status === "not_checked" ? <ShieldAlert /> : <ShieldCheck />}</span>
          {t("How this lesson was checked")}
        </summary>
        <div className="mt-4 space-y-5 text-[13px]">
          <div className="space-y-1 text-fg-muted">
            {v.status === "not_checked" ? (
              <p>
                {t("This lesson wasn't checked.")} {v.reason}
              </p>
            ) : (
              <p>{t("Checked by {model} on {date}.", { model: v.model ?? t("the Advanced model"), date: t.date(v.checkedAt, { day: "numeric", month: "long", year: "numeric" }) })}</p>
            )}
            {v.sources.length > 0 && v.provider ? (
              <p>{t.n(v.sources.length, "Written and checked with {n} web source found through {provider}.", "Written and checked with {n} web sources found through {provider}.", { provider: t(WEB_PROVIDER_NAMES[v.provider]) })}</p>
            ) : v.researchNote ? (
              <p className="text-warning">{v.researchNote}</p>
            ) : !v.provider ? (
              <p>{t("Web search isn't set up, so no web sources were used.")}</p>
            ) : null}
          </div>

          {v.issues.length > 0 ? (
            <div>
              <h3 className={subhead}>{t("Corrections")}</h3>
              <ul className="space-y-2">
                {v.issues.map((i, k) => (
                  <li key={k} className="rounded-lg border border-border bg-surface p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{t(PART_NAMES[i.part])}</Badge>
                      <Badge tone={i.severity === "high" ? "danger" : i.severity === "medium" ? "warning" : "neutral"}>{t(SEVERITY_NAMES[i.severity])}</Badge>
                      {i.open && <Badge tone="danger">{t("Not corrected")}</Badge>}
                      {i.sources.map((n) => {
                        const href = sourceHref(n);
                        return href ? (
                          <a key={n} href={href} target="_blank" rel="noopener noreferrer" title={domainOf(href)} className="text-[12px] text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                            [{n}]
                          </a>
                        ) : null;
                      })}
                    </div>
                    <p className="text-fg">{i.problem}</p>
                    <p className="mt-1 flex gap-1.5 text-fg-muted">
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{i.fix}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : v.status !== "not_checked" ? (
            <p className="text-fg-muted">{t("Nothing needed correcting.")}</p>
          ) : null}

          {v.calc.length > 0 && (
            <div>
              <h3 className={subhead}>{t("Arithmetic checks")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-fg-subtle">
                      <th className="py-1 pr-3 font-normal">{t("Calculation")}</th>
                      <th className="py-1 pr-3 font-normal">{t("Expression")}</th>
                      <th className="py-1 pr-3 font-normal">{t("Lesson says")}</th>
                      <th className="py-1 pr-3 font-normal">{t("Worked out")}</th>
                      <th className="py-1 font-normal">
                        <span className="sr-only">{t("Result")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.calc.map((x, k) => (
                      <tr key={k} className="border-t border-border">
                        <td className="py-1 pr-3 text-fg-muted">{x.label}</td>
                        <td className="py-1 pr-3 font-mono text-fg">{x.expression}</td>
                        <td className="py-1 pr-3 font-mono text-fg-muted">{fmtNum(x.claimed)}</td>
                        <td className="py-1 pr-3 font-mono text-fg-muted">{x.computed === null ? "—" : fmtNum(x.computed)}</td>
                        <td className="py-1">
                          {x.ok === true ? (
                            <>
                              <Check className="size-3.5 text-success" aria-hidden /> <span className="sr-only">{t("Matches")}</span>
                            </>
                          ) : x.ok === false ? (
                            <>
                              <X className="size-3.5 text-danger" aria-hidden /> <span className="sr-only">{t("Doesn't match")}</span>
                            </>
                          ) : (
                            <span className="text-fg-subtle">{t("Couldn't be worked out")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[12px] text-fg-subtle">{t("Worked out by the calculators' engine, not by a model.")}</p>
            </div>
          )}

          {v.sources.length > 0 && (
            <div>
              <h3 className={subhead}>{t("Sources")}</h3>
              <ol className="space-y-1">
                {v.sources.map((s) => {
                  const href = webHref(s.url);
                  return (
                    <li key={s.n} className="flex gap-2">
                      <span className="shrink-0 text-fg-subtle">[{s.n}]</span>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 text-fg underline-offset-2 hover:underline">
                          {s.title} <span className="text-fg-subtle">· {domainOf(href)}</span>
                        </a>
                      ) : (
                        <span className="min-w-0 text-fg">{s.title}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
