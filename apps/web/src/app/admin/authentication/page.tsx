"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MoreHorizontal, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Section } from "@/components/admin/table";
import { PageHeader } from "@/components/app/page-header";
import { ProviderIcon, type SsoOption } from "@/components/sso-buttons";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Card, Switch } from "@/components/ui/misc";
import { Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/spinner";
import { del, get, patch, post, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { WorkspaceRow } from "@/lib/types";

type ProviderType = SsoOption["type"];
interface Connection {
  id: string;
  type: ProviderType;
  name: string;
  issuer: string;
  tenantId: string | null;
  clientId: string | null;
  /** SAML: the identity provider's sign-in URL and signing certificates. */
  samlSsoUrl: string | null;
  samlCerts: string[] | null;
  /** SAML: until when its certificates are valid. */
  certExpires?: string | null;
  domains: string[];
  autoJoin: boolean;
  defaultWorkspaceId: string | null;
  enabled: boolean;
}
interface AuthSettings {
  ssoRequired: boolean;
  twoFactorRequired: boolean;
  /** Required from this date; until then people without it are reminded. */
  twoFactorDeadline: string | null;
  /** Password users who haven't set up two-step sign-in yet. */
  withoutTwoStep: number;
  redirectUri: string;
  samlBase: string;
  connections: Connection[];
  features: { sso: boolean; oidc: boolean };
}

const TYPES: { type: ProviderType; title: string; desc: string; feature: "sso" | "oidc" }[] = [
  { type: "google", title: "Google Workspace", desc: "People sign in with their Google work account.", feature: "sso" },
  { type: "microsoft", title: "Microsoft Entra ID", desc: "Microsoft 365 / Azure AD accounts in your directory.", feature: "sso" },
  { type: "oidc", title: "Other (OpenID Connect)", desc: "Okta, Keycloak, Auth0, JumpCloud, OneLogin…", feature: "oidc" },
  { type: "saml", title: "Other (SAML 2.0)", desc: "Okta, Entra ID, Google Workspace, ADFS, JumpCloud…", feature: "oidc" },
];

const HELP: Record<ProviderType, string> = {
  google: "In Google Cloud Console → APIs & Services → Credentials, create an OAuth client ID of type “Web application” and add the redirect URI below.",
  microsoft: "In the Entra admin center → App registrations, register an app (single tenant), add a Web platform with the redirect URI below, then create a client secret.",
  oidc: "Create an OpenID Connect web application in your identity provider, allow the redirect URI below, and grant the openid, email and profile scopes.",
  saml: "Create a SAML app in your identity provider with the entity ID and reply URL below (or give it our metadata URL), and send the email address as the name ID or an “email” attribute. Then import its metadata here.",
};

/** A random UUID, also on plain http (crypto.randomUUID needs a secure page). */
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export default function AuthenticationPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-auth"], queryFn: () => get<AuthSettings>("/api/admin/auth") });
  const [editing, setEditing] = useState<{ type: ProviderType; conn?: Connection } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [requiring, setRequiring] = useState(false);
  const [graceDays, setGraceDays] = useState(7);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-auth"] });
    qc.invalidateQueries({ queryKey: ["public-sso"] });
  };
  const onError = (e: Error) => toast.error(e.message);

  const setRequired = useMutation({
    mutationFn: (ssoRequired: boolean) => put<AuthSettings>("/api/admin/auth", { ssoRequired }),
    onSuccess: (d) => {
      qc.setQueryData(["admin-auth"], d);
      qc.invalidateQueries({ queryKey: ["public-status"] });
      toast.success(d.ssoRequired ? "Single sign-on is now required" : "Passwords are allowed again");
    },
    onError,
  });
  const setTwoStep = useMutation({
    mutationFn: (v: { twoFactorRequired: boolean; twoFactorGraceDays?: number }) => put<AuthSettings>("/api/admin/auth", v),
    onSuccess: (d) => {
      qc.setQueryData(["admin-auth"], d);
      setRequiring(false);
      toast.success(
        !d.twoFactorRequired
          ? "Two-step sign-in is optional again"
          : d.twoFactorDeadline
            ? `Two-step sign-in is required from ${new Date(d.twoFactorDeadline).toLocaleDateString(undefined, { day: "numeric", month: "long" })}; people without it were told`
            : "Two-step sign-in is now required",
      );
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (c: Connection) => patch(`/api/admin/sso/${c.id}`, { enabled: !c.enabled }),
    onSuccess: refresh,
    onError,
  });
  const test = useMutation({
    mutationFn: (c: Connection) => post<{ ok: boolean; message: string }>(`/api/admin/sso/${c.id}/test`),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError,
  });
  const remove = useMutation({
    mutationFn: (c: Connection) => del(`/api/admin/sso/${c.id}`),
    onSuccess: () => {
      refresh();
      setRemoving(null);
      toast("Provider removed");
    },
    onError,
  });

  if (!q.data) return <Skeleton className="h-96 rounded-xl" />;
  const d = q.data;
  const available = (f: "sso" | "oidc") => d.features[f];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Authentication"
        description="How people sign in. Single sign-on uses your company accounts, so leaving the company also removes access."
        actions={
          d.connections.length > 0 && (
            <Button variant="primary" size="sm" onClick={() => setChoosing(true)}>
              <Plus className="size-3.5" /> Add provider
            </Button>
          )
        }
      />

      <Section title="Sign-in providers">
        {d.connections.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TYPES.map((t) => (
              <TypeCard key={t.type} t={t} available={available(t.feature)} onPick={() => setEditing({ type: t.type })} />
            ))}
          </div>
        ) : (
          <Card className="divide-y divide-border">
            {d.connections.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5" data-testid="sso-connection">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg">
                  <ProviderIcon type={c.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] text-fg">
                    {c.name}
                    {c.autoJoin && <Badge>Auto-join</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-fg-subtle">
                    {c.domains.length ? c.domains.map((x) => `@${x}`).join(", ") : "Any email the provider verifies"} · {c.issuer}
                  </div>
                  {c.type === "saml" && c.certExpires && (
                    <CertExpiry iso={c.certExpires} />
                  )}
                </div>
                <Button variant="ghost" size="sm" loading={test.isPending && test.variables?.id === c.id} onClick={() => test.mutate(c)}>
                  <Plug className="size-3.5" /> Test
                </Button>
                <Switch checked={c.enabled} onCheckedChange={() => toggle.mutate(c)} label={`Enable ${c.name}`} />
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Options for ${c.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem icon={<Pencil />} onSelect={() => setEditing({ type: c.type, conn: c })}>Edit</MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(c)}>Remove</MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Policy">
        <Card className="flex items-start gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-fg">Require single sign-on</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
              Everyone signs in through a provider above. Passwords stop working, except for the organization owner, so you can always get back in if a provider is down.
            </p>
          </div>
          <Switch
            checked={d.ssoRequired}
            disabled={!d.connections.some((c) => c.enabled)}
            onCheckedChange={(v) => setRequired.mutate(v)}
            label="Require single sign-on"
          />
        </Card>
        <Card className="mt-3 flex items-start gap-4 p-5" data-testid="two-step-policy">
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-fg">Require two-step sign-in</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
              Everyone who signs in with a password must set up an authenticator app before they can use the app, and can&apos;t turn it off. People who sign in with single sign-on aren&apos;t asked; their provider runs its own check.
            </p>
            {d.withoutTwoStep > 0 && (
              <p className="mt-2 text-[12.5px] text-fg-muted" data-testid="without-two-step">
                {d.withoutTwoStep === 1 ? "1 person signs in" : `${d.withoutTwoStep} people sign in`} with a password and hasn&apos;t set it up
                {!d.twoFactorRequired
                  ? "."
                  : d.twoFactorDeadline
                    ? ` yet; they're reminded until ${new Date(d.twoFactorDeadline).toLocaleDateString(undefined, { day: "numeric", month: "long" })}, then asked before they continue.`
                    : " yet; they'll be asked at their next visit."}
              </p>
            )}
          </div>
          <Switch
            checked={d.twoFactorRequired}
            onCheckedChange={(v) => (v ? setRequiring(true) : setTwoStep.mutate({ twoFactorRequired: false }))}
            label="Require two-step sign-in"
          />
        </Card>
      </Section>

      <Dialog
        open={requiring}
        onOpenChange={setRequiring}
        title="Require two-step sign-in"
        description={d.withoutTwoStep > 0 ? `${d.withoutTwoStep === 1 ? "1 person hasn't" : `${d.withoutTwoStep} people haven't`} set it up yet. They'll get a notification either way.` : "Everyone who signs in with a password already has it."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequiring(false)}>Cancel</Button>
            <Button onClick={() => setTwoStep.mutate({ twoFactorRequired: true, twoFactorGraceDays: graceDays })} disabled={setTwoStep.isPending} data-testid="two-step-require">
              Require it
            </Button>
          </>
        }
      >
        <Field label="From when">
          <Select value={String(graceDays)} onChange={(e) => setGraceDays(Number(e.target.value))} data-testid="two-step-grace">
            <option value="0">Right away (asked at their next visit)</option>
            <option value="3">In 3 days (reminders until then)</option>
            <option value="7">In a week (reminders until then)</option>
            <option value="14">In two weeks (reminders until then)</option>
          </Select>
        </Field>
      </Dialog>

      <Dialog open={choosing} onOpenChange={setChoosing} title="Add a sign-in provider" className="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((t) => (
            <TypeCard
              key={t.type}
              t={t}
              available={available(t.feature)}
              onPick={() => {
                setChoosing(false);
                setEditing({ type: t.type });
              }}
            />
          ))}
        </div>
      </Dialog>

      {editing && (
        <ProviderDialog
          key={editing.conn?.id ?? editing.type}
          type={editing.type}
          conn={editing.conn}
          redirectUri={d.redirectUri}
          samlBase={d.samlBase}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="People who signed in with it keep their accounts, but they'll need another way to sign in."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>Remove provider</Button>
          </>
        }
      />
    </div>
  );
}

function TypeCard({ t, available, onPick }: { t: (typeof TYPES)[number]; available: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={!available}
      onClick={onPick}
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={`add-${t.type}`}
    >
      <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg">
        <ProviderIcon type={t.type} />
      </span>
      <span>
        <span className="flex items-center gap-2 text-[13.5px] text-fg">
          {t.title}
          {!available && <Badge>{t.feature === "oidc" ? "Enterprise" : "Upgrade"}</Badge>}
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug text-fg-subtle">{t.desc}</span>
      </span>
    </button>
  );
}

/** A SAML certificate's end date; a warning in its last month. */
function CertExpiry({ iso }: { iso: string }) {
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return (
    <div className={cn("text-[12px]", days < 30 ? "text-warning" : "text-fg-subtle")} data-testid="cert-expiry">
      {days < 0 ? `Its certificate expired on ${dateOf(iso)}: sign-in stops working until you add the new one` : `Certificate valid until ${dateOf(iso)}`}
      {days >= 0 && days < 30 && ": add the provider's new certificate before then"}
    </div>
  );
}

/** A read-only value with a copy button. */
function CopyField({ label, hint, value, testId }: { label: string; hint?: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(t);
    }
  }, [copied]);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-[12px]" data-testid={testId} aria-label={label} />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </Field>
  );
}

function ProviderDialog({
  type,
  conn,
  redirectUri,
  samlBase,
  onClose,
  onSaved,
}: {
  type: ProviderType;
  conn?: Connection;
  redirectUri: string;
  samlBase: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const workspaces = useQuery({ queryKey: ["admin-workspaces"], queryFn: () => get<WorkspaceRow[]>("/api/admin/workspaces") });
  const custom = type === "oidc" || type === "saml";
  const [form, setForm] = useState({
    name: conn?.name ?? (custom ? "" : type === "google" ? "Google" : "Microsoft"),
    issuer: conn?.type === "oidc" || conn?.type === "saml" ? conn.issuer : "",
    tenantId: conn?.tenantId ?? "",
    clientId: conn?.clientId ?? "",
    clientSecret: "",
    samlSsoUrl: conn?.samlSsoUrl ?? "",
    samlCerts: conn?.samlCerts?.join("\n") ?? "",
    domains: conn?.domains.join(", ") ?? "",
    autoJoin: conn?.autoJoin ?? false,
    defaultWorkspaceId: conn?.defaultWorkspaceId ?? "",
  });
  // A new SAML provider's ID is chosen here, so its URLs can be entered at the provider before saving.
  const [samlId] = useState(() => conn?.id ?? uuid());
  const [metadata, setMetadata] = useState("");
  const [certExpires, setCertExpires] = useState(conn?.certExpires ?? null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const importMetadata = useMutation({
    mutationFn: () => {
      const v = metadata.trim();
      return post<{ entityId: string; ssoUrl: string; certs: string; certExpires: string | null }>("/api/admin/sso/saml-metadata", v.startsWith("<") ? { xml: v } : { url: v });
    },
    onSuccess: (m) => {
      setForm((f) => ({ ...f, issuer: m.entityId, samlSsoUrl: m.ssoUrl, samlCerts: m.certs }));
      setCertExpires(m.certExpires);
      setMetadata("");
      toast.success("Read the provider's metadata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => {
      const certsChanged = form.samlCerts.trim() !== (conn?.samlCerts?.join("\n") ?? "").trim();
      const body = {
        name: form.name.trim() || undefined,
        domains: form.domains.split(/[\s,]+/).filter(Boolean),
        autoJoin: form.autoJoin,
        defaultWorkspaceId: form.defaultWorkspaceId || null,
        ...(type === "saml"
          ? { issuer: form.issuer.trim(), samlSsoUrl: form.samlSsoUrl.trim(), ...(certsChanged ? { samlCerts: form.samlCerts } : {}) }
          : { clientId: form.clientId.trim(), clientSecret: form.clientSecret.trim() || undefined }),
        ...(type === "oidc" ? { issuer: form.issuer.trim() } : {}),
        ...(type === "microsoft" ? { tenantId: form.tenantId.trim() } : {}),
      };
      return conn ? patch(`/api/admin/sso/${conn.id}`, body) : post("/api/admin/sso", { ...body, type, ...(type === "saml" ? { id: samlId } : {}) });
    },
    onSuccess: () => {
      onSaved();
      onClose();
      toast.success(conn ? "Provider updated" : "Provider added. Use “Test”, then try signing in from a private window.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid =
    type === "saml"
      ? form.issuer.trim() && form.samlSsoUrl.trim() && form.samlCerts.trim()
      : form.clientId.trim() && (conn || form.clientSecret.trim()) && (type !== "oidc" || form.issuer.trim()) && (type !== "microsoft" || form.tenantId.trim());

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <ProviderIcon type={type} /> {conn ? `Edit ${conn.name}` : TYPES.find((t) => t.type === type)!.title}
        </span>
      }
      description={HELP[type]}
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            {conn ? "Save" : "Add provider"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {type === "saml" ? (
          <>
            <CopyField label="Entity ID (audience)" value={`${samlBase}/${samlId}/metadata`} hint="Our metadata is at this address too: most providers can import it." testId="saml-entity-id" />
            <CopyField label="Reply URL (ACS)" value={`${samlBase}/${samlId}/acs`} hint="Where the provider sends people back (HTTP-POST)." testId="saml-acs" />
          </>
        ) : (
          <CopyField label="Redirect URI" value={redirectUri} hint="Register this exact address with the provider." testId="redirect-uri" />
        )}
        <Field label="Button label" hint="Shown as “Continue with …” on the sign-in page.">
          <Input value={form.name} onChange={set("name")} placeholder={custom ? "Okta" : undefined} />
        </Field>
        {type === "saml" && (
          <>
            <Field label="Import the provider's metadata" hint="Its metadata URL, or the XML pasted here. Fills in the three fields below.">
              <div className="flex gap-2">
                <Input value={metadata} onChange={(e) => setMetadata(e.target.value)} placeholder="https://login.microsoftonline.com/…/federationmetadata.xml" data-testid="saml-metadata" />
                <Button variant="outline" disabled={!metadata.trim()} loading={importMetadata.isPending} onClick={() => importMetadata.mutate()}>
                  Import
                </Button>
              </div>
            </Field>
            <Field label="Provider's entity ID (Issuer)">
              <Input value={form.issuer} onChange={set("issuer")} placeholder="http://www.okta.com/exk…" data-testid="saml-issuer" />
            </Field>
            <Field label="Provider's sign-in URL (SSO URL)">
              <Input value={form.samlSsoUrl} onChange={set("samlSsoUrl")} placeholder="https://acme.okta.com/app/…/sso/saml" data-testid="saml-sso-url" />
            </Field>
            <Field
              label="Provider's signing certificate"
              hint={certExpires ? `Valid until ${dateOf(certExpires)}. During a certificate change, paste both.` : "PEM or Base64. During a certificate change, paste both."}
            >
              <Textarea value={form.samlCerts} onChange={set("samlCerts")} placeholder="-----BEGIN CERTIFICATE-----" className="h-28 font-mono text-[11px]" data-testid="saml-certs" />
            </Field>
          </>
        )}
        {type === "oidc" && (
          <Field label="Issuer URL">
            <Input value={form.issuer} onChange={set("issuer")} placeholder="https://acme.okta.com" />
          </Field>
        )}
        {type === "microsoft" && (
          <Field label="Directory (tenant) ID">
            <Input value={form.tenantId} onChange={set("tenantId")} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
        )}
        {type !== "saml" && (
          <>
            <Field label={type === "microsoft" ? "Application (client) ID" : "Client ID"}>
              <Input value={form.clientId} onChange={set("clientId")} />
            </Field>
            <Field label="Client secret" hint={conn ? "Leave empty to keep the current secret. Stored encrypted." : "Stored encrypted on this server."}>
              <Input type="password" value={form.clientSecret} onChange={set("clientSecret")} placeholder={conn ? "••••••••" : ""} autoComplete="off" />
            </Field>
          </>
        )}
        <Field label="Allowed email domains" hint="Comma separated, e.g. acme.com, acme.in. Leave empty to accept any address the provider verifies.">
          <Input value={form.domains} onChange={set("domains")} placeholder="acme.com" />
        </Field>
        <div className={cn("rounded-lg border border-border p-3", !form.domains.trim() && "opacity-60")}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-fg">Let people join automatically</div>
              <p className="mt-0.5 text-[12px] text-fg-subtle">
                Anyone with an allowed domain gets an account on first sign-in (uses a seat). Otherwise only invited people can sign in.
              </p>
            </div>
            <Switch checked={form.autoJoin} disabled={!form.domains.trim()} onCheckedChange={(v) => setForm((f) => ({ ...f, autoJoin: v }))} label="Auto-join" />
          </div>
          {form.autoJoin && (
            <div className="mt-3">
              <Field label="They join workspace">
                <Select value={form.defaultWorkspaceId} onChange={set("defaultWorkspaceId")}>
                  <option value="">The first workspace</option>
                  {workspaces.data?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
