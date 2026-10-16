/**
 * Aatmiq's own SAML signing key and certificate: identity providers check the signature on logout
 * messages (Okta and Keycloak require one). One per installation, made the first time it's needed
 * and kept encrypted; the certificate is in our metadata for the provider to import. A self-signed
 * certificate is what SAML expects here: providers trust the certificate they were given, not a CA.
 */
import { and, eq, isNull, organization, type DB } from "@aatmiq/db";
import { createPrivateKey, generateKeyPairSync, randomBytes, sign, X509Certificate } from "node:crypto";
import type { SecretBox } from "../crypto";

/* A little DER, enough for one certificate. */
const len = (n: number) => {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag: number, body: Buffer) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));
const int = (b: Buffer) => tlv(0x02, b[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const nul = () => Buffer.from([0x05, 0x00]);
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
const bits = (b: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
function oid(dotted: string) {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const out = [a! * 40 + b!];
  for (const n of rest) {
    const chunk: number[] = [];
    let v = n;
    do {
      chunk.unshift(v & 0x7f);
      v >>>= 7;
    } while (v > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i]! |= 0x80;
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}
/** UTCTime until 2049, GeneralizedTime after (RFC 5280). */
function time(d: Date) {
  const iso = d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`)) : tlv(0x18, Buffer.from(`${iso}Z`));
}
const pem = (der: Buffer, label: string) => `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END ${label}-----\n`;

/** An RSA key and a self-signed certificate for it (sha256WithRSAEncryption), in PEM. */
export function makeSigningCert(commonName: string, years = 10) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sha256Rsa = seq(oid("1.2.840.113549.1.1.11"), nul());
  const name = seq(set(seq(oid("2.5.4.3"), utf8(commonName.slice(0, 64)))));
  const serial = randomBytes(16);
  serial[0]! &= 0x7f;
  const now = new Date();
  const tbs = seq(
    tlv(0xa0, int(Buffer.from([2]))), // v3
    int(serial),
    sha256Rsa,
    name,
    seq(time(new Date(now.getTime() - 60_000)), time(new Date(Date.UTC(now.getUTCFullYear() + years, now.getUTCMonth(), now.getUTCDate())))),
    name,
    publicKey.export({ type: "spki", format: "der" }),
  );
  const cert = seq(tbs, sha256Rsa, bits(sign("sha256", tbs, privateKey)));
  const out = { key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), cert: pem(cert, "CERTIFICATE") };
  // What we hand out must be a certificate that checks out.
  if (!new X509Certificate(out.cert).verify(publicKey)) throw new Error("the signing certificate didn't verify");
  return out;
}

/** The installation's key and certificate, made on first use. */
export async function samlSigning(db: DB, box: SecretBox): Promise<{ key: string; cert: string }> {
  const [org] = await db.select({ id: organization.id, name: organization.name, signing: organization.samlSigning }).from(organization).limit(1);
  if (org?.signing) return { key: box.decrypt(org.signing.keyEnc), cert: org.signing.cert };
  const made = makeSigningCert(`${org?.name ?? "Aatmiq"} single sign-on`);
  createPrivateKey(made.key);
  if (!org) return made;
  // Two first uses at once keep the same one.
  await db
    .update(organization)
    .set({ samlSigning: { keyEnc: box.encrypt(made.key), cert: made.cert } })
    .where(and(eq(organization.id, org.id), isNull(organization.samlSigning)));
  const [saved] = await db.select({ signing: organization.samlSigning }).from(organization).where(eq(organization.id, org.id));
  return { key: box.decrypt(saved!.signing!.keyEnc), cert: saved!.signing!.cert };
}
