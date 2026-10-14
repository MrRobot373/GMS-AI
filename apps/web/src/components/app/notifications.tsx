"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { NotificationRow } from "@/lib/types";
import { useSession } from "./session";
import { useT } from "@/i18n";

export function NotificationsButton() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: () => get<NotificationRow[]>("/api/notifications"),
    refetchInterval: 30_000,
  });
  const unread = list.data ? list.data.filter((n) => !n.readAt).length : me.unreadNotifications;
  const markRead = useMutation({
    mutationFn: () => post("/api/notifications/read"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  return (
    <Popover.Root onOpenChange={(o) => !o && unread > 0 && markRead.mutate()}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={unread ? t("Notifications ({n} unread)", { n: unread }) : t("Notifications")} className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg-subtle)]" />
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 w-80 animate-rise rounded-xl border border-border bg-surface shadow-soft outline-none"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium">{t("Notifications")}</span>
            {unread > 0 && <span className="text-xs text-fg-subtle">{t("{unread} new", { unread: unread })}</span>}
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {list.data?.length ? (
              list.data.map((n) => (
                <button
                  key={n.id}
                  onClick={() => n.link && router.push(n.link)}
                  className="flex w-full gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-fg">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-fg-muted">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-fg-subtle">{timeAgo(n.createdAt, t)}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-fg-subtle">{t("You're all caught up.")}</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
