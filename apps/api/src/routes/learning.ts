/**
 * GEM AI Learning (docs/15-gem-ai.md). Courses are their owner's alone: every route loads the
 * course for the signed-in person and answers "not found" for anyone else's.
 */
import { and, asc, course, courseLesson, courseLessonState, desc, eq, isNotNull, isNull, sql, type DB } from "@aatmiq/db";
import { courseCreateSchema, courseUpdateSchema, lessonStateSchema } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit, parse, requireUser, type AppContext, type SessionUser } from "../context";
import { badRequest, notFound } from "../errors";
import { localeOf, tr } from "../i18n";
import { requireModule } from "../services/gem";
import { checkLearningLimits, flatLessons } from "../services/learning";

const VIDEO_RECHECK_MS = 7 * 86_400_000;

async function ownCourse(ctx: AppContext, u: SessionUser, id: string) {
  const [c] = await ctx.db.select().from(course).where(eq(course.id, id));
  if (!c || c.userId !== u.id) throw notFound("Course not found");
  await requireModule(ctx, u, c.workspaceId, "learning");
  return c;
}

const ordinalParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw badRequest("That lesson doesn't exist.");
  return n;
};

/** Each lesson's current version (title, status) with the person's progress on it. */
async function lessonList(db: DB, courseId: string, userId: string) {
  return db
    .select({
      id: courseLesson.id,
      ordinal: courseLesson.ordinal,
      title: courseLesson.title,
      status: courseLesson.status,
      version: courseLesson.version,
      completedAt: courseLessonState.completedAt,
      bookmarkedAt: courseLessonState.bookmarkedAt,
    })
    .from(courseLesson)
    .leftJoin(courseLessonState, and(eq(courseLessonState.courseId, courseLesson.courseId), eq(courseLessonState.ordinal, courseLesson.ordinal), eq(courseLessonState.userId, userId)))
    .where(and(eq(courseLesson.courseId, courseId), eq(courseLesson.current, true)))
    .orderBy(asc(courseLesson.ordinal));
}

export async function learningRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** The person's library: search (title, topic, tags), a tag, bookmarked only, archived. */
  app.get<{ Querystring: { workspaceId: string; q?: string; tag?: string; archived?: string } }>("/api/learning/courses", async (req) => {
    const u = await requireUser(ctx, req);
    await requireModule(ctx, u, req.query.workspaceId, "learning");
    const q = req.query.q?.trim().slice(0, 200);
    const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
    // Raw "course"."id": inside these subqueries Drizzle would print a bare "id" (the lesson's own).
    const cid = sql.raw(`"course"."id"`);
    const rows = await db
      .select({
        id: course.id,
        title: course.title,
        topic: course.topic,
        level: course.level,
        tags: course.tags,
        status: course.status,
        error: course.error,
        lastLesson: course.lastLesson,
        lastOpenedAt: course.lastOpenedAt,
        archivedAt: course.archivedAt,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        lessons: sql<number>`(select count(*)::int from course_lesson l where l.course_id = ${cid} and l.current)`,
        ready: sql<number>`(select count(*)::int from course_lesson l where l.course_id = ${cid} and l.current and l.status = 'ready')`,
        completed: sql<number>`(select count(*)::int from course_lesson_state s where s.course_id = ${cid} and s.user_id = ${u.id} and s.completed_at is not null)`,
        bookmarks: sql<number>`(select count(*)::int from course_lesson_state s where s.course_id = ${cid} and s.user_id = ${u.id} and s.bookmarked_at is not null)`,
      })
      .from(course)
      .where(
        and(
          eq(course.workspaceId, req.query.workspaceId),
          eq(course.userId, u.id),
          req.query.archived === "1" ? isNotNull(course.archivedAt) : isNull(course.archivedAt),
          like ? sql`(${course.title} ilike ${like} or ${course.topic} ilike ${like} or exists (select 1 from unnest(${course.tags}) t where t ilike ${like}))` : undefined,
          req.query.tag ? sql`${req.query.tag} = any(${course.tags})` : undefined,
        ),
      )
      .orderBy(desc(sql`coalesce(${course.lastOpenedAt}, ${course.createdAt})`))
      .limit(300);
    const locale = localeOf(req);
    return rows.map((r) => ({ ...r, error: r.error && tr(locale, r.error) }));
  });

  /** Tags in use in the person's library. */
  app.get<{ Querystring: { workspaceId: string } }>("/api/learning/tags", async (req) => {
    const u = await requireUser(ctx, req);
    await requireModule(ctx, u, req.query.workspaceId, "learning");
    const rows = (await db.execute(sql`
      select t as tag, count(*)::int as n from course, unnest(course.tags) t
      where course.workspace_id = ${req.query.workspaceId} and course.user_id = ${u.id} and course.archived_at is null
      group by t order by n desc, t limit 100`)) as unknown as { tag: string; n: number }[];
    return rows;
  });

  /** Bookmarked lessons across the person's courses. */
  app.get<{ Querystring: { workspaceId: string } }>("/api/learning/bookmarks", async (req) => {
    const u = await requireUser(ctx, req);
    await requireModule(ctx, u, req.query.workspaceId, "learning");
    return db
      .select({ courseId: course.id, courseTitle: course.title, ordinal: courseLesson.ordinal, title: courseLesson.title, bookmarkedAt: courseLessonState.bookmarkedAt })
      .from(courseLessonState)
      .innerJoin(course, eq(course.id, courseLessonState.courseId))
      .innerJoin(courseLesson, and(eq(courseLesson.courseId, course.id), eq(courseLesson.ordinal, courseLessonState.ordinal), eq(courseLesson.current, true)))
      .where(and(eq(courseLessonState.userId, u.id), eq(course.userId, u.id), eq(course.workspaceId, req.query.workspaceId), isNotNull(courseLessonState.bookmarkedAt)))
      .orderBy(desc(courseLessonState.bookmarkedAt))
      .limit(200);
  });

  app.post("/api/learning/courses", async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(courseCreateSchema, req.body);
    await requireModule(ctx, u, body.workspaceId, "learning");
    await checkLearningLimits(ctx, u.id, "course");
    const [c] = await db
      .insert(course)
      .values({ workspaceId: body.workspaceId, userId: u.id, topic: body.topic, level: body.level, title: body.topic, tags: [...new Set(body.tags ?? [])] })
      .returning();
    await audit(ctx, { actor: u, action: "course.created", workspaceId: body.workspaceId, targetType: "course", targetId: c!.id, meta: { level: body.level } });
    void ctx.learning.outline(c!.id);
    return c;
  });

  app.get<{ Params: { id: string } }>("/api/learning/courses/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const lessons = await lessonList(db, c.id, u.id);
    const locale = localeOf(req);
    // The outline's modules, each with the lessons it holds.
    const modules = c.outline
      ? (() => {
          const flat = flatLessons(c.outline);
          return c.outline.modules.map((m, mi) => ({
            title: m.title,
            summary: m.summary,
            lessons: flat.map((l, i) => ({ ...l, ordinal: i })).filter((l) => l.module === mi).map((l) => ({ ...lessons.find((x) => x.ordinal === l.ordinal), summary: l.summary, ordinal: l.ordinal })),
          }));
        })()
      : [];
    return { ...c, error: c.error && tr(locale, c.error), modules, lessons: lessons.map((l) => ({ ...l })) };
  });

  app.patch<{ Params: { id: string } }>("/api/learning/courses/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const body = parse(courseUpdateSchema, req.body);
    const set: Partial<typeof course.$inferInsert> = {};
    if (body.title !== undefined) set.title = body.title;
    if (body.tags !== undefined) set.tags = [...new Set(body.tags)];
    if (body.archived !== undefined) set.archivedAt = body.archived ? new Date() : null;
    if (body.lastLesson !== undefined) set.lastLesson = body.lastLesson;
    const [updated] = await db.update(course).set(set).where(eq(course.id, c.id)).returning();
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/learning/courses/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    await db.delete(course).where(eq(course.id, c.id));
    await audit(ctx, { actor: u, action: "course.deleted", workspaceId: c.workspaceId, targetType: "course", targetId: c.id });
    return { ok: true };
  });

  /** A failed outline: try again. */
  app.post<{ Params: { id: string } }>("/api/learning/courses/:id/retry", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    if (c.status !== "failed") throw badRequest("Only a course whose outline failed can be retried.");
    await checkLearningLimits(ctx, u.id, "lesson");
    await db.update(course).set({ status: "generating", error: null }).where(eq(course.id, c.id));
    void ctx.learning.outline(c.id);
    return { ok: true };
  });

  /** A saved lesson (the current version, or ?version=n). Never regenerates it. */
  app.get<{ Params: { id: string; ordinal: string }; Querystring: { version?: string } }>("/api/learning/courses/:id/lessons/:ordinal", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const ordinal = ordinalParam(req.params.ordinal);
    const version = req.query.version ? Number(req.query.version) : null;
    const [l] = await db
      .select()
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal), version ? eq(courseLesson.version, version) : eq(courseLesson.current, true)));
    if (!l) throw notFound("Lesson not found");
    const versions = await db
      .select({ version: courseLesson.version, status: courseLesson.status, current: courseLesson.current, createdAt: courseLesson.createdAt })
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal)))
      .orderBy(asc(courseLesson.version));
    const [state] = await db.select().from(courseLessonState).where(and(eq(courseLessonState.courseId, c.id), eq(courseLessonState.ordinal, ordinal), eq(courseLessonState.userId, u.id)));
    await db.update(course).set({ lastLesson: ordinal, lastOpenedAt: new Date() }).where(eq(course.id, c.id));
    if (l.status === "ready" && l.videos?.length && (!l.videosCheckedAt || Date.now() - l.videosCheckedAt.getTime() > VIDEO_RECHECK_MS)) void ctx.learning.refreshVideos(l.id);
    const total = (await lessonList(db, c.id, u.id)).length;
    const locale = localeOf(req);
    return { ...l, error: l.error && tr(locale, l.error), versions, state: state ?? null, total, courseTitle: c.title };
  });

  /** Write a lesson that's waiting (or failed). */
  app.post<{ Params: { id: string; ordinal: string } }>("/api/learning/courses/:id/lessons/:ordinal/generate", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const ordinal = ordinalParam(req.params.ordinal);
    const [l] = await db.select().from(courseLesson).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal), eq(courseLesson.current, true)));
    if (!l) throw notFound("Lesson not found");
    if (l.status === "ready" || l.status === "generating") return { ok: true, status: l.status };
    await checkLearningLimits(ctx, u.id, "lesson");
    await db.update(courseLesson).set({ status: "generating", error: null }).where(eq(courseLesson.id, l.id));
    void ctx.learning.lesson(c.id, ordinal);
    return { ok: true, status: "generating" };
  });

  /** A new version of a lesson; the old one is kept and stays current until the new one is ready. */
  app.post<{ Params: { id: string; ordinal: string } }>("/api/learning/courses/:id/lessons/:ordinal/regenerate", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const ordinal = ordinalParam(req.params.ordinal);
    const [l] = await db.select().from(courseLesson).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal), eq(courseLesson.current, true)));
    if (!l) throw notFound("Lesson not found");
    const [busy] = await db.select({ id: courseLesson.id }).from(courseLesson).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal), eq(courseLesson.status, "generating")));
    if (busy) return { ok: true, status: "generating" };
    await checkLearningLimits(ctx, u.id, "lesson");
    void ctx.learning.lesson(c.id, ordinal, true);
    await audit(ctx, { actor: u, action: "lesson.regenerated", workspaceId: c.workspaceId, targetType: "course", targetId: c.id, meta: { ordinal } });
    return { ok: true, status: "generating" };
  });

  /** Make an earlier version the one shown. */
  app.post<{ Params: { id: string; ordinal: string } }>("/api/learning/courses/:id/lessons/:ordinal/restore", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const ordinal = ordinalParam(req.params.ordinal);
    const { version } = parse(z.object({ version: z.number().int().min(1) }), req.body);
    const [l] = await db.select().from(courseLesson).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal), eq(courseLesson.version, version)));
    if (!l || l.status !== "ready") throw badRequest("That version isn't available.");
    await db.transaction(async (tx) => {
      await tx.update(courseLesson).set({ current: false }).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal)));
      await tx.update(courseLesson).set({ current: true }).where(eq(courseLesson.id, l.id));
    });
    return { ok: true };
  });

  /** Write every lesson still waiting, one after another. */
  app.post<{ Params: { id: string } }>("/api/learning/courses/:id/generate-all", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const waiting = await db
      .select({ ordinal: courseLesson.ordinal })
      .from(courseLesson)
      .where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.current, true), sql`${courseLesson.status} in ('pending', 'failed')`))
      .orderBy(asc(courseLesson.ordinal));
    await checkLearningLimits(ctx, u.id, "lesson");
    for (const w of waiting) void ctx.learning.lesson(c.id, w.ordinal);
    return { ok: true, queued: waiting.length };
  });

  /** Mark complete, bookmark, or keep a note on a lesson. */
  app.put<{ Params: { id: string; ordinal: string } }>("/api/learning/courses/:id/lessons/:ordinal/state", async (req) => {
    const u = await requireUser(ctx, req);
    const c = await ownCourse(ctx, u, req.params.id);
    const ordinal = ordinalParam(req.params.ordinal);
    const body = parse(lessonStateSchema, req.body);
    const [l] = await db.select({ id: courseLesson.id }).from(courseLesson).where(and(eq(courseLesson.courseId, c.id), eq(courseLesson.ordinal, ordinal)));
    if (!l) throw notFound("Lesson not found");
    const set: Partial<typeof courseLessonState.$inferInsert> = {};
    if (body.completed !== undefined) set.completedAt = body.completed ? new Date() : null;
    if (body.bookmarked !== undefined) set.bookmarkedAt = body.bookmarked ? new Date() : null;
    if (body.note !== undefined) set.note = body.note;
    const [row] = await db
      .insert(courseLessonState)
      .values({ courseId: c.id, ordinal, userId: u.id, ...set })
      .onConflictDoUpdate({ target: [courseLessonState.courseId, courseLessonState.ordinal, courseLessonState.userId], set: { ...set, updatedAt: new Date() } })
      .returning();
    return row;
  });
}
