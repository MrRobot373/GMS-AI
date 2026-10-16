"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Section } from "@/components/admin/table";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { get, post, put } from "@/lib/api";
import { routingReason, TIER_NAMES } from "@/lib/format";
import type { ModelTier, Routing, RoutingSettingsValue } from "@aatmiq/shared";

import { useT } from "@/i18n";
interface TieredModel {
  id: string;
  displayName: string;
  kind: "chat" | "embedding";
  enabled: boolean;
  tier: ModelTier | null;
  thinkingSwitch: boolean;
}

function Row({ title, children, control }: { title: string; children: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-fg">{title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">{children}</p>
      </div>
      {control}
    </div>
  );
}

/** Admin → Models → Auto: picks the model for each message by how hard it is. */
export function AutoRouting({ models }: { models: TieredModel[] }) {
  const t = useT();
  const qc = useQueryClient();
  const { workspaceId } = useSession();
  const settings = useQuery({ queryKey: ["admin-routing"], queryFn: () => get<RoutingSettingsValue>("/api/admin/routing") });
  const save = useMutation({
    mutationFn: (body: Partial<RoutingSettingsValue>) => put<RoutingSettingsValue>("/api/admin/routing", body),
    onSuccess: (s) => {
      qc.setQueryData(["admin-routing"], s);
      qc.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [text, setText] = useState("");
  const trial = useMutation({
    mutationFn: () => post<{ model: { displayName: string }; routing: Routing; ms: number }>("/api/admin/routing/try", { workspaceId, text }),
    onError: (e: Error) => toast.error(e.message),
  });

  const chat = models.filter((m) => m.kind === "chat" && m.enabled);
  const byTier = (["fast", "standard", "advanced"] as const).map((tier) => ({ tier, names: chat.filter((m) => m.tier === tier).map((m) => m.displayName) }));
  const tiers = byTier.filter((x) => x.names.length).length;
  const s = settings.data;

  return (
    <Section
      title={t("Auto")}
      description={t("Picks the model for each message by how hard it is: quick questions to a fast model, everyday work to the standard one, hard problems to the strongest (with thinking on). Put models in tiers in the table below.")}
    >
      <Card className="divide-y divide-border" data-testid="auto-routing">
        <div className="flex flex-wrap gap-2 p-5">
          {byTier.map((x) => (
            <span key={x.tier} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px]" data-testid={`tier-${x.tier}`}>
              <span className="text-fg-subtle">{t(TIER_NAMES[x.tier])}</span>
              <span className={x.names.length ? "text-fg" : "text-fg-subtle"}>{x.names.join(", ") || t("none")}</span>
            </span>
          ))}
          {tiers < 2 && <Badge tone="warning">{t("Auto needs models in at least two tiers")}</Badge>}
        </div>
        {s && (
          <>
            <Row title={t("Offer Auto")} control={<Switch checked={s.enabled} onCheckedChange={(v) => save.mutate({ enabled: v })} label={t("Offer Auto")} />}>
              {t("Auto shows first in the model menus of Chat, Work AI and Code, wherever someone has models in two tiers.")}
            </Row>
            <Row title={t("Start with Auto")} control={<Switch checked={s.default} disabled={!s.enabled} onCheckedChange={(v) => save.mutate({ default: v })} label={t("Start with Auto")} />}>
              {t("New chats and tasks use Auto unless people pick a model. Off: they start with the workspace's default model.")}
            </Row>
            <Row
              title={t("Unclear requests")}
              control={
                <div className="flex flex-col items-end gap-2">
                  <Select value={s.judge} onChange={(e) => save.mutate({ judge: e.target.value as "rules" | "model" })} className="w-48" aria-label={t("Unclear requests")} data-testid="auto-judge">
                    <option value="model">{t("Ask a judge model")}</option>
                    <option value="rules">{t("Rules only")}</option>
                  </Select>
                  {s.judge === "model" && (
                    <Select value={s.judgeModelId ?? ""} onChange={(e) => save.mutate({ judgeModelId: e.target.value || null })} className="w-48" aria-label={t("Judge model")}>
                      <option value="">{t("The fast model")}</option>
                      {chat.map((m) => (
                        <option key={m.id} value={m.id}>{m.displayName}</option>
                      ))}
                    </Select>
                  )}
                </div>
              }
            >
              {t("Greetings, quick rewrites, code with errors and multi-part analysis are recognized right away. For the rest a judge model reads the request and answers easy, medium or hard (a fraction of a second on a GPU; if it's slow, the standard model answers).")}
            </Row>
            <Row title={t("Think on hard requests")} control={<Switch checked={s.thinkOnHard} onCheckedChange={(v) => save.mutate({ thinkOnHard: v })} label={t("Think on hard requests")} />}>
              {t("Models that can switch thinking (marked Thinking below) think before answering hard requests, and answer everything else directly.")}
            </Row>
          </>
        )}
        <div className="p-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) trial.mutate();
            }}
          >
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Try a message, e.g. “Fix this error in my Python script”")} data-testid="auto-try-input" />
            <Button type="submit" variant="secondary" disabled={!text.trim() || trial.isPending || tiers < 2}>
              <Sparkles /> {t("Try")}
            </Button>
          </form>
          {trial.data && (
            <p className="mt-3 text-[13px] text-fg-muted" data-testid="auto-try-result">
              {t(trial.data.routing.thinking ? "{model} ({tier}): {reason}, with thinking." : "{model} ({tier}): {reason}.", {
                model: <span className="text-fg">{trial.data.model.displayName}</span>,
                tier: t(TIER_NAMES[trial.data.routing.tier]).toLowerCase(),
                reason: routingReason(trial.data.routing.reason, t),
              })}{" "}
              <span className="text-fg-subtle">{t("Decided in {ms} ms.", { ms: trial.data.ms })}</span>
            </p>
          )}
        </div>
      </Card>
    </Section>
  );
}
