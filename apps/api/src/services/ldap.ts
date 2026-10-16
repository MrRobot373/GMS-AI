/**
 * LDAP / Active Directory sync: on a schedule (and on demand), Aatmiq reads the directory's people
 * and, optionally, its groups, and brings its accounts in line: new people get an account (a seat)
 * in the chosen workspace, renamed people are renamed, disabled or removed people are deactivated,
 * and people who come back are reactivated. Groups become Aatmiq groups with the same members, so
 * admins give them models and budgets in Admin → Groups. People sign in with single sign-on.
 *
 * Read-only: Aatmiq never writes to the directory. A sync that would deactivate more than half of
 * the people it manages stops before deactivating anyone (a wrong filter shouldn't lock everyone
 * out); an admin can run it once anyway.
 */
import { and, eq, sql, user, userGroup, type DB, type LdapSettingsStored } from "@aatmiq/db";
import { Client, type Entry } from "ldapts";
import { audit, getOrg, type AppContext } from "../context";
import type { SecretBox } from "../crypto";
import { fill, msg } from "../i18n";
import { createPerson, freeGroupName, isEmail, normalizeEmail, setGroupMembers, updatePerson } from "./directory";
import { readStatus, writeStatus } from "./health";

export class LdapError extends Error {}

/** Starting points for the two common directories; admins can change every field. */
export const LDAP_PRESETS = {
  ad: {
    userFilter: "(&(objectCategory=person)(objectClass=user)(mail=*))",
    emailAttr: "mail",
    nameAttr: "displayName",
    idAttr: "objectGUID",
    groupFilter: "(objectClass=group)",
    groupNameAttr: "cn",
    memberAttr: "member",
  },
  openldap: {
    userFilter: "(&(objectClass=inetOrgPerson)(mail=*))",
    emailAttr: "mail",
    nameAttr: "cn",
    idAttr: "entryUUID",
    groupFilter: "(objectClass=groupOfNames)",
    groupNameAttr: "cn",
    memberAttr: "member",
  },
} as const;

/** Active Directory's "account disabled" flag in userAccountControl. */
const AD_DISABLED = 0x2;
const BINARY_IDS = ["objectGUID", "objectSid"];

export interface LdapPerson {
  dn: string;
  externalId: string;
  email: string;
  name: string;
  disabled: boolean;
}

export interface SyncResult {
  at: string;
  ok: boolean;
  people: number;
  created: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  groups: number;
  skipped: string[];
  /** Deactivations held back by the safety check. */
  heldBack: number;
  error: string | null;
}

/** Attribute values, whatever case the server names them in. */
function values(entry: Entry, attr: string): (string | Buffer)[] {
  const key = Object.keys(entry).find((k) => k.toLowerCase() === attr.toLowerCase());
  if (!key) return [];
  const v = entry[key] as string | string[] | Buffer | Buffer[];
  return Array.isArray(v) ? v : [v];
}
const first = (entry: Entry, attr: string) => {
  const v = values(entry, attr)[0];
  return v === undefined ? "" : Buffer.isBuffer(v) ? v.toString("hex") : String(v).trim();
};
/** DNs compare without case and without spaces around the separators. */
export const normalizeDn = (dn: string) => dn.replace(/\s*([,=+])\s*/g, "$1").toLowerCase();

export function personFromEntry(entry: Entry, s: Pick<LdapSettingsStored, "emailAttr" | "nameAttr" | "idAttr">): LdapPerson | null {
  const email = normalizeEmail(first(entry, s.emailAttr));
  if (!isEmail(email)) return null;
  const uac = Number(first(entry, "userAccountControl") || 0);
  return {
    dn: entry.dn,
    externalId: first(entry, s.idAttr) || normalizeDn(entry.dn),
    email,
    name: first(entry, s.nameAttr) || email.split("@")[0]!,
    disabled: (uac & AD_DISABLED) !== 0,
  };
}

/** Connected and signed in as the service account; the caller unbinds. */
async function connect(s: LdapSettingsStored, password: string | null) {
  let url: URL;
  try {
    url = new URL(s.url);
  } catch {
    throw new LdapError("Enter the directory's address, e.g. ldaps://dc.acme.local.");
  }
  if (url.protocol !== "ldap:" && url.protocol !== "ldaps:") throw new LdapError("The address must start with ldap:// or ldaps://.");
  const tls = s.caCert ? { ca: [s.caCert] } : {};
  const client = new Client({ url: s.url, timeout: 30_000, connectTimeout: 10_000, tlsOptions: tls });
  try {
    if (s.startTls && url.protocol === "ldap:") await client.startTLS(tls);
    await client.bind(s.bindDn, password ?? "");
  } catch (e) {
    await client.unbind().catch(() => undefined);
    const m = (e as Error).message ?? "";
    if (/invalid credentials|49\b/i.test(m)) throw new LdapError("The directory refused the service account: check its DN and password.");
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|timeout/i.test(m)) throw new LdapError(fill(msg("Couldn't reach the directory at {host}: check the address and that this server can reach it."), { host: url.host }));
    if (/certificate|self.signed|CERT_/i.test(m)) throw new LdapError("The directory's certificate isn't trusted: paste its CA certificate.");
    throw new LdapError(fill(msg("The directory answered: {message}"), { message: m.slice(0, 300) }));
  }
  return client;
}

async function search(client: Client, base: string, filter: string, attributes: string[]) {
  try {
    const { searchEntries } = await client.search(base, { scope: "sub", filter, attributes, paged: { pageSize: 500 }, explicitBufferAttributes: BINARY_IDS });
    return searchEntries;
  } catch (e) {
    const m = (e as Error).message ?? "";
    if (/no such object|32\b/i.test(m)) throw new LdapError(fill(msg("The directory has no {base}: check the base DN."), { base }));
    if (/filter/i.test(m)) throw new LdapError(fill(msg("The directory didn't accept the filter: {message}"), { message: m.slice(0, 200) }));
    throw new LdapError(fill(msg("The directory search failed: {message}"), { message: m.slice(0, 300) }));
  }
}

/** Reads the directory's people (for a test, or a sync). */
export async function readPeople(s: LdapSettingsStored, password: string | null) {
  const client = await connect(s, password);
  try {
    const entries = await search(client, s.userBase, s.userFilter, [s.emailAttr, s.nameAttr, s.idAttr, "userAccountControl"]);
    const people = entries.map((e) => personFromEntry(e, s)).filter((p): p is LdapPerson => !!p);
    const groups = s.groupBase ? await search(client, s.groupBase, s.groupFilter, [s.groupNameAttr, s.memberAttr, s.idAttr]) : [];
    return { people, withoutEmail: entries.length - people.length, groups };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export function ldapPassword(s: LdapSettingsStored, box: SecretBox) {
  return s.bindPasswordEnc ? box.decrypt(s.bindPasswordEnc) : null;
}

/** One sync. `allowMass`: deactivate even when more than half would go (an admin asked). */
export async function syncLdap(ctx: AppContext, s: LdapSettingsStored, opts: { allowMass?: boolean } = {}): Promise<SyncResult> {
  const { db } = ctx;
  const result: SyncResult = { at: new Date().toISOString(), ok: false, people: 0, created: 0, updated: 0, deactivated: 0, reactivated: 0, groups: 0, skipped: [], heldBack: 0, error: null };
  try {
    const { people, groups } = await readPeople(s, ldapPassword(s, ctx.box));
    if (!people.length) throw new LdapError("The search found nobody with an email address. Check the base DN and the filter: nothing was changed.");
    result.people = people.length;

    const managed = await db.select().from(user).where(eq(user.directory, "ldap"));
    const byId = new Map(managed.map((u) => [u.externalId ?? "", u]));
    const seen = new Set<string>();
    const byDn = new Map<string, string>();
    for (const p of people) {
      let row = byId.get(p.externalId);
      if (!row) [row] = await db.select().from(user).where(eq(sql`lower(${user.email})`, p.email));
      if (row && row.directory === "scim") {
        result.skipped.push(fill(msg("{email}: kept up to date by SCIM provisioning"), { email: p.email }));
        continue;
      }
      try {
        if (!row) {
          if (p.disabled) continue;
          const id = await createPerson(ctx, "ldap", { email: p.email, name: p.name, externalId: p.externalId, active: true }, s.workspaceId);
          result.created++;
          seen.add(id);
          byDn.set(normalizeDn(p.dn), id);
          continue;
        }
        seen.add(row.id);
        byDn.set(normalizeDn(p.dn), row.id);
        const r = await updatePerson(ctx, "ldap", row, { email: p.email, name: p.name, externalId: p.externalId, active: !p.disabled });
        if (r.deactivated) result.deactivated++;
        else if (r.activated) result.reactivated++;
        else if (r.changed) result.updated++;
      } catch (e) {
        result.skipped.push(`${p.email}: ${(e as Error).message}`);
      }
    }

    // People who left the directory (or its filter).
    const leavers = managed.filter((u) => u.status === "active" && u.orgRole !== "owner" && !seen.has(u.id));
    const active = managed.filter((u) => u.status === "active").length;
    if (leavers.length && leavers.length > Math.max(5, active / 2) && !opts.allowMass) result.heldBack = leavers.length;
    else for (const u of leavers) if ((await updatePerson(ctx, "ldap", u, { active: false })).deactivated) result.deactivated++;

    // Groups: an Aatmiq group per directory group, with the members Aatmiq knows.
    if (s.groupBase) {
      const kept = new Set<string>();
      for (const g of groups) {
        const ext = first(g, s.idAttr) || normalizeDn(g.dn);
        const name = first(g, s.groupNameAttr) || g.dn;
        const members = values(g, s.memberAttr)
          .map((dn) => byDn.get(normalizeDn(String(dn))))
          .filter((id): id is string => !!id);
        let [row] = await db.select().from(userGroup).where(and(eq(userGroup.directory, "ldap"), eq(userGroup.externalId, ext)));
        if (!row) [row] = await db.insert(userGroup).values({ name: await freeGroupName(db, name), directory: "ldap", externalId: ext }).returning();
        else if (row.name !== name && !row.name.startsWith(`${name} (`))
          await db.update(userGroup).set({ name: await freeGroupName(db, name, row.id), updatedAt: new Date() }).where(eq(userGroup.id, row.id));
        await setGroupMembers(db, row!.id, members);
        kept.add(row!.id);
      }
      for (const g of await db.select({ id: userGroup.id }).from(userGroup).where(eq(userGroup.directory, "ldap")))
        if (!kept.has(g.id)) await db.delete(userGroup).where(eq(userGroup.id, g.id));
      result.groups = kept.size;
    }
    result.ok = true;
  } catch (e) {
    result.error = e instanceof LdapError ? e.message : `${(e as Error).message}`.slice(0, 300);
  }
  await writeStatus(db, "ldap_sync", { ...result });
  await audit(ctx, { action: "directory.ldap_synced", meta: { ...result, skipped: result.skipped.length } });
  return result;
}

export async function lastSync(db: DB) {
  return (await readStatus<SyncResult & Record<string, unknown>>(db, "ldap_sync"))?.value ?? null;
}

const LOCK = 7_310_431;

/** Runs the sync when it's due (every intervalMinutes), once across all API copies. */
export class LdapScheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private ctx: AppContext,
    private log: (msg: string, err?: unknown) => void,
  ) {}

  start(everyMs = 60_000) {
    this.timer = setInterval(() => void this.tick().catch((e) => this.log("directory sync failed", e)), everyMs);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    const s = (await getOrg(this.ctx.db))?.ldapSettings;
    if (!s?.enabled) return;
    const last = await lastSync(this.ctx.db);
    if (last && Date.now() - Date.parse(last.at) < s.intervalMinutes * 60_000) return;
    if (!(await this.ctx.license.hasFeature("oidc"))) return;
    await this.ctx.db.transaction(async (tx) => {
      const rows = (await tx.execute(sql`select pg_try_advisory_xact_lock(${LOCK}) as locked`)) as unknown as { locked: boolean }[];
      if (!rows[0]?.locked) return;
      await syncLdap(this.ctx, s);
    });
  }
}
