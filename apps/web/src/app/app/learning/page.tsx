"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CourseLevel } from "@aatmiq/shared";
import { Archive, ArchiveRestore, Bookmark, BookOpenCheck, CircleAlert, Loader2, MoreHorizontal, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/app/frame";
import { ModuleOff } from "@/components/app/module-off";
import { useCanUseModule, useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, EmptyState, Meter } from "@/components/ui/misc";
import { Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { msg, useT } from "@/i18n";
import { ApiError, del, get, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { LEVEL_NAMES, useCourses, type CourseSummary } from "@/lib/learning";

const LEVELS: CourseLevel[] = ["basic", "intermediate", "advanced"];
const TABS = [
  { v: "courses", l: msg("Courses") },
  { v: "bookmarks", l: msg("Bookmarks") },
  { v: "archived", l: msg("Archived") },
] as const;
const EXAMPLES = [
  msg("Three-phase inverters: fundamentals, PWM, SVPWM, gate drivers, hardware and a worked example"),
  msg("Buck converter design: inductor and capacitor selection, losses, loop compensation"),
  msg("Field-oriented control of PMSM motors"),
  msg("Embedded firmware for motor drives: ADC sampling, PWM timers and interrupts"),
];

export default function LearningPage() {
  const t = useT();
  const { workspaceId } = useSession();
  const allowed = useCanUseModule("learning");
  const [tab, setTab] = useState<(typeof TABS)[number]["v"]>("courses");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const courses = useCourses(allowed ? workspaceId : "", { q: q.trim() || undefined, tag: tag ?? undefined, archived: tab === "archived" });
  const tags = useQuery({ queryKey: ["course-tags", workspaceId], queryFn: () => get<{ tag: string; n: number }[]>(`/api/learning/tags?workspaceId=${workspaceId}`), enabled: allowed && !!workspaceId });

  if (!allowed) return <ModuleOff />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        icon={<BookOpenCheck />}
        title={t("Learning")}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> {t("New course")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
          <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em]">{t("Learning")}</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-fg-subtle">
            {t("Name a topic and a level: your model writes a structured course, lesson by lesson. Lessons are saved, so opening them later costs nothing; formulas say when they apply, and videos are real YouTube results.")}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist">
              {TABS.map((x) => (
                <button
                  key={x.v}
                  role="tab"
                  aria-selected={tab === x.v}
                  onClick={() => setTab(x.v)}
                  className={cn("h-7 rounded-md px-3 text-[13px] transition-colors", tab === x.v ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
                >
                  {t(x.l)}
                </button>
              ))}
            </div>
            {tab !== "bookmarks" && (
              <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 focus-within:border-border-strong">
                <Search className="size-3.5 text-fg-subtle" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search courses and tags")} aria-label={t("Search courses and tags")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle" />
              </label>
            )}
          </div>
          {tab !== "bookmarks" && (tags.data?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.data!.map((x) => (
                <button
                  key={x.tag}
                  onClick={() => setTag(tag === x.tag ? null : x.tag)}
                  className={cn("h-6 rounded-full border px-2.5 text-[12px] transition-colors", tag === x.tag ? "border-fg bg-fg text-bg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")}
                >
                  #{x.tag} <span className="opacity-60">{x.n}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            {tab === "bookmarks" ? (
              <Bookmarks />
            ) : courses.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : (courses.data ?? []).length === 0 ? (
              <EmptyState
                icon={<BookOpenCheck className="size-5" />}
                title={q || tag ? t("No courses match") : tab === "archived" ? t("Nothing archived") : t("Start your first course")}
                description={q || tag || tab === "archived" ? undefined : t("Try one of the examples, or describe what you want to learn.")}
                action={tab === "courses" && !q && !tag ? <Button variant="primary" onClick={() => setCreating(true)}><Sparkles className="size-3.5" /> {t("New course")}</Button> : undefined}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {courses.data!.map((c) => (
                  <CourseCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <NewCourseDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CourseCard({ c }: { c: CourseSummary }) {
  const t = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["courses"] });
  const update = useMutation({ mutationFn: (body: { archived?: boolean }) => patch(`/api/learning/courses/${c.id}`, body), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({
    mutationFn: () => del(`/api/learning/courses/${c.id}`),
    onSuccess: () => {
      refresh();
      toast(t("Course deleted"));
    },
  });
  const retry = useMutation({ mutationFn: () => post(`/api/learning/courses/${c.id}/retry`), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const progress = c.lessons ? c.completed / c.lessons : 0;
  const resume = c.lastLesson ?? 0;
  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start gap-2">
        <Link href={`/app/learning/${c.id}`} className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14.5px] font-medium text-fg">{c.title}</h3>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-fg-subtle">{c.topic}</p>
        </Link>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label={t("Course options")} className="rounded p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <MoreHorizontal className="size-4" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            {c.archivedAt ? (
              <MenuItem icon={<ArchiveRestore />} onSelect={() => update.mutate({ archived: false })}>{t("Restore")}</MenuItem>
            ) : (
              <MenuItem icon={<Archive />} onSelect={() => update.mutate({ archived: true })}>{t("Archive")}</MenuItem>
            )}
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>{t("Delete")}</MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge>{t(LEVEL_NAMES[c.level])}</Badge>
        {c.tags.slice(0, 4).map((x) => (
          <Badge key={x}>#{x}</Badge>
        ))}
        {c.bookmarks > 0 && (
          <Badge>
            <Bookmark className="size-3" /> {c.bookmarks}
          </Badge>
        )}
      </div>
      <div className="mt-auto pt-4">
        {c.status === "generating" ? (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <Loader2 className="size-3.5 animate-spin" /> {t("Writing the outline…")}
          </div>
        ) : c.status === "failed" ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-danger">
              <CircleAlert className="size-3.5 shrink-0" /> <span className="truncate">{c.error ?? t("The outline couldn't be written.")}</span>
            </span>
            <Button size="sm" onClick={() => retry.mutate()} loading={retry.isPending}>
              <RotateCcw className="size-3.5" /> {t("Try again")}
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-[12px] text-fg-subtle">
              <span>{t("{completed} of {lessons} lessons done", { completed: c.completed, lessons: c.lessons })}</span>
              <span>{c.lastOpenedAt ? timeAgo(c.lastOpenedAt, t) : timeAgo(c.createdAt, t)}</span>
            </div>
            <Meter value={progress} />
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant={c.completed ? "outline" : "primary"} onClick={() => router.push(`/app/learning/${c.id}?lesson=${resume}`)}>
                {c.completed || c.lastLesson !== null ? t("Resume lesson {n}", { n: resume + 1 }) : t("Start")}
              </Button>
            </div>
          </>
        )}
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("Delete this course?")}
        description={t("Its lessons, versions, progress and bookmarks are deleted. This can't be undone.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>{t("Cancel")}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>{t("Delete")}</Button>
          </>
        }
      />
    </div>
  );
}

function Bookmarks() {
  const t = useT();
  const { workspaceId } = useSession();
  const q = useQuery({
    queryKey: ["bookmarks", workspaceId],
    queryFn: () => get<{ courseId: string; courseTitle: string; ordinal: number; title: string; bookmarkedAt: string }[]>(`/api/learning/bookmarks?workspaceId=${workspaceId}`),
  });
  if (q.isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!q.data?.length) return <EmptyState icon={<Bookmark className="size-5" />} title={t("No bookmarks yet")} description={t("Bookmark a lesson to find it here.")} />;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {q.data.map((b) => (
        <Link key={`${b.courseId}-${b.ordinal}`} href={`/app/learning/${b.courseId}?lesson=${b.ordinal}`} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-2/40">
          <Bookmark className="size-4 shrink-0 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] text-fg">{b.title}</div>
            <div className="truncate text-[12px] text-fg-subtle">{b.courseTitle}</div>
          </div>
          <span className="text-[12px] text-fg-subtle">{timeAgo(b.bookmarkedAt, t)}</span>
        </Link>
      ))}
    </div>
  );
}

function NewCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<CourseLevel>("intermediate");
  const [tags, setTags] = useState("");
  const create = useMutation({
    mutationFn: () =>
      post<{ id: string }>("/api/learning/courses", {
        workspaceId,
        topic: topic.trim(),
        level,
        tags: tags
          .split(",")
          .map((x) => x.trim().replace(/^#/, ""))
          .filter(Boolean),
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      onOpenChange(false);
      setTopic("");
      setTags("");
      router.push(`/app/learning/${c.id}`);
    },
    onError: (e: Error) => toast.error(e instanceof ApiError && e.code === "quota_exceeded" ? t("You've used your token allowance for this period.") : e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("New course")}
      description={t("Your model writes the outline first, then each lesson. It uses your token allowance.")}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={topic.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
            <Sparkles className="size-3.5" /> {t("Write the course")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-medium text-fg-muted">{t("Topic")}</span>
          <textarea
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder={t("What do you want to learn?")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setTopic(t(x))} className="rounded-full border border-border px-2.5 py-1 text-left text-[12px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg">
              {t(x)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <span className="block text-[12.5px] font-medium text-fg-muted">{t("Level")}</span>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface p-0.5" role="radiogroup" aria-label={t("Level")}>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={level === l}
                onClick={() => setLevel(l)}
                className={cn("h-8 rounded-md text-[13px] transition-colors", level === l ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
              >
                {t(LEVEL_NAMES[l])}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="block text-[12.5px] font-medium text-fg-muted">{t("Tags (optional, comma-separated)")}</span>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("power, inverters")} />
        </label>
      </div>
    </Dialog>
  );
}
