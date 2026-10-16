"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Card, EmptyState, Meter } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { del, get, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTokens } from "@/lib/format";

import { useT } from "@/i18n";
interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  tokenLimit: number | null;
  memberTokenLimit: number | null;
  used: number;
  members: { id: string; name: string; email: string; image: string | null; status: string; used: number }[];
  models: { id: string; displayName: string; enabled: boolean }[];
}
interface PersonRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: string;
}
interface ModelRow {
  id: string;
  displayName: string;
  providerName: string;
  kind: "chat" | "embedding";
  enabled: boolean;
}

/** Text field for a token amount: digits only, empty means "no limit". */
const toTokens = (s: string) => (s.trim() ? Number(s.replace(/\D/g, "")) : null);

export default function GroupsPage() {
  const t = useT();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-groups"], queryFn: () => get<GroupRow[]>("/api/admin/groups") });
  const [editing, setEditing] = useState<GroupRow | "new" | null>(null);
  const [removing, setRemoving] = useState<GroupRow | null>(null);
  const remove = useMutation({
    mutationFn: (g: GroupRow) => del(`/api/admin/groups/${g.id}`),
    onSuccess: (_d, g) => {
      toast.success(t("Deleted {name}", { name: g.name }));
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("Groups")}
        description={t("Give people models and a token budget in every workspace they're in. A group pays for the models only it gives; workspace models stay on the workspace's budget.")}
        actions={
          <Button variant="primary" onClick={() => setEditing("new")} data-testid="new-group">
            <Plus className="size-4" /> {t("New group")}
          </Button>
        }
      />
      {list.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {list.data?.length === 0 && (
        <EmptyState art="empty-groups"
          icon={<Users className="size-5" />}
          title={t("No groups yet")}
          description={t("For example “Engineering” with a larger coding model and its own monthly budget, whichever workspaces its people work in.")}
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> {t("New group")}
            </Button>
          }
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.data?.map((g) => {
          const perPerson = g.memberTokenLimit ?? (g.tokenLimit !== null ? Math.floor(g.tokenLimit / Math.max(1, g.members.length)) : null);
          return (
            <Card key={g.id} className="p-5" data-testid={`group-${g.name}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{g.name}</div>
                  {g.description && <div className="mt-0.5 text-[12.5px] text-fg-subtle">{g.description}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t("Edit {name}", { name: g.name })} onClick={() => setEditing(g)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t("Delete {name}", { name: g.name })} onClick={() => setRemoving(g)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.models.map((m) => (
                  <Badge key={m.id} tone={m.enabled ? "neutral" : "warning"}>
                    <Cpu className="size-3" /> {m.enabled ? m.displayName : t("{name} (off)", { name: m.displayName })}
                  </Badge>
                ))}
                {g.models.length === 0 && <span className="text-[12.5px] text-fg-subtle">{t("No models: members use their workspaces' models.")}</span>}
              </div>
              <div className="mt-4 flex justify-between text-xs">
                <span className="text-fg-muted">{t("{used} used this period", { used: formatTokens(g.used) })}</span>
                <span className="text-fg-subtle">{g.tokenLimit === null ? t("No group budget") : t("of {tokenLimit}", { tokenLimit: formatTokens(g.tokenLimit) })}</span>
              </div>
              <Meter value={g.tokenLimit ? g.used / g.tokenLimit : null} className="mt-1.5" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex -space-x-1.5">
                  {g.members.slice(0, 8).map((m) => (
                    <Avatar key={m.id} name={m.name} image={m.image} className="size-6 ring-2 ring-surface" />
                  ))}
                  {g.members.length > 8 && <span className="pl-3 text-xs text-fg-subtle">+{g.members.length - 8}</span>}
                </div>
                <span className="text-xs text-fg-subtle">
                  {t.n(g.members.length, "{n} person", "{n} people")}
                  {perPerson !== null &&
                    " · " +
                      (g.memberTokenLimit === null
                        ? t("{tokens} each (even split)", { tokens: formatTokens(perPerson) })
                        : t("{tokens} each", { tokens: formatTokens(perPerson) }))}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && <GroupDialog group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("Delete {name}?", { name: removing?.name })}
        description={t("Its members lose the models only this group gives. Usage already recorded stays in reports.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>{t("Cancel")}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              {t("Delete group")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function GroupDialog({ group, onClose }: { group: GroupRow | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ["admin-users"], queryFn: () => get<PersonRow[]>("/api/admin/users") });
  const models = useQuery({ queryKey: ["admin-models"], queryFn: () => get<ModelRow[]>("/api/admin/models") });
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [tokenLimit, setTokenLimit] = useState(group?.tokenLimit != null ? String(group.tokenLimit) : "");
  const [memberLimit, setMemberLimit] = useState(group?.memberTokenLimit != null ? String(group.memberTokenLimit) : "");
  const [members, setMembers] = useState(() => new Set(group?.members.map((m) => m.id) ?? []));
  const [modelIds, setModelIds] = useState(() => new Set(group?.models.map((m) => m.id) ?? []));
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (people.data ?? []).filter((p) => p.status === "active" || members.has(p.id)).filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle));
  }, [people.data, q, members]);
  const chatModels = (models.data ?? []).filter((m) => m.kind === "chat");
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null, tokenLimit: toTokens(tokenLimit), memberTokenLimit: toTokens(memberLimit), memberIds: [...members], modelIds: [...modelIds] };
      return group ? patch(`/api/admin/groups/${group.id}`, body) : post("/api/admin/groups", body);
    },
    onSuccess: () => {
      toast.success(group ? t("Group saved") : t("Created {name}", { name: name.trim() }));
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={group ? t("Edit {name}", { name: group.name }) : t("New group")}
      description={t("Members can use the group's models in every workspace they're in, paid from the group's budget.")}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()} data-testid="save-group">
            {group ? t("Save") : t("Create group")}
          </Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-5 overflow-y-auto pr-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Name")}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Engineering")} maxLength={60} data-testid="group-name" />
          </Field>
          <Field label={t("Description (optional)")}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={1} maxLength={280} placeholder={t("Who it's for")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Group budget per period")} hint={t("Tokens for the whole group. Empty: no limit.")}>
            <Input inputMode="numeric" value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value.replace(/[^\d]/g, ""))} placeholder={t("No limit")} className="font-mono" data-testid="group-budget" />
          </Field>
          <Field label={t("Each person")} hint={t("Empty: the group budget split evenly.")}>
            <Input inputMode="numeric" value={memberLimit} onChange={(e) => setMemberLimit(e.target.value.replace(/[^\d]/g, ""))} placeholder={t("Even split")} className="font-mono" data-testid="group-member-budget" />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-[12.5px] font-medium text-fg-muted">{t("Models ({size})", { size: modelIds.size })}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {chatModels.map((m) => (
              <label key={m.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors", modelIds.has(m.id) ? "border-border-strong bg-surface-2" : "border-border hover:border-border-strong")}>
                <input type="checkbox" className="accent-[var(--accent)]" checked={modelIds.has(m.id)} onChange={() => toggle(modelIds, m.id, setModelIds)} data-testid={`group-model-${m.displayName}`} />
                <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                <span className="truncate text-[11.5px] text-fg-subtle">{m.enabled ? m.providerName : t("off")}</span>
              </label>
            ))}
            {models.isSuccess && chatModels.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("Add models in Admin → Models first.")}</p>}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-medium text-fg-muted">{t("Members ({size})", { size: members.size })}</span>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find people")} className="h-8 pl-8 text-[13px]" data-testid="group-member-search" />
            </div>
          </div>
          <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {shown.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2">
                <input type="checkbox" className="accent-[var(--accent)]" checked={members.has(p.id)} onChange={() => toggle(members, p.id, setMembers)} data-testid={`group-member-${p.email}`} />
                <Avatar name={p.name} image={p.image} className="size-6" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="truncate text-[12px] text-fg-subtle">{p.email}</span>
              </label>
            ))}
            {people.isSuccess && shown.length === 0 && <p className="px-3 py-3 text-[12.5px] text-fg-subtle">{t("No one matches.")}</p>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
