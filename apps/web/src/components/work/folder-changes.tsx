"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n";

interface Changes {
  snapshot: { status: "ok" | "skipped"; note: string | null } | null;
  changes: { path: string; status: "added" | "modified" | "deleted" }[];
  total: number;
  canUndo: boolean;
}

/** What a task changed in the folder it works in, with undo (all of it, or one file). */
export function FolderChanges({ taskId, status }: { taskId: string; status: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<string[] | "all" | null>(null);
  const q = useQuery({
    queryKey: ["work-changes", taskId, status],
    queryFn: () => get<Changes>(`/api/work/tasks/${taskId}/changes`),
    refetchInterval: status === "running" ? 10_000 : false,
  });
  const undo = useMutation({
    mutationFn: (paths?: string[]) => post<{ restored: number; removed: number }>(`/api/work/tasks/${taskId}/undo`, paths ? { paths } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-changes", taskId] });
      qc.invalidateQueries({ queryKey: ["work-files", taskId] });
      setConfirm(null);
      toast(t("Done. The folder is back as it was."));
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const d = q.data;
  if (!d) return null;
  if (d.snapshot?.status === "skipped") return <p className="mt-3 text-[12px] text-fg-subtle" data-testid="changes-skipped">{d.snapshot.note}</p>;
  if (!d.snapshot || d.changes.length === 0) return null;
  const label = { added: t("added"), modified: t("changed"), deleted: t("deleted") };
  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="folder-changes">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg">{t.n(d.total, "{n} change in the folder", "{n} changes in the folder")}</span>
        {d.canUndo && (
          <Button variant="ghost" size="sm" onClick={() => setConfirm("all")} data-testid="undo-all">
            <Undo2 className="size-3.5" /> {t("Undo all")}
          </Button>
        )}
      </div>
      <ul className="mt-1 space-y-px">
        {d.changes.map((c) => (
          <li key={c.path} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
            <span className={cn("w-14 shrink-0 text-[11px]", c.status === "deleted" ? "text-danger" : c.status === "added" ? "text-success" : "text-fg-subtle")}>{label[c.status]}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg" title={c.path}>{c.path}</span>
            {d.canUndo && (
              <button type="button" onClick={() => setConfirm([c.path])} aria-label={t("Undo {path}", { path: c.path })} className="rounded p-0.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus:opacity-100">
                <Undo2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {d.total > d.changes.length && <p className="mt-1 text-[12px] text-fg-subtle">{t("Showing the first {n} changes.", { n: d.changes.length })}</p>}
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "all" ? t("Undo all the changes?") : t("Undo this change?")}
        description={t("Files the task added are removed, files it changed or deleted are put back as they were before it started.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>{t("Cancel")}</Button>
            <Button variant="danger" loading={undo.isPending} onClick={() => undo.mutate(confirm === "all" || !confirm ? undefined : confirm)} data-testid="undo-confirm">{t("Undo")}</Button>
          </>
        }
      />
    </div>
  );
}
