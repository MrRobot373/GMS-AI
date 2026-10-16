"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { get, put } from "@/lib/api";

interface Gem {
  modules: { learning: boolean; calculators: boolean; knowledge: boolean };
  betaCalculators: boolean;
  coursesPerDay: number;
  lessonsPerDay: number;
  youtube: "settings" | "environment" | "none";
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
  if (!q.data) return <Skeleton className="h-40" />;
  const g = q.data;
  const l = limits ?? { courses: String(g.coursesPerDay), lessons: String(g.lessonsPerDay) };
  const row = (name: string, hint: string, on: boolean, flip: (v: boolean) => void) => (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div>
        <div className="text-[13.5px] text-fg">{name}</div>
        <div className="text-[12.5px] text-fg-subtle">{hint}</div>
      </div>
      <Switch checked={on} onCheckedChange={flip} label={name} />
    </div>
  );
  return (
    <Section title={t("GEM AI modules")} description={t("Learning, Calculators and Knowledge. Switch one off and it disappears for everyone, without affecting Chat, Work AI or Code. Each person's access is set per workspace.")}>
      <Card className="p-5">
        {row(t("Learning"), t("Courses written by your models, saved lesson by lesson."), g.modules.learning, (v) => save.mutate({ modules: { learning: v } }))}
        {row(t("Calculators"), t("Tested engineering formulas, keypads, unit converter; and the calculator tool in chat."), g.modules.calculators, (v) => save.mutate({ modules: { calculators: v } }))}
        {row(t("Knowledge"), t("Questions answered only from one project's documents, with citations."), g.modules.knowledge, (v) => save.mutate({ modules: { knowledge: v } }))}
        {row(t("Beta calculators"), t("Calculators checked against fewer than five reference cases. Off: only the verified ones show."), g.betaCalculators, (v) => save.mutate({ betaCalculators: v }))}
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
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-[13.5px] text-fg">
          {t("YouTube Data API key")}
          <Badge tone={g.youtube === "none" ? "neutral" : "success"}>{g.youtube === "settings" ? t("Set here") : g.youtube === "environment" ? t("From YOUTUBE_API_KEY") : t("Not set")}</Badge>
        </div>
        <p className="text-[12.5px] text-fg-subtle">{t("Lessons link real videos found with this key (search results only, never links a model wrote). Without it, lessons have no videos. The key is stored encrypted.")}</p>
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
