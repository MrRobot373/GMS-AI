/**
 * A tiny LDAP server for tests: simple bind, subtree search with filters (and, or, not, equality,
 * presence, substrings, and Active Directory's bit-and rule), and unbind, over plain TCP. Entries
 * live in memory and tests change them between syncs. Never use it outside tests.
 *
 *   const ldap = await startMockLdap({ users: { "cn=admin,dc=acme,dc=test": "secret" }, entries: [...] });
 *   ldap.url // ldap://127.0.0.1:<port>
 */
import { BerReader, BerWriter } from "ldapts";
import { createServer } from "node:net";

const APP = 0x60; // [APPLICATION n], constructed
const BIND_REQ = APP | 0;
const BIND_RES = APP | 1;
const UNBIND_REQ = 0x42; // [APPLICATION 2], primitive
const SEARCH_REQ = APP | 3;
const SEARCH_ENTRY = APP | 4;
const SEARCH_DONE = APP | 5;
const RESULT = { success: 0, noSuchObject: 32, invalidCredentials: 49, unwillingToPerform: 53 };

const norm = (dn) => dn.replace(/\s*([,=+])\s*/g, "$1").toLowerCase();
const vals = (entry, attr) => {
  const key = Object.keys(entry.attributes).find((k) => k.toLowerCase() === attr.toLowerCase());
  if (!key) return [];
  const v = entry.attributes[key];
  return (Array.isArray(v) ? v : [v]).map((x) => (Buffer.isBuffer(x) ? x : String(x)));
};
const text = (v) => (Buffer.isBuffer(v) ? v.toString("hex") : String(v).toLowerCase());

/** One BER element: its tag and where its content is. */
function tlv(buf, pos) {
  const tag = buf[pos];
  let len = buf[pos + 1];
  let at = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[at + i];
    at += n;
  }
  return { tag, start: at, end: at + len };
}
const children = (buf, el) => {
  const out = [];
  for (let p = el.start; p < el.end; ) {
    const c = tlv(buf, p);
    out.push(c);
    p = c.end;
  }
  return out;
};
const str = (buf, el) => buf.subarray(el.start, el.end).toString("utf8");

/** A search filter (RFC 4511 4.5.1) as a tree. */
function readFilter(buf, el) {
  const kids = () => children(buf, el);
  switch (el.tag) {
    case 0xa0:
      return { and: kids().map((k) => readFilter(buf, k)) };
    case 0xa1:
      return { or: kids().map((k) => readFilter(buf, k)) };
    case 0xa2:
      return { not: readFilter(buf, kids()[0]) };
    case 0xa3:
    case 0xa8: {
      const [a, v] = kids();
      return { eq: [str(buf, a), str(buf, v)] };
    }
    case 0x87:
      return { present: str(buf, el) };
    case 0xa4: {
      const [a, parts] = kids();
      const p = { initial: "", any: [], final: "" };
      for (const c of children(buf, parts)) {
        if (c.tag === 0x80) p.initial = str(buf, c);
        else if (c.tag === 0x81) p.any.push(str(buf, c));
        else if (c.tag === 0x82) p.final = str(buf, c);
      }
      return { substr: [str(buf, a), p] };
    }
    case 0xa9: {
      const x = {};
      for (const c of kids()) x[c.tag] = str(buf, c);
      return { ext: { rule: x[0x81] ?? "", attr: x[0x82] ?? "", value: x[0x83] ?? "" } };
    }
    default:
      throw new Error(`mock LDAP: unsupported filter 0x${el.tag.toString(16)}`);
  }
}

/** Does the entry match the filter (every value of a multi-valued attribute counts)? */
function matches(f, entry) {
  if (f.and) return f.and.every((x) => matches(x, entry));
  if (f.or) return f.or.some((x) => matches(x, entry));
  if (f.not) return !matches(f.not, entry);
  if (f.present) return f.present.toLowerCase() === "objectclass" || vals(entry, f.present).length > 0;
  if (f.eq) return vals(entry, f.eq[0]).some((v) => text(v) === f.eq[1].toLowerCase());
  if (f.substr) {
    const [attr, p] = f.substr;
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${esc(p.initial)}.*${p.any.map(esc).join(".*")}${p.any.length ? ".*" : ""}${esc(p.final)}$`, "i");
    return vals(entry, attr).some((v) => re.test(String(v)));
  }
  // Active Directory's LDAP_MATCHING_RULE_BIT_AND: (userAccountControl:1.2.840.113556.1.4.803:=2)
  if (f.ext && f.ext.rule === "1.2.840.113556.1.4.803") return vals(entry, f.ext.attr).some((v) => (Number(v) & Number(f.ext.value)) === Number(f.ext.value));
  throw new Error("mock LDAP: unsupported filter");
}
const show = (f) =>
  f.and ? `(&${f.and.map(show).join("")})` : f.or ? `(|${f.or.map(show).join("")})` : f.not ? `(!${show(f.not)})` : f.present ? `(${f.present}=*)` : f.eq ? `(${f.eq[0]}=${f.eq[1]})` : f.substr ? `(${f.substr[0]}=…)` : `(${f.ext.attr}:${f.ext.rule}:=${f.ext.value})`;

function result(writer, messageId, tag, code, message = "") {
  writer.startSequence();
  writer.writeInt(messageId);
  writer.startSequence(tag);
  writer.writeEnumeration(code);
  writer.writeString("");
  writer.writeString(message);
  writer.endSequence();
  writer.endSequence();
}

export async function startMockLdap({ users = {}, entries = [] } = {}) {
  const state = { binds: [], searches: [], entries, users, failSearch: null };

  const server = createServer((sock) => {
    let buf = Buffer.alloc(0);
    let boundAs = null;
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 2) return;
        // One whole LDAPMessage (a SEQUENCE) at a time.
        const r = new BerReader(buf);
        const start = r.offset;
        if (r.readSequence() === null) return;
        const total = r.offset - start + r.length;
        if (buf.length < total) return;
        const msg = new BerReader(buf.subarray(0, total));
        buf = buf.subarray(total);
        msg.readSequence();
        const id = msg.readInt();
        const op = msg.peek();
        const w = new BerWriter();
        if (op === UNBIND_REQ) {
          sock.end();
          return;
        }
        if (op === BIND_REQ) {
          msg.readSequence(BIND_REQ);
          msg.readInt();
          const dn = msg.readString() ?? "";
          const password = msg.readString(0x80) ?? "";
          const known = Object.entries(state.users).find(([d]) => norm(d) === norm(dn));
          const ok = (!dn && !password) || (known && known[1] === password);
          state.binds.push({ dn, ok });
          if (ok) boundAs = dn;
          result(w, id, BIND_RES, ok ? RESULT.success : RESULT.invalidCredentials, ok ? "" : "invalid credentials");
          sock.write(w.buffer);
          continue;
        }
        if (op === SEARCH_REQ) {
          // baseObject, scope, derefAliases, sizeLimit, timeLimit, typesOnly, filter, attributes.
          const whole = msg.buffer;
          const root = tlv(whole, 0);
          const [, req] = children(whole, root);
          const parts = children(whole, req);
          const base = str(whole, parts[0]);
          const filter = readFilter(whole, parts[6]);
          const want = children(whole, parts[7]).map((a) => str(whole, a));
          state.searches.push({ base, filter: show(filter), as: boundAs });
          if (!boundAs) {
            result(w, id, SEARCH_DONE, RESULT.unwillingToPerform, "bind first");
            sock.write(w.buffer);
            continue;
          }
          if (state.failSearch) {
            result(w, id, SEARCH_DONE, RESULT.unwillingToPerform, state.failSearch);
            sock.write(w.buffer);
            continue;
          }
          const under = state.entries.filter((e) => norm(e.dn) === norm(base) || norm(e.dn).endsWith(`,${norm(base)}`));
          if (!under.length && !state.entries.some((e) => norm(e.dn).endsWith(norm(base)))) {
            result(w, id, SEARCH_DONE, RESULT.noSuchObject, "no such object");
            sock.write(w.buffer);
            continue;
          }
          for (const e of under.filter((x) => matches(filter, x))) {
            w.startSequence();
            w.writeInt(id);
            w.startSequence(SEARCH_ENTRY);
            w.writeString(e.dn);
            w.startSequence();
            for (const [attr] of Object.entries(e.attributes)) {
              if (want.length && !want.some((a) => a.toLowerCase() === attr.toLowerCase())) continue;
              w.startSequence();
              w.writeString(attr);
              w.startSequence(0x31);
              for (const v of vals(e, attr)) Buffer.isBuffer(v) ? w.writeBuffer(v, 0x04) : w.writeString(v);
              w.endSequence();
              w.endSequence();
            }
            w.endSequence();
            w.endSequence();
            w.endSequence();
          }
          result(w, id, SEARCH_DONE, RESULT.success);
          sock.write(w.buffer);
          continue;
        }
        // Anything else (StartTLS, modify…): not here.
        result(w, id, APP | 24, RESULT.unwillingToPerform, "not supported by the mock");
        sock.write(w.buffer);
      }
    });
    sock.on("error", () => {});
  });
  const sockets = new Set();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `ldap://127.0.0.1:${server.address().port}`,
    state,
    close: () =>
      new Promise((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}
