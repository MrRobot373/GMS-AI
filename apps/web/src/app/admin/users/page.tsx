"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Eraser, KeyRound, Link2, MailWarning, MoreHorizontal, Search, ShieldCheck, ShieldOff, Smartphone, UserCheck, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Section, Table, Td } from "@/components/admin/table";
import { PageHeader } from "@/components/app/page-header";
import { useSession } from "@/components/app/session";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui/misc";
import { Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { del, get, patch, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTokens, timeAgo } from "@/lib/format";

import { useT } from "@/i18n";
interface UserRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  orgRole: "owner" | "admin" | "member";
  status: "active" | "deactivated";
  jobTitle: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  tokensThisPeriod: number;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  groups: { id: string; name: string }[];
  workspaces: { workspaceId: string; name: string; role: "admin" | "member" }[];
}
interface InviteRow {
  id: string;
  email: string;
  orgRole: string;
  expiresAt: string;
  createdAt: string;
}
interface WorkspaceLite {
  id: string;
  name: string;
  icon: string | null;
}

export default function UsersPage() {
  const t = useT();
  const { me } = useSession();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => get<UserRow[]>("/api/admin/users") });
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: () => get<InviteRow[]>("/api/admin/invites") });
  const [q, setQ] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [twoStepFor, setTwoStepFor] = useState<UserRow | null>(null);
  const [eraseFor, setEraseFor] = useState<UserRow | null>(null);

  const filtered = useMemo(
    () => (users.data ?? []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())),
    [users.data, q],
  );

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; orgRole?: string; status?: string }) => patch(`/api/admin/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(t("User updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => del(`/api/admin/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-invites"] }),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("Users")}
        description={t("Everyone in your organization. Only org admins can invite new people.")}
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" /> {t("Invite people")}
          </Button>
        }
      />

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by name or email")} className="pl-9" />
      </div>

      {users.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <Table head={[t("Name"), t("Role"), t("Workspaces"), t("Tokens this period"), t("Last active"), ""]}>
          {filtered.map((u) => (
            <tr key={u.id} className={cn("transition-colors hover:bg-surface-2/50", u.status === "deactivated" && "opacity-55")}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} image={u.image} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {u.name} {u.id === me.user.id && <span className="text-xs font-normal text-fg-subtle">{t("(you)")}</span>}
                    </div>
                    <div className="truncate text-xs text-fg-subtle">{u.email}</div>
                  </div>
                </div>
              </Td>
              <Td>
                {u.status === "deactivated" ? (
                  <Badge tone="danger">{t("Deactivated")}</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Badge tone={u.orgRole === "member" ? "neutral" : "accent"}>{u.orgRole === "owner" ? t("Owner") : u.orgRole === "admin" ? t("Admin") : t("Member")}</Badge>
                    {u.twoFactorEnabled && (
                      <span title={t("Two-step sign-in is on")} className="inline-flex text-fg-subtle" data-testid="two-factor-badge">
                        <Smartphone className="size-3.5" />
                      </span>
                    )}
                    {!u.emailVerified && (
                      <span title={t("Email address not confirmed yet")} className="inline-flex text-warning" data-testid="email-unconfirmed">
                        <MailWarning className="size-3.5" />
                      </span>
                    )}
                  </span>
                )}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {u.workspaces.map((w) => (
                    <span key={w.workspaceId} className="rounded-md border border-border px-1.5 py-0.5 text-[11.5px] text-fg-muted">
                      {w.name}
                      {w.role === "admin" && <ShieldCheck className="ml-1 inline size-3 text-accent" />}
                    </span>
                  ))}
                  {u.workspaces.length === 0 && <span className="text-xs text-fg-subtle">{t("None")}</span>}
                  {u.groups?.map((g) => (
                    <span key={g.id} title={t("Group")} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-fg-muted" data-testid="user-group">
                      <UsersRound className="size-3" />
                      {g.name}
                    </span>
                  ))}
                </div>
              </Td>
              <Td className="tabular-nums text-fg-muted">{formatTokens(u.tokensThisPeriod)}</Td>
              <Td className="text-fg-muted">{u.lastActiveAt ? timeAgo(u.lastActiveAt, t) : t("Never")}</Td>
              <Td className="w-10 text-right">
                {u.orgRole !== "owner" && u.id !== me.user.id && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t("Actions for {name}", { name: u.name })}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent align="end">
                      {u.orgRole === "member" ? (
                        <MenuItem icon={<ShieldCheck />} onSelect={() => update.mutate({ id: u.id, orgRole: "admin" })}>{t("Make org admin")}</MenuItem>
                      ) : (
                        <MenuItem icon={<ShieldCheck />} onSelect={() => update.mutate({ id: u.id, orgRole: "member" })}>{t("Remove admin role")}</MenuItem>
                      )}
                      <MenuSeparator />
                      {u.status === "active" && (
                        <MenuItem icon={<KeyRound />} onSelect={() => setResetFor(u)}>{t("Send password reset link")}</MenuItem>
                      )}
                      {u.twoFactorEnabled && (
                        <MenuItem icon={<ShieldOff />} onSelect={() => setTwoStepFor(u)}>{t("Turn off two-step sign-in")}</MenuItem>
                      )}
                      <MenuSeparator />
                      <MenuItem icon={<Download />} onSelect={() => window.location.assign(`/api/admin/users/${u.id}/export`)}>{t("Download their data")}</MenuItem>
                      {u.status === "active" ? (
                        <MenuItem icon={<UserMinus />} danger onSelect={() => update.mutate({ id: u.id, status: "deactivated" })}>{t("Deactivate")}</MenuItem>
                      ) : (
                        <MenuItem icon={<UserCheck />} onSelect={() => update.mutate({ id: u.id, status: "active" })}>{t("Reactivate")}</MenuItem>
                      )}
                      <MenuItem icon={<Eraser />} danger onSelect={() => setEraseFor(u)}>{t("Erase person and data…")}</MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Section title={t("Pending invitations")} description={t("Links expire after 7 days.")}>
        {invites.data?.length ? (
          <Card className="divide-y divide-border">
            {invites.data.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Link2 className="size-4 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.email}</div>
                  <div className="text-xs text-fg-subtle">
                    {t("{role} · sent {sent} · expires {expires}", { role: i.orgRole === "admin" ? t("Admin") : t("Member"), sent: timeAgo(i.createdAt, t), expires: t.date(i.expiresAt) })}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)}>
                  <X className="size-3.5" /> {t("Revoke")}
                </Button>
              </div>
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState art="empty-inbox" title={t("No pending invitations")} description={t("Invite teammates and they'll appear here until they accept.")} className="py-8" />
          </Card>
        )}
      </Section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {resetFor && <ResetLinkDialog person={resetFor} onClose={() => setResetFor(null)} />}
      {eraseFor && <EraseDialog person={eraseFor} others={(users.data ?? []).filter((x) => x.id !== eraseFor.id && x.status === "active")} onClose={() => setEraseFor(null)} />}
      <Dialog
        open={!!twoStepFor}
        onOpenChange={(o) => !o && setTwoStepFor(null)}
        title={t("Turn off two-step sign-in for {name}?", { name: twoStepFor?.name ?? "" })}
        description={t("Do this only if they lost their phone and backup codes. Their password alone will sign them in until they set it up again.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTwoStepFor(null)}>{t("Cancel")}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await post(`/api/admin/users/${twoStepFor!.id}/two-factor/disable`);
                  toast.success(t("Two-step sign-in is off for {name}", { name: twoStepFor!.name }));
                  qc.invalidateQueries({ queryKey: ["admin-users"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
                setTwoStepFor(null);
              }}
            >
              {t("Turn off")}
            </Button>
          </>
        }
      />
    </div>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const workspaces = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => get<WorkspaceLite[]>("/api/admin/workspaces"), enabled: open });
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState<"member" | "admin">("member");
  const [selected, setSelected] = useState<Record<string, "member" | "admin" | undefined>>({});
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  // Several people at once: one invitation per address, same role and workspaces.
  const [bulk, setBulk] = useState(false);
  const [emails, setEmails] = useState("");
  const [results, setResults] = useState<{ email: string; link?: string; emailed?: boolean; error?: string }[] | null>(null);
  const list = useMemo(() => [...new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))], [emails]);

  const reset = () => {
    setEmail("");
    setOrgRole("member");
    setSelected({});
    setLink(null);
    setEmailed(false);
    setBulk(false);
    setEmails("");
    setResults(null);
  };

  const body = (to: string) => ({
    email: to,
    orgRole,
    workspaces: Object.entries(selected)
      .filter(([, r]) => r)
      .map(([workspaceId, role]) => ({ workspaceId, role })),
  });
  const m = useMutation({
    mutationFn: () => post<{ link: string; emailed: boolean }>("/api/admin/invites", body(email)),
    onSuccess: (r) => {
      setLink(r.link);
      setEmailed(r.emailed);
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const many = useMutation({
    mutationFn: async () => {
      const out: NonNullable<typeof results> = [];
      for (const to of list) {
        try {
          out.push({ email: to, ...(await post<{ link: string; emailed: boolean }>("/api/admin/invites", body(to))) });
        } catch (e) {
          out.push({ email: to, error: (e as Error).message });
        }
      }
      return out;
    },
    onSuccess: (r) => {
      setResults(r);
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
    },
  });
  const made = results?.filter((r) => r.link) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
      title={results ? t.n(made.length, "{n} invitation created", "{n} invitations created") : link ? t("Invitation created") : bulk ? t("Invite several people") : t("Invite someone")}
      description={
        results
          ? made.some((r) => r.emailed)
            ? t.n(made.filter((r) => r.emailed).length, "{n} was emailed. Each link works once and expires in 7 days.", "{n} were emailed. Each link works once and expires in 7 days.")
            : t("Each link works once and expires in 7 days.")
          : link
          ? emailed
            ? t("We emailed the invitation to {email}. You can also share this link. It works once and expires in 7 days.", { email: email })
            : t("Share this link with them. It works once and expires in 7 days.")
          : t("They'll set their own password when they accept.")
      }
      footer={
        results ? (
          <>
            {made.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(made.map((r) => `${r.email}\t${r.link}`).join("\n"));
                  toast.success(t("Copied every address and its link"));
                }}
              >
                <Copy className="size-4" /> {t("Copy all links")}
              </Button>
            )}
            <Button variant="primary" onClick={() => onOpenChange(false)}>{t("Done")}</Button>
          </>
        ) : bulk ? (
          <>
            <Button variant="ghost" onClick={() => setBulk(false)}>{t("One person")}</Button>
            <Button variant="primary" loading={many.isPending} disabled={!list.length || list.length > 100} onClick={() => many.mutate()} data-testid="invite-many">
              {list.length ? t.n(list.length, "Create {n} invitation", "Create {n} invitations") : t("Create invitations")}
            </Button>
          </>
        ) : link ? (
          <>
            <Button variant="ghost" onClick={reset}>{t("Invite another")}</Button>
            <Button variant="primary" onClick={() => onOpenChange(false)}>{t("Done")}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button variant="primary" loading={m.isPending} disabled={!email} onClick={() => m.mutate()}>{t("Create invitation")}</Button>
          </>
        )
      }
    >
      {results ? (
        <div className="max-h-80 space-y-1.5 overflow-y-auto" data-testid="invite-results">
          {results.map((r) => (
            <div key={r.email} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-44 shrink-0 truncate text-fg">{r.email}</span>
              {r.link ? <div className="min-w-0 flex-1"><CopyLink link={r.link} /></div> : <span className="min-w-0 flex-1 text-danger">{r.error}</span>}
            </div>
          ))}
        </div>
      ) : link ? (
        <CopyLink link={link} />
      ) : (
        <div className="space-y-4">
          {bulk ? (
            <Field label={t("Emails")} hint={list.length ? t.n(list.length, "One per line, or separated by commas (up to 100). {n} address.", "One per line, or separated by commas (up to 100). {n} addresses.") : t("One per line, or separated by commas (up to 100).")}>
              <Textarea autoFocus rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="maya@company.com\nravi@company.com" className="font-mono text-[12.5px]" data-testid="invite-emails" />
            </Field>
          ) : (
            <Field label={t("Email")}>
              <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              <button type="button" onClick={() => setBulk(true)} className="mt-1.5 text-[12px] text-fg-subtle hover:text-fg" data-testid="invite-several">
                {t("Invite several people at once")}
              </button>
            </Field>
          )}
          <Field label={t("Organization role")}>
            <Select value={orgRole} onChange={(e) => setOrgRole(e.target.value as "member" | "admin")}>
              <option value="member">{t("Member: uses the workspaces they're added to")}</option>
              <option value="admin">{t("Admin: manages the whole organization")}</option>
            </Select>
          </Field>
          <Field label={t("Workspaces")}>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {workspaces.data?.map((w) => (
                <div key={w.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={!!selected[w.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [w.id]: e.target.checked ? "member" : undefined }))}
                    id={`ws-${w.id}`}
                  />
                  <label htmlFor={`ws-${w.id}`} className="flex-1 text-sm">{w.name}</label>
                  {selected[w.id] && (
                    <select
                      value={selected[w.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [w.id]: e.target.value as "member" | "admin" }))}
                      className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs"
                    >
                      <option value="member">{t("Member")}</option>
                      <option value="admin">{t("Workspace admin")}</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function CopyLink({ link }: { link: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle p-2 pl-3" data-testid="copy-link">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{link}</code>
      <Button
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />} {copied ? t("Copied") : t("Copy")}
      </Button>
    </div>
  );
}

/** A one-time link to choose a new password: emailed to the person when email is set up, otherwise shown here. */
function ResetLinkDialog({ person, onClose }: { person: UserRow; onClose: () => void }) {
  const t = useT();
  const send = useMutation({
    mutationFn: () => post<{ emailed: boolean; link?: string; email?: string; expiresInMinutes: number }>(`/api/admin/users/${person.id}/reset-link`),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = send.data;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={r ? (r.emailed ? t("Reset link sent") : t("Reset link created")) : t("Reset {name}'s password?", { name: person.name })}
      description={
        r
          ? r.emailed
            ? t("We emailed {email} a link to choose a new password. It works once and expires in {expiresInMinutes} minutes.", { email: r.email, expiresInMinutes: r.expiresInMinutes })
            : t("Email isn't set up, so share this link with {name} yourself. It works once and expires in {expiresInMinutes} minutes.", { name: person.name, expiresInMinutes: r.expiresInMinutes })
          : t("They'll get a one-time link to choose a new password, and be signed out on their devices once they do. Their password works until then.")
      }
      footer={
        r ? (
          <Button variant="primary" onClick={onClose}>{t("Done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
            <Button variant="primary" loading={send.isPending} onClick={() => send.mutate()} data-testid="send-reset-link">
              {t("Create link")}
            </Button>
          </>
        )
      }
    >
      {r?.link && <CopyLink link={r.link} />}
    </Dialog>
  );
}

/** Erase a person and their data for good (privacy law requests, someone leaving for good). */
function EraseDialog({ person, others, onClose }: { person: UserRow; others: UserRow[]; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [heir, setHeir] = useState("");
  const erase = useMutation({
    mutationFn: () =>
      post<{ chats: number; documentsDeleted: number; documentsTransferred: number; projectsDeleted: number; projectsTransferred: number; tasks: number }>(
        `/api/admin/users/${person.id}/erase`,
        { confirmEmail: confirm, transferTo: heir || null },
      ),
    onSuccess: (r) => {
      const moved = r.projectsTransferred + r.documentsTransferred;
      toast.success(
        moved
          ? t.n(moved, "{name} was erased; {n} shared item moved to {heir}", "{name} was erased; {n} shared items moved to {heir}", { name: person.name, heir: others.find((o) => o.id === heir)?.name ?? "" })
          : t("{name} was erased", { name: person.name }),
      );
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("Erase {name}?", { name: person.name })}
      description={t("Their account and everything they made are deleted for good: chats, private documents, Work AI tasks and their files, code workspaces, schedules, personal skills and connected apps. This can't be undone. Download their data first if they asked for a copy.")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="danger" disabled={confirm.trim().toLowerCase() !== person.email.toLowerCase() || erase.isPending} onClick={() => erase.mutate()} data-testid="erase-confirm">
            <Eraser /> {t("Erase for good")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={t("Give their shared projects and documents to")}
          hint={t("Projects, documents shared with a workspace and organization skills move to this person. Nobody: shared projects and documents are deleted too (organization skills go to you).")}
        >
          <Select value={heir} onChange={(e) => setHeir(e.target.value)} data-testid="erase-heir">
            <option value="">{t("Nobody (delete them)")}</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
            ))}
          </Select>
        </Field>
        <Field label={t("Type {email} to confirm", { email: person.email })}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={person.email} autoComplete="off" data-testid="erase-email" />
        </Field>
        <p className="text-[12.5px] leading-relaxed text-fg-subtle">
          {t("Usage stays in the totals without their name, and the activity log keeps what happened under a pseudonym. Backups made before today still contain them until they expire.")}
        </p>
      </div>
    </Dialog>
  );
}
