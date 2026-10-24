/**
 * GEM AI Calculators (docs/15-gem-ai.md). The numbers come from @aatmiq/calculators, plain code
 * that the browser runs too; the server runs it again before anything is kept, so history only
 * ever holds results the tested functions produced. No model is called here.
 * A formula calculator is verified once it has at least five reference cases.
 */
import { and, calculatorFavorite, calculatorHistory, desc, eq } from "@aatmiq/db";
import { calc, CalcError, calculatorCatalog, ExprError, getCalculator, runCalculator, TOOLS } from "@aatmiq/calculators";
import { calculatorHistorySchema, calculatorRunSchema } from "@aatmiq/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parse, requireUser, type AppContext, type SessionUser } from "../context";
import { badRequest, HttpError, notFound } from "../errors";
import { requireModule } from "../services/gem";

const KEYPADS = new Set(["basic", "scientific"]);
const TOOL_IDS = new Set(TOOLS.map((t) => t.id));

function calcError(e: unknown): never {
  if (e instanceof CalcError) throw new HttpError(400, e.message, "calc_error", { field: e.field ?? null });
  if (e instanceof ExprError) throw new HttpError(400, e.message, "calc_error", { position: e.position ?? null });
  throw e;
}

export async function calculatorRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  const allowed = async (u: SessionUser, workspaceId: string, id: string) => {
    const { settings } = await requireModule(ctx, u, workspaceId, "calculators");
    if (TOOL_IDS.has(id)) return;
    let def;
    try {
      def = getCalculator(id);
    } catch {
      throw notFound("Calculator not found");
    }
    if (def.status === "beta" && !settings.betaCalculators) throw notFound("Calculator not found");
  };

  /** Every calculator and tool the organization shows, with the person's favorites. */
  app.get<{ Querystring: { workspaceId: string } }>("/api/calculators", async (req) => {
    const u = await requireUser(ctx, req);
    const { settings } = await requireModule(ctx, u, req.query.workspaceId, "calculators");
    const favorites = await db.select({ id: calculatorFavorite.calculatorId }).from(calculatorFavorite).where(eq(calculatorFavorite.userId, u.id));
    return {
      calculators: calculatorCatalog().filter((c) => c.status !== "beta" || settings.betaCalculators),
      favorites: favorites.map((f) => f.id),
      betaCalculators: settings.betaCalculators,
    };
  });

  /** Run a formula calculator on the server (and keep it in history unless save is false). */
  app.post("/api/calculators/run", async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(calculatorRunSchema, req.body);
    const workspaceId = body.workspaceId ?? "";
    await allowed(u, workspaceId, body.calculatorId);
    if (TOOL_IDS.has(body.calculatorId)) throw badRequest("Tools are saved with /api/calculators/history.");
    let result;
    try {
      result = runCalculator(body.calculatorId, body.inputs as never, body.outputUnits ?? {});
    } catch (e) {
      calcError(e);
    }
    let historyId: string | null = null;
    if (body.save !== false) {
      const [row] = await db
        .insert(calculatorHistory)
        .values({ userId: u.id, workspaceId, calculatorId: result.calculatorId, kind: "formula", formulaVersion: result.version, inputs: result.inputs, outputs: result.outputs, source: "calculators" })
        .returning({ id: calculatorHistory.id });
      historyId = row!.id;
    }
    return { ...result, historyId };
  });

  /**
   * Keep a keypad calculation (re-evaluated here: what's kept is what the engine computes) or a
   * tool's result.
   */
  app.post("/api/calculators/history", async (req) => {
    const u = await requireUser(ctx, req);
    const body = parse(calculatorHistorySchema, req.body);
    const workspaceId = body.workspaceId ?? "";
    await allowed(u, workspaceId, body.calculatorId);
    if (KEYPADS.has(body.calculatorId)) {
      if (!body.expression) throw badRequest("Enter an expression");
      let value: number;
      try {
        value = calc(body.expression, { angle: body.angle ?? "deg", vars: body.vars });
      } catch (e) {
        calcError(e);
      }
      const [row] = await db
        .insert(calculatorHistory)
        .values({ userId: u.id, workspaceId, calculatorId: body.calculatorId, kind: "expression", inputs: { expression: body.expression, angle: body.angle ?? "deg" }, outputs: { value }, source: "calculators" })
        .returning();
      return row;
    }
    if (!TOOL_IDS.has(body.calculatorId)) throw badRequest("Use /api/calculators/run for formula calculators.");
    const outputs = JSON.stringify(body.outputs ?? null);
    if (outputs.length > 20_000) throw badRequest("That result is too large to keep.");
    const [row] = await db
      .insert(calculatorHistory)
      .values({ userId: u.id, workspaceId, calculatorId: body.calculatorId, kind: "tool", inputs: body.inputs ?? {}, outputs: body.outputs ?? null, source: "calculators" })
      .returning();
    return row;
  });

  app.get<{ Querystring: { workspaceId: string; calculatorId?: string; limit?: string } }>("/api/calculators/history", async (req) => {
    const u = await requireUser(ctx, req);
    await requireModule(ctx, u, req.query.workspaceId, "calculators");
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    return db
      .select()
      .from(calculatorHistory)
      .where(and(eq(calculatorHistory.userId, u.id), req.query.calculatorId ? eq(calculatorHistory.calculatorId, req.query.calculatorId) : undefined))
      .orderBy(desc(calculatorHistory.createdAt))
      .limit(limit);
  });

  app.delete<{ Params: { id: string } }>("/api/calculators/history/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const r = await db.delete(calculatorHistory).where(and(eq(calculatorHistory.id, req.params.id), eq(calculatorHistory.userId, u.id))).returning({ id: calculatorHistory.id });
    if (!r.length) throw notFound("Not found");
    return { ok: true };
  });

  app.delete<{ Querystring: { calculatorId?: string } }>("/api/calculators/history", async (req) => {
    const u = await requireUser(ctx, req);
    await db.delete(calculatorHistory).where(and(eq(calculatorHistory.userId, u.id), req.query.calculatorId ? eq(calculatorHistory.calculatorId, req.query.calculatorId) : undefined));
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>("/api/calculators/favorites/:id", async (req) => {
    const u = await requireUser(ctx, req);
    const { favorite, workspaceId } = parse(z.object({ favorite: z.boolean(), workspaceId: z.string() }), req.body);
    await allowed(u, workspaceId, req.params.id);
    if (favorite) await db.insert(calculatorFavorite).values({ userId: u.id, calculatorId: req.params.id }).onConflictDoNothing();
    else await db.delete(calculatorFavorite).where(and(eq(calculatorFavorite.userId, u.id), eq(calculatorFavorite.calculatorId, req.params.id)));
    return { ok: true };
  });
}
