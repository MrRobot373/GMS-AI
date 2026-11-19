"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { get } from "@/lib/api";
import { useT } from "@/i18n";

interface Listing {
  path: string | null;
  parent: string | null;
  folders: { name: string; path: string }[];
}

/** A button that opens a dialog to browse the folders an admin allowed and pick one (instead of typing its path). */
export function FolderPickerButton({ workspaceId, start, onPick }: { workspaceId?: string; start?: string; onPick: (path: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["work-folders", workspaceId, at],
    queryFn: () => get<Listing>(`/api/work/folders?${new URLSearchParams({ ...(workspaceId ? { workspaceId } : {}), ...(at ? { path: at } : {}) })}`),
    enabled: open,
    retry: false,
  });
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setAt(start?.trim() || null); setOpen(true); }} data-testid="folder-browse">
        <FolderOpen className="size-3.5" /> {t("Browse")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("Choose a folder")}
        description={list.data?.path ?? t("The folders you may work in")}
        className="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
            <Button variant="primary" disabled={!list.data?.path} onClick={() => { onPick(list.data!.path!); setOpen(false); }} data-testid="folder-use">
              {t("Use this folder")}
            </Button>
          </>
        }
      >
        <div className="min-h-40" data-testid="folder-list">
          {list.isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : list.isError ? (
            <p className="text-[13px] text-danger">{(list.error as Error).message}</p>
          ) : (
            <ul className="space-y-px">
              {list.data?.path && (
                <li>
                  <button type="button" onClick={() => setAt(list.data!.parent)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg-subtle hover:bg-surface-2">
                    <ChevronLeft className="size-4" /> {t("Back")}
                  </button>
                </li>
              )}
              {list.data?.folders.map((f) => (
                <li key={f.path}>
                  <button type="button" onClick={() => setAt(f.path)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2" title={f.path}>
                    <Folder className="size-4 shrink-0 text-fg-subtle" /> <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
              {list.data?.folders.length === 0 && <li className="px-2 py-1.5 text-[13px] text-fg-subtle">{t("No folders inside this one.")}</li>}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
