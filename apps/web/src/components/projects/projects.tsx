"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Folder, Globe, Lock, Search, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCanUse, useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/overlay";
import { FolderPickerButton } from "@/components/work/folder-picker";
import { ApiError, del, get, patch, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { DocumentRow, ProjectDetail, ProjectSummary } from "@/lib/types";

/** Who can be added to a project: people from any team (workspaceRole null: they would join as a guest) and groups. */
interface Candidates {
  people: { id: string; name: string; email: string; image: string | null; workspaceRole: string | null; teams: string[] }[];
  groups: { id: string; name: string; members: number }[];
}
import { useT } from "@/i18n";

export const PROJECT_HUES = ["190", "260", "330", "25", "145", "45", "210", "0"];

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => get<ProjectSummary[]>(`/api/projects?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => get<ProjectDetail>(`/api/projects/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.sources.some((s) => s.status === "processing") ? 1500 : false),
  });
}

/** A folder tinted with the project colour. */
export function ProjectIcon({ color, className }: { color?: string | null; className?: string }) {
  return <Folder className={cn("size-4 shrink-0", className)} style={{ color: `oklch(0.72 0.13 ${color ?? "190"})` }} aria-hidden />;
}

/** Upload a project source. With `replaces`, it becomes the new version of that source. */
export async function uploadProjectSource(projectId: string, file: File, replaces?: string) {
  const form = new FormData();
  if (replaces) form.append("replaces", replaces);
  form.append("file", file);
  const res = await fetch(`/api/projects/${projectId}/sources/upload`, { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Upload failed", data.code);
  return data as DocumentRow;
}

function HuePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={t("Colour")}>
      {PROJECT_HUES.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={value === h}
          onClick={() => onChange(h)}
          className={cn(
            "flex size-7 items-center justify-center rounded-lg border transition-colors",
            value === h ? "border-fg-subtle bg-surface-2" : "border-border hover:border-border-strong",
          )}
        >
          <ProjectIcon color={h} />
        </button>
      ))}
    </div>
  );
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("190");
  const [instructions, setInstructions] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setInstructions("");
      setColor(PROJECT_HUES[Math.floor(Math.random() * PROJECT_HUES.length)]!);
    }
  }, [open]);
  const create = useMutation({
    mutationFn: () => post<{ id: string }>("/api/projects", { workspaceId, name: name.trim(), color, instructions: instructions.trim() || undefined }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      onOpenChange(false);
      router.push(`/app/projects/${p.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("New project")}
      description={t("Keep chats, files and instructions for one piece of work together.")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            {t("Create project")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("Name")}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Q3 board report")}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
          />
        </Field>
        <Field label={t("Colour")}>
          <HuePicker value={color} onChange={setColor} />
        </Field>
        <Field label={t("Instructions")} hint={t("Optional. Every chat in this project follows these, instead of your personal instructions.")}>
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("e.g. Answer as a concise checklist. Our fiscal year starts in April.")} />
        </Field>
      </div>
    </Dialog>
  );
}

export function ProjectSettingsDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { workspaceId } = useSession();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [workFolder, setWorkFolder] = useState(project.workFolder ?? "");
  const folders = useQuery({ queryKey: ["work-info", workspaceId], queryFn: () => get<{ folders?: boolean }>(`/api/work/info?workspaceId=${workspaceId}`), enabled: open && !!workspaceId });
  // Which connectors the project's Work AI tasks get (null: all of them).
  const canWork = useCanUse("work");
  const connectors = useQuery({
    queryKey: ["connectors"],
    queryFn: () => get<{ id: string; displayName: string; connected: boolean }[]>("/api/connectors"),
    enabled: open && canWork,
  });
  const [connectorIds, setConnectorIds] = useState<string[] | null>(project.connectorIds);
  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setColor(project.color);
    setDescription(project.description ?? "");
    setInstructions(project.instructions ?? "");
    setWorkFolder(project.workFolder ?? "");
    setConnectorIds(project.connectorIds);
  }, [open, project]);
  const save = useMutation({
    mutationFn: () =>
      patch(`/api/projects/${project.id}`, {
        name: name.trim(),
        color,
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        ...(folders.data?.folders ? { workFolder: workFolder.trim() || null } : {}),
        // Only once the list has loaded, so a quick save never clears the choice.
        ...(canWork && connectors.data ? { connectorIds: connectorIds?.filter((id) => connectors.data.some((c) => c.id === id)) ?? null } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      onOpenChange(false);
      toast(t("Project saved"));
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Project settings")}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>{t("Save")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("Name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("Colour")}>
          <HuePicker value={color} onChange={setColor} />
        </Field>
        <Field label={t("Description")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("What is this project about?")} />
        </Field>
        <Field label={t("Instructions")} hint={t("Chats and Work AI tasks in this project follow these instead of each person's own custom instructions.")}>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="min-h-40"
            placeholder={t("e.g. You are helping the finance team. Always cite the source file. Use INR.")}
            data-testid="project-instructions"
          />
        </Field>
        {folders.data?.folders && (
          <Field label={t("Shared folder")} hint={t("Optional. A folder on the server the project's Work AI and Super AI tasks work in by default, so everyone works on the same files. One task at a time can use it.")}>
            <div className="flex items-center gap-2">
              <Input value={workFolder} onChange={(e) => setWorkFolder(e.target.value)} placeholder={t("Full path, e.g. E:\\Projects\\ADAS")} data-testid="project-work-folder" />
              <FolderPickerButton workspaceId={workspaceId} start={workFolder} onPick={setWorkFolder} />
            </div>
          </Field>
        )}
        {canWork && (connectors.data?.length ?? 0) > 0 && (
          <Field label={t("Connectors for Work AI tasks")} hint={t("Tasks in this project can use only the apps chosen here (each person still signs in to their own).")}>
            <div className="space-y-2" data-testid="project-connectors">
              <Select value={connectorIds === null ? "all" : "some"} onChange={(e) => setConnectorIds(e.target.value === "all" ? null : [])} data-testid="project-connectors-mode">
                <option value="all">{t("All the organization's connectors")}</option>
                <option value="some">{t("Only the ones chosen below")}</option>
              </Select>
              {connectorIds !== null && (
                <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {connectors.data!.map((c) => {
                    const on = connectorIds.includes(c.id);
                    return (
                      <label key={c.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors", on ? "border-border-strong bg-surface-2" : "border-border hover:border-border-strong")}>
                        <input
                          type="checkbox"
                          className="accent-[var(--accent)]"
                          checked={on}
                          onChange={() => setConnectorIds(on ? connectorIds.filter((x) => x !== c.id) : [...connectorIds, c.id])}
                          data-testid={`project-connector-${c.displayName}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export function ShareProjectDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { me, workspaceId } = useSession();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"chat" | "edit">("chat");
  const q = useDeferredValue(query.trim());
  // Anyone in the organization, whatever their team, and whole groups (docs/03-projects.md, "People from other teams").
  const found = useQuery({
    queryKey: ["project-candidates", project.id, q],
    queryFn: () => get<Candidates>(`/api/projects/${project.id}/candidates?q=${encodeURIComponent(q)}`),
    enabled: open && project.canEdit,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["project", project.id] });
    qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
  };
  const onError = (e: unknown) => toast.error((e as Error).message);
  const setVisibility = useMutation({
    mutationFn: (visibility: "private" | "workspace") => patch(`/api/projects/${project.id}`, { visibility }),
    onSuccess: refresh,
    onError,
  });
  const setMember = useMutation({
    mutationFn: (b: { userId?: string; groupId?: string; role: "chat" | "edit" }) => put<{ added: number; guests: number }>(`/api/projects/${project.id}/members`, b),
    onSuccess: (r, b) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["project-candidates", project.id] });
      if (b.groupId) toast(t.n(r.added, "{n} person added", "{n} people added"));
      if (r.guests) toast(t.n(r.guests, "{n} person from another team joins as a guest: they see only this project here.", "{n} people from other teams join as guests: they see only this project here."));
    },
    onError,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => del(`/api/projects/${project.id}/members/${userId}`),
    onSuccess: refresh,
    onError,
  });
  const candidates = useMemo(
    () => (found.data?.people ?? []).filter((p) => p.id !== project.ownerId && !project.members.some((m) => m.userId === p.id)),
    [found.data, project],
  );
  const groups = found.data?.groups ?? [];
  const editable = project.canEdit;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Share “{name}”", { name: project.name })}
      description={t("People you share with can use the project's instructions and sources. Chats stay private unless their author shares them to the project.")}
      className="max-w-lg"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "private", icon: Lock, t: t("Only people invited"), d: t("You and the people below") },
              { v: "workspace", icon: Globe, t: t("Everyone in the workspace"), d: t("Anyone can open and chat") },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={!editable}
              onClick={() => o.v !== project.visibility && setVisibility.mutate(o.v)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                project.visibility === o.v ? "border-fg-subtle bg-surface-2" : "border-border hover:border-border-strong",
              )}
            >
              <o.icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              <span className="min-w-0">
                <span className="block text-[13px] text-fg">{o.t}</span>
                <span className="block text-[12px] text-fg-subtle">{o.d}</span>
              </span>
              {project.visibility === o.v && <Check className="ml-auto size-3.5 shrink-0 text-fg" />}
            </button>
          ))}
        </div>

        {editable && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Add people or a team, from any department…")}
                  aria-label={t("Person or team to add")}
                  className="pl-8"
                  data-testid="project-member-search"
                />
              </div>
              <div className="w-28">
                <Select value={role} onChange={(e) => setRole(e.target.value as "chat" | "edit")} aria-label={t("Role")}>
                  <option value="chat">{t("Can chat")}</option>
                  <option value="edit">{t("Can edit")}</option>
                </Select>
              </div>
            </div>
            {(candidates.length > 0 || groups.length > 0) && (
              <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border" data-testid="project-candidates">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    disabled={setMember.isPending || g.members === 0}
                    onClick={() => setMember.mutate({ groupId: g.id, role })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-surface-3 text-fg-subtle">
                      <Users className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{g.name}</span>
                      <span className="block text-[12px] text-fg-subtle">{t.n(g.members, "Group · add its {n} member", "Group · add all {n} members")}</span>
                    </span>
                    <UserPlus className="size-3.5 text-fg-subtle" />
                  </button>
                ))}
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={setMember.isPending}
                    onClick={() => setMember.mutate({ userId: c.id, role })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                  >
                    <Avatar name={c.name} image={c.image} className="size-7" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{c.name}</span>
                      <span className="block truncate text-[12px] text-fg-subtle">
                        {c.email}
                        {c.teams.length > 0 && ` · ${c.teams.join(", ")}`}
                      </span>
                    </span>
                    {!c.workspaceRole && <span className="shrink-0 text-[11.5px] text-fg-subtle">{t("Other team")}</span>}
                    <UserPlus className="size-3.5 shrink-0 text-fg-subtle" />
                  </button>
                ))}
              </div>
            )}
            {found.data && candidates.length === 0 && groups.length === 0 && (
              <p className="px-1 text-[12px] text-fg-subtle">{q ? t("No one matches “{q}”.", { q }) : t("Everyone already has access.")}</p>
            )}
          </div>
        )}

        <div className="divide-y divide-border rounded-xl border border-border">
          {project.owner && (
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={project.owner.name} className="size-7" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">
                  {project.owner.name} {project.owner.id === me.user.id && <span className="text-fg-subtle">{t("(you)")}</span>}
                </div>
                <div className="truncate text-[12px] text-fg-subtle">{project.owner.email}</div>
              </div>
              <span className="text-[12px] text-fg-subtle">{t("Owner")}</span>
            </div>
          )}
          {project.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={m.name} image={m.image} className="size-7" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">
                  {m.name} {m.userId === me.user.id && <span className="text-fg-subtle">{t("(you)")}</span>}
                </div>
                <div className="truncate text-[12px] text-fg-subtle">
                  {m.email}
                  {m.guest && ` · ${m.teams?.length ? t("Guest from {teams}", { teams: m.teams.join(", ") }) : t("Guest")}`}
                </div>
              </div>
              {editable ? (
                <>
                  <div className="w-28">
                    <Select
                      value={m.role}
                      aria-label={t("Role for {name}", { name: m.name })}
                      onChange={(e) => setMember.mutate({ userId: m.userId, role: e.target.value as "chat" | "edit" })}
                      className="h-8"
                    >
                      <option value="chat">{t("Can chat")}</option>
                      <option value="edit">{t("Can edit")}</option>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={t("Remove {name}", { name: m.name })} onClick={() => removeMember.mutate(m.userId)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <span className="text-[12px] text-fg-subtle">{m.role === "edit" ? t("Can edit") : t("Can chat")}</span>
              )}
            </div>
          ))}
          {project.members.length === 0 && (
            <p className="px-3 py-3 text-[12.5px] text-fg-subtle">
              {project.visibility === "workspace" ? t("Everyone in the workspace can chat here.") : t("Nobody else has access yet.")}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Pick a project to move a chat into (or take it out of its project). */
export function MoveToProjectDialog({
  chat,
  onOpenChange,
}: {
  chat: { id: string; title: string; projectId?: string | null } | null;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const { workspaceId } = useSession();
  const qc = useQueryClient();
  const projects = useProjects(workspaceId);
  const move = useMutation({
    mutationFn: (projectId: string | null) => patch(`/api/chats/${chat!.id}`, { projectId }),
    onSuccess: (_d, projectId) => {
      qc.invalidateQueries({ queryKey: ["chats", workspaceId] });
      qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      qc.invalidateQueries({ queryKey: ["project"] });
      qc.invalidateQueries({ queryKey: ["chat", chat!.id] });
      const name = projects.data?.find((p) => p.id === projectId)?.name;
      toast(projectId ? t("Moved to {name}", { name: name }) : t("Removed from project"));
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!chat} onOpenChange={onOpenChange} title={t("Move to project")} description={chat ? `“${chat.title}”` : undefined}>
      <div className="max-h-72 space-y-px overflow-y-auto">
        {(projects.data ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={move.isPending}
            onClick={() => move.mutate(p.id)}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-surface-2",
              chat?.projectId === p.id ? "text-fg" : "text-fg-muted",
            )}
          >
            <ProjectIcon color={p.color} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {chat?.projectId === p.id && <Check className="size-3.5" />}
          </button>
        ))}
        {projects.data?.length === 0 && <p className="px-2 py-2 text-[12.5px] text-fg-subtle">{t("You have no projects yet. Create one from the sidebar.")}</p>}
        {chat?.projectId && (
          <button
            type="button"
            onClick={() => move.mutate(null)}
            className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-lg border-t border-border px-2 text-left text-[13px] text-fg-muted hover:bg-surface-2"
          >
            {t("Remove from project")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
