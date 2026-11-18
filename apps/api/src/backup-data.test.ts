/**
 * The data tests/e2e/run-backup.sh backs up, restores and checks beyond a project document (P0 #1): a course with a
 * lesson and a person's progress, a calculator history row, and a Knowledge source with its searchable chunks. This
 * checks the call sequence that script uses, against the real API (the restore itself needs Docker).
 */
import { sql } from "@aatmiq/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "../test/gem-harness";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("data the backup test covers", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);
  afterAll(async () => h?.close());

  it("a calculator history row, a course with progress and a Knowledge source are all readable through the API", async () => {
    const ws = h.workspaceId;
    const calc = await h.call(h.owner, "POST", "/api/calculators/history", { workspaceId: ws, calculatorId: "scientific", expression: "2+3*4", angle: "deg" });
    expect(calc.status).toBe(200);
    const hist = (await h.call(h.owner, "GET", `/api/calculators/history?workspaceId=${ws}`)).json;
    expect(hist).toHaveLength(1);
    expect(hist[0].outputs).toEqual({ value: 14 });

    // A course made without a model: the rows the script inserts with psql.
    const uid = h.ids.owner;
    await h.db.execute(sql`
      with c as (insert into course (workspace_id, user_id, topic, level, title, status, outline)
                 values (${ws}, ${uid}, 'Buck converters', 'basic', 'Buck converters', 'ready', '{"modules":[{"title":"Basics","lessons":["Duty cycle"]}]}'::jsonb) returning id)
      insert into course_lesson (course_id, ordinal, title, status, content)
        select id, 0, 'Duty cycle', 'ready', '{"title":"Duty cycle","sections":[]}'::jsonb from c`);
    const list = (await h.call(h.owner, "GET", `/api/learning/courses?workspaceId=${ws}`)).json;
    expect(list).toHaveLength(1);
    const cid = list[0].id;
    expect((await h.call(h.owner, "PUT", `/api/learning/courses/${cid}/lessons/0/state`, { completed: true })).status).toBe(200);
    const course = (await h.call(h.owner, "GET", `/api/learning/courses/${cid}`)).json;
    expect(course.lessons).toHaveLength(1);
    expect(course.lessons[0]).toMatchObject({ title: "Duty cycle", ordinal: 0 });
    expect(course.lessons[0].completedAt).toBeTruthy();

    // A Knowledge source: chunks are searchable by words.
    const proj = (await h.call(h.owner, "POST", "/api/projects", { workspaceId: ws, name: "Inverter" })).json.id;
    expect((await h.call(h.owner, "POST", `/api/projects/${proj}/sources/note`, { title: "Test report", content: "The heatsink reached 98 degrees at full load." })).status).toBe(200);
    await h.settle();
    const k = (await h.call(h.owner, "GET", `/api/knowledge/projects/${proj}`)).json;
    expect(JSON.stringify(k)).toMatch(/Test report/);
    const [row] = (await h.db.execute(sql`select count(*)::int as n from document_chunk where document_id in (select document_id from project_source where project_id = ${proj})`)) as unknown as { n: number }[];
    expect(row!.n).toBeGreaterThan(0);
  });
});
