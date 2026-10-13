export interface RespondOptions {
  email: string;
  name?: string;
  inResponseTo?: string | null;
  acs: string;
  audience: string;
  issuer?: string;
  sign?: "assertion" | "response" | "none";
  nameIdFormat?: string;
  nameId?: string;
  attrs?: Record<string, string>;
  notOnOrAfterMs?: number;
  signWith?: string;
  status?: string;
}
export function makeCert(cn?: string): { key: string; cert: string };
export function startMockSamlIdp(opts?: { port?: number; host?: string }): Promise<{
  readonly entityId: string;
  ssoUrl: string;
  metadataUrl: string;
  cert: string;
  key: string;
  state: { logins: number; lastRequest: { id: string | null; acs: string | null; issuer: string | null; xml: string } | null };
  respond: (o: RespondOptions) => string;
  readRequest: (samlRequest: string) => { id: string | null; acs: string | null; issuer: string | null; xml: string };
  metadata: () => string;
  close: () => Promise<void>;
}>;
