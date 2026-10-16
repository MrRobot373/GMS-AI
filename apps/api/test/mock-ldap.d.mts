export interface MockLdapEntry {
  dn: string;
  attributes: Record<string, string | string[] | Buffer>;
}
export function startMockLdap(opts?: { users?: Record<string, string>; entries?: MockLdapEntry[] }): Promise<{
  url: string;
  state: {
    binds: { dn: string; ok: boolean }[];
    searches: { base: string; filter: string; as: string | null }[];
    entries: MockLdapEntry[];
    users: Record<string, string>;
    /** Set to make every search fail with this message. */
    failSearch: string | null;
  };
  close: () => Promise<void>;
}>;
