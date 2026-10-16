/**
 * GEM AI Learning against a real Postgres (TEST_DATABASE_URL), with the demo model writing the
 * course and a fake YouTube Data API: generation and validation, saved lessons that aren't
 * regenerated on open, versions, progress, owner-only access, malformed output, videos.
 */
import { course, courseLesson, eq, usageEvent, youtubeCache } from "@aatmiq/db";
import { lessonSchema, parseModelJson } from "@aatmiq/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

/** A fake YouTube Data API v3: two search results, one of them private, and a quota switch. */
function fakeYouTube() {
  const calls: string[] = [];
  let quota = false;
  const videos: Record<string, { privacy: string }> = { AAAAAAAAAA1: { privacy: "public" }, BBBBBBBBBB2: { privacy: "private" }, CCCCCCCCCC3: { privacy: "public" } };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.host !== "yt.test") return fetch(input, init);
    calls.push(u.pathname);
    if (quota) return new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    if (u.pathname.endsWith("/search")) {
      return Response.json({ items: [{ id: { videoId: "AAAAAAAAAA1" } }, { id: { videoId: "BBBBBBBBBB2" } }, { id: { videoId: "not-a-real-id!" } }] });
    }
    const ids = (u.searchParams.get("id") ?? "").split(",");
    return Response.json({
      items: ids
        .filter((id) => videos[id])
        .map((id) => ({
          id,
          snippet: { title: `Video ${id}`, channelTitle: "Power Electronics Channel", publishedAt: "2024-01-01T00:00:00Z", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
          contentDetails: { duration: "PT12M30S" },
          status: { privacyStatus: videos[id]!.privacy, embeddable: true, uploadStatus: "processed" },
        })),
    });
  }) as typeof fetch;
  return { fetchFn, calls, setQuota: (q: boolean) => (quota = q), remove: (id: string) => delete videos[id] };
}

d("GEM AI Learning", () => {
  let h: Harness;
  const yt = fakeYouTube();
  let courseId = "";

  beforeAll(async () => {
    h = await startHarness({ youtubeApiKey: "test-key", youtubeApiUrl: "http://yt.test/youtube/v3" }, { fetch: yt.fetchFn });
  });
  afterAll(async () => {
    await h?.close();
  });

  it("refuses an empty or missing topic and a bad level", async () => {
    expect((await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "", level: "basic" })).status).toBe(400);
    expect((await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "  ", level: "basic" })).status).toBe(400);
    expect((await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, level: "basic" })).status).toBe(400);
    expect((await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Inverters", level: "expert" })).status).toBe(400);
  });

  it("turns a topic into a saved course: outline, lessons, the first one written", async () => {
    const r = await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Three-phase inverters", level: "intermediate", tags: ["power", "inverters"] });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("generating");
    courseId = r.json.id;
    await h.app.learning.idle();
    const c = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}`);
    expect(c.json.status).toBe("ready");
    expect(c.json.title).toBe("Three-phase inverters (intermediate)");
    expect(c.json.modules).toHaveLength(3);
    expect(c.json.lessons).toHaveLength(6);
    expect(c.json.lessons[0].status).toBe("ready");
    expect(c.json.lessons.slice(1).every((l: { status: string }) => l.status === "pending")).toBe(true);
    // Metered under "learning", against the person's budget.
    const usage = await h.db.select().from(usageEvent).where(eq(usageEvent.section, "learning"));
    expect(usage.length).toBe(2);
    expect(usage.every((u) => u.userId === h.ids.alice)).toBe(true);
  });

  it("every lesson has the same shape, with each formula's validity", async () => {
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(l.status).toBe(200);
    const c = l.json.content;
    for (const k of ["title", "objectives", "prerequisites", "theory", "explanation", "equations", "workedExample", "diagrams", "commonMistakes", "references", "takeaways"]) expect(c).toHaveProperty(k);
    expect(c.equations[0].validity.length).toBeGreaterThan(8);
    expect(c.workedExample.answer).toBe("I = 3 A");
    expect(l.json.total).toBe(6);
  });

  it("videos are real API IDs: private and malformed ones are dropped", async () => {
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(l.json.videos.map((v: { videoId: string }) => v.videoId)).toEqual(["AAAAAAAAAA1"]);
    expect(l.json.videos[0].durationSeconds).toBe(750);
    expect(l.json.videosNote).toBeNull();
    // No model-written link anywhere in the stored lesson.
    expect(JSON.stringify(l.json.content)).not.toMatch(/https?:\/\//);
  });

  it("opening a course again reads the saved lesson; it doesn't regenerate", async () => {
    const before = (await h.db.select().from(usageEvent)).length;
    const a = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    const b = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    await h.app.learning.idle();
    expect(a.json.id).toBe(b.json.id);
    expect((await h.db.select().from(usageEvent)).length).toBe(before);
    // Pending lessons are written only when asked.
    const p = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/1`);
    expect(p.json.status).toBe("pending");
    expect(p.json.content).toBeNull();
  });

  it("repeated video searches come from the cache", async () => {
    const searches = yt.calls.filter((c) => c.endsWith("/search")).length;
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/1/generate`)).json.status).toBe("generating");
    await h.app.learning.idle();
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/1`);
    expect(l.json.status).toBe("ready");
    // The demo model asks for a different phrase per lesson, so one new search at most.
    expect(yt.calls.filter((c) => c.endsWith("/search")).length).toBeLessThanOrEqual(searches + 1);
    expect((await h.db.select().from(youtubeCache)).length).toBeGreaterThan(0);
  });

  it("a quota error leaves the lesson without videos and says why", async () => {
    yt.setQuota(true);
    await h.db.delete(youtubeCache);
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/2/generate`)).status).toBe(200);
    await h.app.learning.idle();
    const l = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/2`);
    expect(l.json.status).toBe("ready");
    expect(l.json.videos).toEqual([]);
    expect(l.json.videosNote).toBe("quota");
    yt.setQuota(false);
  });

  it("a removed video drops out when saved videos are checked again", async () => {
    const [row] = await h.db.select().from(courseLesson).where(eq(courseLesson.courseId, courseId));
    const [l0] = (await h.db.select().from(courseLesson).where(eq(courseLesson.courseId, courseId))).filter((x) => x.ordinal === 0);
    expect(row).toBeDefined();
    yt.remove("AAAAAAAAAA1");
    await h.db.update(courseLesson).set({ videosCheckedAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(courseLesson.id, l0!.id));
    await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    await h.app.learning.idle();
    const again = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(again.json.videos).toEqual([]);
  });

  it("regenerating keeps the previous version; progress survives", async () => {
    expect((await h.call(h.alice, "PUT", `/api/learning/courses/${courseId}/lessons/0/state`, { completed: true, bookmarked: true, note: "Re-read SVPWM" })).status).toBe(200);
    const v1 = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/0/regenerate`)).json.status).toBe("generating");
    await h.app.learning.idle();
    const v2 = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`);
    expect(v2.json.version).toBe(2);
    expect(v2.json.id).not.toBe(v1.json.id);
    expect(v2.json.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
    expect(v2.json.state.completedAt).not.toBeNull();
    expect(v2.json.state.note).toBe("Re-read SVPWM");
    // The old version is still readable, and can be made current again.
    const old = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0?version=1`);
    expect(old.json.id).toBe(v1.json.id);
    expect((await h.call(h.alice, "POST", `/api/learning/courses/${courseId}/lessons/0/restore`, { version: 1 })).status).toBe(200);
    expect((await h.call(h.alice, "GET", `/api/learning/courses/${courseId}/lessons/0`)).json.version).toBe(1);
  });

  it("the library: search, tags, bookmarks, resume, archive", async () => {
    const lib = await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}&q=inverter`);
    expect(lib.json).toHaveLength(1);
    expect(lib.json[0], JSON.stringify(lib.json[0])).toMatchObject({ completed: 1, bookmarks: 1, lessons: 6, lastLesson: 0 });
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}&q=motor`)).json).toHaveLength(0);
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}&tag=power`)).json).toHaveLength(1);
    expect((await h.call(h.alice, "GET", `/api/learning/tags?workspaceId=${h.workspaceId}`)).json.map((t: { tag: string }) => t.tag).sort()).toEqual(["inverters", "power"]);
    const bm = await h.call(h.alice, "GET", `/api/learning/bookmarks?workspaceId=${h.workspaceId}`);
    expect(bm.json).toHaveLength(1);
    expect(bm.json[0].ordinal).toBe(0);
    expect((await h.call(h.alice, "PATCH", `/api/learning/courses/${courseId}`, { tags: ["power", "svpwm"], archived: true })).status).toBe(200);
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}`)).json).toHaveLength(0);
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}&archived=1`)).json).toHaveLength(1);
    await h.call(h.alice, "PATCH", `/api/learning/courses/${courseId}`, { archived: false });
  });

  it("courses survive signing out and in again", async () => {
    await h.call(h.alice, "POST", "/api/auth/sign-out", {});
    expect((await h.call(h.alice, "GET", `/api/learning/courses/${courseId}`)).status).toBe(401);
    await h.signIn(h.alice, "alice@gem.test", "member-password-123");
    const c = await h.call(h.alice, "GET", `/api/learning/courses/${courseId}`);
    expect(c.status).toBe(200);
    expect(c.json.lastLesson).toBe(0);
    expect(c.json.lessons[0].completedAt).not.toBeNull();
  });

  it("nobody else can open, change or even see someone's course (not even an admin)", async () => {
    for (const who of [h.bob, h.owner]) {
      expect((await h.call(who, "GET", `/api/learning/courses/${courseId}`)).status).toBe(404);
      expect((await h.call(who, "GET", `/api/learning/courses/${courseId}/lessons/0`)).status).toBe(404);
      expect((await h.call(who, "PUT", `/api/learning/courses/${courseId}/lessons/0/state`, { completed: true })).status).toBe(404);
      expect((await h.call(who, "POST", `/api/learning/courses/${courseId}/lessons/0/regenerate`)).status).toBe(404);
      expect((await h.call(who, "PATCH", `/api/learning/courses/${courseId}`, { title: "Mine now" })).status).toBe(404);
      expect((await h.call(who, "DELETE", `/api/learning/courses/${courseId}`)).status).toBe(404);
      expect((await h.call(who, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}`)).json).toHaveLength(0);
      expect((await h.call(who, "GET", `/api/learning/bookmarks?workspaceId=${h.workspaceId}`)).json).toHaveLength(0);
    }
    expect((await h.call(null, "GET", `/api/learning/courses/${courseId}`)).status).toBe(401);
  });

  it("malformed model output is refused, stored nowhere, and said plainly", async () => {
    const r = await h.call(h.bob, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Gate drivers mock:malformed", level: "basic" });
    await h.app.learning.idle();
    const c = await h.call(h.bob, "GET", `/api/learning/courses/${r.json.id}`);
    expect(c.json.status).toBe("failed");
    expect(c.json.outline).toBeNull();
    expect(c.json.error).toMatch(/didn't match the required format/);
    expect(c.json.lessons).toHaveLength(0);
    // Two attempts were made and metered as errors.
    const usage = (await h.db.select().from(usageEvent).where(eq(usageEvent.userId, h.ids.bob))).filter((u) => u.section === "learning");
    expect(usage.map((u) => u.status)).toEqual(["error", "error"]);
  });

  it("the lesson schema refuses missing parts, a formula without validity, and strips links", () => {
    const good = JSON.parse(JSON.stringify({
      title: "T", objectives: ["o"], prerequisites: [], theory: "Theory long enough to pass.", explanation: "An explanation that is long enough to pass the check.",
      equations: [{ name: "Buck", expression: "Vout = D·Vin", symbols: [], validity: "Ideal buck in CCM" }],
      workedExample: { problem: "Find Vout at D = 0.4.", given: [], steps: ["Vout = 0.4·48"], answer: "19.2 V" },
      diagrams: [], commonMistakes: ["m"], videoQueries: ["buck converter"], references: [{ title: "Erickson https://example.com/fake", kind: "book" }], takeaways: ["t"],
    }));
    const ok = parseModelJson(lessonSchema, "Here you go:\n```json\n" + JSON.stringify(good) + "\n```");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.references[0]!.title).toBe("Erickson");
    expect(parseModelJson(lessonSchema, JSON.stringify({ ...good, equations: [{ ...good.equations[0], validity: "" }] })).ok).toBe(false);
    expect(parseModelJson(lessonSchema, JSON.stringify({ ...good, takeaways: [] })).ok).toBe(false);
    const missing: Record<string, unknown> = { ...good };
    delete missing.workedExample;
    const r = parseModelJson(lessonSchema, JSON.stringify(missing));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/workedExample/);
    expect(parseModelJson(lessonSchema, "no json here").ok).toBe(false);
    expect(parseModelJson(lessonSchema, "{ broken json").ok).toBe(false);
  });

  it("respects the module switch and per-person sections", async () => {
    const off = await h.call(h.owner, "PUT", "/api/admin/gem", { modules: { learning: false } });
    expect(off.status).toBe(200);
    const r = await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}`);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("module_off");
    await h.call(h.owner, "PUT", "/api/admin/gem", { modules: { learning: true } });
    const members = await h.call(h.owner, "GET", `/api/admin/workspaces/${h.workspaceId}/members`);
    const alice = members.json.find((m: { userId: string }) => m.userId === h.ids.alice);
    expect(alice.sections).toContain("learning");
    await h.call(h.owner, "PATCH", `/api/admin/workspaces/${h.workspaceId}/members/${h.ids.alice}`, { sections: alice.sections.filter((s: string) => s !== "learning") });
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}`)).status).toBe(403);
    await h.call(h.owner, "PATCH", `/api/admin/workspaces/${h.workspaceId}/members/${h.ids.alice}`, { sections: alice.sections });
    expect((await h.call(h.alice, "GET", `/api/learning/courses?workspaceId=${h.workspaceId}`)).status).toBe(200);
  });

  it("caps how many courses one person generates a day", async () => {
    await h.call(h.owner, "PUT", "/api/admin/gem", { coursesPerDay: 2 });
    const second = await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Motor control", level: "basic" });
    expect(second.status).toBe(200);
    const third = await h.call(h.alice, "POST", "/api/learning/courses", { workspaceId: h.workspaceId, topic: "Battery packs", level: "basic" });
    expect(third.status).toBe(429);
    await h.app.learning.idle();
    await h.call(h.owner, "PUT", "/api/admin/gem", { coursesPerDay: 10 });
  });

  it("a restart picks up an outline that was being written", async () => {
    const [c] = await h.db.insert(course).values({ workspaceId: h.workspaceId, userId: h.ids.bob, topic: "Recovered topic", level: "advanced", title: "Recovered topic" }).returning();
    await h.app.learning.recover();
    await h.app.learning.idle();
    const [after] = await h.db.select().from(course).where(eq(course.id, c!.id));
    expect(after!.status).toBe("ready");
  });

  it("deleting a course removes its lessons and progress", async () => {
    expect((await h.call(h.alice, "DELETE", `/api/learning/courses/${courseId}`)).status).toBe(200);
    expect((await h.db.select().from(courseLesson).where(eq(courseLesson.courseId, courseId))).length).toBe(0);
  });
});
