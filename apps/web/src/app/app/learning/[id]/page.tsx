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
  Sigma,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TopBar, TopBarButton } from "@/components/app/frame";
import { useCanUseModule } from "@/components/app/session";
import { Equation, MathMarkdown } from "@/components/learning/math-markdown";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Meter } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import { LEVEL_NAMES, useCourse, useLesson, type LessonDetail, type LessonRow } from "@/lib/learning";
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
          </span>
        )}
      </div>

      {busy ? (
        <div className="mt-10">
          <EmptyState icon={<Loader2 className="size-5 animate-spin" />} title={t("Writing this lesson…")} description={t("It's saved when it's done, so you only wait once.")} />
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
        <LessonBody l={l} />
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

function LessonBody({ l }: { l: LessonDetail }) {
  const t = useT();
  const c = l.content!;
  return (
    <div className="mt-3 space-y-8">
      {/* 1. Title and objectives */}
      <header>
        <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em] text-fg">{c.title}</h1>
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

      {/* 8. Videos (YouTube Data API) and references */}
      <Part n={8} icon={<PlayCircle />} title={t("Videos and references")}>
        {l.videos && l.videos.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {l.videos.map((v) => (
              <a
                key={v.videoId}
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="group overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
              >
                <div className="relative aspect-video bg-surface-2">
                  {v.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                  <PlayCircle className="absolute inset-0 m-auto size-10 text-white/90 drop-shadow" />
                  {v.durationSeconds ? <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 text-[11px] text-white">{fmtDuration(v.durationSeconds)}</span> : null}
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-[13px] text-fg">{v.title}</div>
                  <div className="mt-0.5 text-[12px] text-fg-subtle">{v.channel}</div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-fg-subtle">
            {l.videosNote === "not_configured"
              ? t("Video suggestions are off: your admin can add a YouTube Data API key in Admin → Settings.")
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
    </div>
  );
}
