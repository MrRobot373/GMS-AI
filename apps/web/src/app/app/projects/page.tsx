"use client";

import { FolderOpen, Globe, Lock, MessageSquare, Paperclip, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/app/frame";
import { useSession } from "@/components/app/session";
import { NewProjectDialog, ProjectIcon, useProjects } from "@/components/projects/projects";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/spinner";
import { get } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useT } from "@/i18n";

export default function ProjectsPage() {
  const t = useT();
  const { me, workspaceId, workspace, setWorkspaceId } = useSession();
  const router = useRouter();
  const projects = useProjects(workspaceId);
  const [creating, setCreating] = useState(false);
  // A guest here (from another team) works only in the projects they were added to; they can't start new ones.
  const guest = workspace?.role === "guest" && !me.isAdmin;
  // Projects you're in that live in your other workspaces, e.g. a cross-team project another team runs.
  const elsewhere = useQuery({
    queryKey: ["projects-elsewhere", workspaceId],
    queryFn: () => get<{ id: string; name: string; color: string; workspaceId: string; workspaceName: string; guest: boolean }[]>(`/api/projects/elsewhere?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        icon={<FolderOpen />}
        title={t("Projects")}
        actions={
          !guest && (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> {t("New project")}
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
          <h1 className="font-serif text-[30px] leading-tight tracking-[-0.02em]">{t("Projects")}</h1>
          <p className="mt-1 max-w-xl text-[13px] text-fg-subtle">
            {t("A project keeps the chats, files and instructions for one piece of work together. Chats inside a project remember each other and can use its files.")}
          </p>

          {projects.data?.length === 0 && (
            <EmptyState
              art="empty-projects"
              className="mt-6 rounded-xl border border-dashed border-border"
              icon={<FolderOpen className="size-5" />}
              title={t("No projects yet")}
              action={
                !guest && (
                  <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                    <Plus className="size-3.5" /> {t("New project")}
                  </Button>
                )
              }
            />
          )}
          <div className="mt-6 grid gap-3 empty:hidden sm:grid-cols-2 lg:grid-cols-3">
            {projects.isLoading &&
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)}
            {projects.data?.map((p) => (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="group flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-border bg-bg">
                    <ProjectIcon color={p.color} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{p.name}</span>
                  {p.visibility === "workspace" ? (
                    <Globe className="size-3.5 text-fg-subtle" aria-label={t("Shared with the workspace")} />
                  ) : p.memberCount > 0 ? (
                    <Users className="size-3.5 text-fg-subtle" aria-label={t("Shared")} />
                  ) : (
                    <Lock className="size-3.5 text-fg-subtle" aria-label={t("Private")} />
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 min-h-[34px] text-[12.5px] leading-snug text-fg-subtle">
                  {p.description || t("No description")}
                </p>
                <div className="mt-3 flex items-center gap-3 text-[11.5px] text-fg-subtle">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="size-3" /> {p.chatCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Paperclip className="size-3" /> {p.sourceCount}
                  </span>
                  <span className="ml-auto">{p.ownerId === me.user.id ? t("Yours") : t("Shared with you")} · {timeAgo(p.updatedAt, t)}</span>
                </div>
              </Link>
            ))}
            {!!projects.data?.length && !guest && (
              <button
                onClick={() => setCreating(true)}
                className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-[13px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                <Plus className="size-4" /> {t("New project")}
              </button>
            )}
          </div>

          {!!elsewhere.data?.length && (
            <section className="mt-10" data-testid="projects-elsewhere">
              <h2 className="text-[13px] font-medium text-fg">{t("In your other workspaces")}</h2>
              <p className="mt-0.5 text-[12.5px] text-fg-subtle">{t("Projects you're in that another team runs, or that live in your other workspaces. Opening one switches to its workspace.")}</p>
              <div className="mt-3 divide-y divide-border rounded-xl border border-border">
                {elsewhere.data.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setWorkspaceId(p.workspaceId);
                      router.push(`/app/projects/${p.id}`);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    <ProjectIcon color={p.color} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{p.name}</span>
                    <span className="shrink-0 text-[12px] text-fg-subtle">{p.guest ? t("{workspace} · guest", { workspace: p.workspaceName }) : p.workspaceName}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
