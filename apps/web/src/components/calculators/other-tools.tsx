"use client";

import { algebra, CONSTANTS, finance, tools } from "@aatmiq/calculators";
import { Dices } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { attempt, CopyButton, ErrorLine, fmt, Panel, ResultRow, TextField, useSaveHistory } from "./shared";

/* ───────────── Number bases, bitwise, two's complement, IEEE 754 ───────────── */

export function BaseNTool() {
  const t = useT();
  const [value, setValue] = useState("255");
  const [base, setBase] = useState("10");
  const [a, setA] = useState("0b1100");
  const [b, setB] = useState("0b1010");
  const [bits, setBits] = useState("8");
  const [op, setOp] = useState<"and" | "or" | "xor" | "nand" | "nor" | "not" | "shl" | "shr">("xor");
  const [signed, setSigned] = useState("-5");
  const [float, setFloat] = useState("0.1");
  const B = Number(base);
  const conv = (to: number) => attempt(() => algebra.convertBase(value, B, to));
  const toBig = (s: string) => {
    const v = s.trim().toLowerCase();
    const r = v.startsWith("0x") ? algebra.convertBase(v, 16, 10) : v.startsWith("0b") ? algebra.convertBase(v, 2, 10) : v.startsWith("0o") ? algebra.convertBase(v, 8, 10) : algebra.convertBase(v, 10, 10);
    return BigInt(r);
  };
  const [bw, bwErr] = attempt(() => {
    const w = Number(bits);
    if (!Number.isInteger(w) || w < 1 || w > 64) throw new Error(t("Width from 1 to 64 bits"));
    const r = algebra.bitwise(op, toBig(a), toBig(b), w);
    return { dec: r.toString(), hex: r.toString(16), bin: r.toString(2).padStart(w, "0") };
  });
  const [tc, tcErr] = attempt(() => algebra.twosComplement(Number(signed), Number(bits)));
  const [ie, ieErr] = attempt(() => {
    const v = Number(float);
    if (!Number.isFinite(v)) throw new Error(t("Enter a number"));
    return { s: algebra.ieee754(v, 32), d: algebra.ieee754(v, 64) };
  });
  return (
    <div className="space-y-4">
      <Panel title={t("Convert between bases")}>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("Value")} value={value} onChange={setValue} mono className="w-56" />
          <TextField label={t("Base (2–36)")} value={base} onChange={setBase} mono className="w-28" type="number" min={2} max={36} />
        </div>
        <div className="mt-2">
          {[
            [2, t("Binary")],
            [8, t("Octal")],
            [10, t("Decimal")],
            [16, t("Hexadecimal")],
            [36, t("Base 36")],
          ].map(([to, label]) => {
            const [r, e] = conv(to as number);
            return <ResultRow key={to} label={label} value={r ?? e ?? ""} />;
          })}
        </div>
      </Panel>
      <Panel title={t("Bitwise")}>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label="a" value={a} onChange={setA} mono className="w-40" />
          <select value={op} onChange={(e) => setOp(e.target.value as typeof op)} aria-label={t("Operation")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]">
            {(["and", "or", "xor", "nand", "nor", "not", "shl", "shr"] as const).map((o) => (
              <option key={o} value={o}>
                {o.toUpperCase()}
              </option>
            ))}
          </select>
          <TextField label={op === "shl" || op === "shr" ? t("shift by") : "b"} value={b} onChange={setB} mono className="w-40" />
          <TextField label={t("Width (bits)")} value={bits} onChange={setBits} mono className="w-24" />
        </div>
        <p className="mt-1 text-[12px] text-fg-subtle">{t("Prefix 0x for hex, 0b for binary, 0o for octal.")}</p>
        <ErrorLine>{bwErr}</ErrorLine>
        {bw && (
          <div className="mt-2">
            <ResultRow label={t("Decimal")} value={bw.dec} />
            <ResultRow label={t("Hexadecimal")} value={`0x${bw.hex}`} />
            <ResultRow label={t("Binary")} value={bw.bin} />
          </div>
        )}
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t("Two's complement")}>
          <TextField label={t("Signed integer (width above)")} value={signed} onChange={setSigned} mono />
          <ErrorLine>{tcErr}</ErrorLine>
          {tc && <ResultRow label={t("Bits")} value={tc} />}
        </Panel>
        <Panel title="IEEE 754">
          <TextField label={t("Number")} value={float} onChange={setFloat} mono />
          <ErrorLine>{ieErr}</ErrorLine>
          {ie && (
            <div className="mt-2">
              <ResultRow label={t("Single (32-bit) hex")} value={`0x${ie.s.hex}`} />
              <ResultRow label={t("Stored as")} value={String(ie.s.stored)} />
              <ResultRow label={t("Rounding error")} value={ie.s.error.toExponential(3)} />
              <ResultRow label={t("Double (64-bit) hex")} value={`0x${ie.d.hex}`} />
              <p className="mt-2 font-mono text-[11.5px] break-all text-fg-subtle">
                {ie.s.sign} | {ie.s.exponent} | {ie.s.mantissa}
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ───────────── Subnets ───────────── */

export function SubnetTool() {
  const t = useT();
  const [addr, setAddr] = useState("192.168.1.130/26");
  const [r, err] = attempt(() => tools.subnet(addr));
  return (
    <div className="space-y-4">
      <Panel>
        <TextField label={t("Address with prefix (or address, then a mask after a space)")} value={addr} onChange={setAddr} mono />
      </Panel>
      {(() => {
        const [a, m] = addr.trim().split(/\s+/);
        const [r2, e2] = m ? attempt(() => tools.subnet(a!, m)) : [r, err];
        return (
          <>
            <ErrorLine>{e2}</ErrorLine>
            {r2 && (
              <Panel title={t("Subnet")}>
                <ResultRow label={t("Network")} value={`${r2.network}/${r2.prefix}`} />
                <ResultRow label={t("Mask")} value={r2.mask} />
                <ResultRow label={t("Wildcard")} value={r2.wildcard} />
                <ResultRow label={t("Broadcast")} value={r2.broadcast} />
                <ResultRow label={t("Host range")} value={`${r2.firstHost} – ${r2.lastHost}`} />
                <ResultRow label={t("Usable hosts")} value={r2.usableHosts.toLocaleString()} />
                <ResultRow label={t("Addresses")} value={r2.addresses.toLocaleString()} />
                <ResultRow label={t("Private range")} value={r2.private ? t("Yes") : t("No")} />
                <p className="mt-2 font-mono text-[11.5px] text-fg-subtle">{r2.binaryMask}</p>
              </Panel>
            )}
          </>
        );
      })()}
    </div>
  );
}

/* ───────────── Resistor colour code ───────────── */

const SWATCH: Record<tools.Color, string> = {
  black: "#111",
  brown: "#7b3f00",
  red: "#d32f2f",
  orange: "#f57c00",
  yellow: "#fbc02d",
  green: "#388e3c",
  blue: "#1976d2",
  violet: "#7b1fa2",
  grey: "#9e9e9e",
  white: "#fafafa",
  gold: "#c9a227",
  silver: "#c0c0c0",
};

export function ResistorColorTool() {
  const t = useT();
  const [bands, setBands] = useState<tools.Color[]>(["yellow", "violet", "red", "gold"]);
  const [value, setValue] = useState("4700");
  const [r, err] = attempt(() => tools.decodeResistor(bands));
  const [enc, encErr] = attempt(() => tools.encodeResistor(Number(value), 4));
  const [enc5] = attempt(() => tools.encodeResistor(Number(value), 5, "brown"));
  const ohms = (v: number) => (v >= 1e6 ? `${fmt(v / 1e6, 4)} MΩ` : v >= 1e3 ? `${fmt(v / 1e3, 4)} kΩ` : `${fmt(v, 4)} Ω`);
  const Strip = ({ cs }: { cs: tools.Color[] }) => (
    <div className="flex h-12 items-center rounded-full bg-[#e8d5b0] px-6" aria-hidden>
      {cs.map((c, i) => (
        <span key={i} className={cn("h-full w-3", i === cs.length - 1 ? "ml-auto" : "mr-3")} style={{ background: SWATCH[c] }} />
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <Panel title={t("Decode the bands")}>
        <Strip cs={bands} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {bands.map((b, i) => (
            <select key={i} value={b} onChange={(e) => setBands((x) => x.map((y, j) => (j === i ? (e.target.value as tools.Color) : y)))} aria-label={t("Band {n}", { n: i + 1 })} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]">
              {tools.COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ))}
          <Button size="sm" variant="ghost" disabled={bands.length >= 6} onClick={() => setBands((x) => [...x, "brown"])}>
            + {t("band")}
          </Button>
          <Button size="sm" variant="ghost" disabled={bands.length <= 3} onClick={() => setBands((x) => x.slice(0, -1))}>
            − {t("band")}
          </Button>
        </div>
        <ErrorLine>{err}</ErrorLine>
        {r && (
          <div className="mt-2">
            <ResultRow label={t("Resistance")} value={ohms(r.ohms)} big />
            <ResultRow label={t("Tolerance")} value={`±${r.tolerance} %`} />
            <ResultRow label={t("Range")} value={`${ohms(r.min)} – ${ohms(r.max)}`} />
            {r.tempco !== null && <ResultRow label={t("Temperature coefficient")} value={`${r.tempco} ppm/K`} />}
          </div>
        )}
      </Panel>
      <Panel title={t("Bands for a value")}>
        <TextField label={t("Resistance (Ω)")} value={value} onChange={setValue} mono className="w-48" />
        <ErrorLine>{encErr}</ErrorLine>
        {enc && (
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-[12px] text-fg-subtle">{t("4 bands, ±5 %")}: {enc.join(", ")}</div>
              <Strip cs={enc} />
            </div>
            {enc5 && (
              <div>
                <div className="mb-1 text-[12px] text-fg-subtle">{t("5 bands, ±1 %")}: {enc5.join(", ")}</div>
                <Strip cs={enc5} />
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ───────────── Molar mass ───────────── */

export function MolarMassTool() {
  const t = useT();
  const [f, setF] = useState("CuSO4·5H2O");
  const [r, err] = attempt(() => tools.molarMass(f));
  return (
    <div className="space-y-4">
      <Panel>
        <TextField label={t("Chemical formula")} value={f} onChange={setF} mono />
        <p className="mt-1 text-[12px] text-fg-subtle">{t("Brackets and hydrates work: Ca(OH)2, CuSO4·5H2O. Element symbols are case-sensitive.")}</p>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <Panel title={r.formula}>
          <ResultRow label={t("Molar mass")} value={fmt(r.molarMass, 8)} unit="g/mol" big />
          <table className="mt-3 w-full text-[13px]">
            <thead>
              <tr className="text-left text-fg-subtle">
                <th className="py-1 font-normal">{t("Element")}</th>
                <th className="py-1 font-normal">{t("Atoms")}</th>
                <th className="py-1 font-normal">g/mol</th>
                <th className="py-1 font-normal">{t("By mass")}</th>
              </tr>
            </thead>
            <tbody>
              {r.elements.map((e) => (
                <tr key={e.symbol} className="border-t border-border font-mono">
                  <td className="py-1">{e.symbol}</td>
                  <td className="py-1">{e.count}</td>
                  <td className="py-1">{fmt(e.mass, 7)}</td>
                  <td className="py-1">{fmt(e.fraction * 100, 5)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-fg-subtle">{t("IUPAC standard atomic weights (conventional values).")}</p>
        </Panel>
      )}
    </div>
  );
}

export function ConstantsTool() {
  const t = useT();
  return (
    <Panel title={t("Physical and mathematical constants")}>
      <p className="mb-2 text-[12px] text-fg-subtle">{t("CODATA 2018. Use the name in the scientific calculator: 2·c0, hP/qe…")}</p>
      {Object.entries(CONSTANTS)
        .filter(([k]) => k !== "π" && k !== "φ")
        .map(([k, c]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
            <span className="text-[13px] text-fg-muted">
              <span className="font-mono text-fg">{k}</span> · {c.name}
            </span>
            <span className="flex items-baseline gap-1.5 font-mono text-[13px]">
              {c.value.toPrecision(10)} <span className="text-fg-subtle">{c.unit}</span>
              <CopyButton text={String(c.value)} />
            </span>
          </div>
        ))}
    </Panel>
  );
}

/* ───────────── Money ───────────── */

export function AmortizationTool() {
  const t = useT();
  const save = useSaveHistory();
  const [p, setP] = useState("2500000");
  const [rate, setRate] = useState("8.5");
  const [years, setYears] = useState("20");
  const [extra, setExtra] = useState("0");
  const [r, err] = attempt(() => finance.amortize(Number(p), Number(rate), Number(years), 12, Number(extra) || 0));
  const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-4">
          <TextField label={t("Loan amount")} value={p} onChange={setP} mono />
          <TextField label={t("Annual rate (%)")} value={rate} onChange={setRate} mono />
          <TextField label={t("Years")} value={years} onChange={setYears} mono />
          <TextField label={t("Extra each month")} value={extra} onChange={setExtra} mono />
        </div>
        <div className="mt-3">
          <Button size="sm" disabled={!r} onClick={() => r && save.mutate({ calculatorId: "amortization", inputs: { p, rate, years, extra }, outputs: { payment: r.payment, totalInterest: r.totalInterest, periods: r.periods } })}>
            {t("Save to history")}
          </Button>
        </div>
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <>
          <Panel title={t("Summary")}>
            <ResultRow label={t("Monthly payment (EMI)")} value={money(r.payment)} big />
            <ResultRow label={t("Total interest")} value={money(r.totalInterest)} />
            <ResultRow label={t("Total paid")} value={money(r.totalPaid)} />
            <ResultRow label={t("Payments")} value={String(r.periods)} />
          </Panel>
          <Panel title={t("Schedule")}>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-right font-mono text-[12.5px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-fg-subtle">
                    <th className="py-1 text-left font-normal">#</th>
                    <th className="py-1 font-normal">{t("Payment")}</th>
                    <th className="py-1 font-normal">{t("Interest")}</th>
                    <th className="py-1 font-normal">{t("Principal")}</th>
                    <th className="py-1 font-normal">{t("Balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((x) => (
                    <tr key={x.period} className="border-t border-border">
                      <td className="py-0.5 text-left">{x.period}</td>
                      <td>{money(x.payment)}</td>
                      <td>{money(x.interest)}</td>
                      <td>{money(x.principal)}</td>
                      <td>{money(x.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

export function CashFlowsTool() {
  const t = useT();
  const [flows, setFlows] = useState("-100000, 30000, 35000, 40000, 45000");
  const [rate, setRate] = useState("10");
  const [r, err] = attempt(() => {
    const f = flows.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (f.some((x) => !Number.isFinite(x))) throw new Error(t("Every cash flow must be a number"));
    return { npv: finance.npv(Number(rate), f), irr: attempt(() => finance.irr(f)) };
  });
  return (
    <div className="space-y-4">
      <Panel>
        <TextField label={t("Cash flows, first at time 0 (negative = paid out)")} value={flows} onChange={setFlows} mono />
        <TextField className="mt-3 w-48" label={t("Discount rate (%)")} value={rate} onChange={setRate} mono />
      </Panel>
      <ErrorLine>{err}</ErrorLine>
      {r && (
        <Panel title={t("Results")}>
          <ResultRow label="NPV" value={fmt(r.npv, 10)} big />
          <ResultRow label="IRR" value={r.irr[0] !== null ? `${fmt(r.irr[0], 8)} %` : (r.irr[1] ?? "")} />
        </Panel>
      )}
    </div>
  );
}

/* ───────────── Dates and times ───────────── */

export function DatesTool() {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const [a, setA] = useState(today);
  const [b, setB] = useState("2026-12-25");
  const [base, setBase] = useState(today);
  const [add, setAdd] = useState({ years: "0", months: "0", days: "30" });
  const [birth, setBirth] = useState("1990-01-01");
  const [durs, setDurs] = useState("1:45, 0:30, 2h 15m");
  const [clock, setClock] = useState("14:30");
  const [diff, diffErr] = attempt(() => tools.dateDifference(a, b));
  const [added, addErr] = attempt(() => tools.addToDate(base, { years: Number(add.years) || 0, months: Number(add.months) || 0, days: Number(add.days) || 0 }));
  const [age, ageErr] = attempt(() => tools.age(birth, today));
  const [sum, sumErr] = attempt(() => tools.formatDuration(durs.split(",").filter((x) => x.trim()).reduce((s, x) => s + tools.parseDuration(x), 0)));
  const [cl, clErr] = attempt(() => tools.convertClock(clock));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title={t("Days between dates")}>
        <div className="grid grid-cols-2 gap-2">
          <TextField label={t("From")} value={a} onChange={setA} type="date" />
          <TextField label={t("To")} value={b} onChange={setB} type="date" />
        </div>
        <ErrorLine>{diffErr}</ErrorLine>
        {diff && (
          <div className="mt-2">
            <ResultRow label={t("Days")} value={String(diff.days)} big />
            <ResultRow label={t("Weeks")} value={fmt(diff.weeks, 6)} />
            <ResultRow label={t("Calendar")} value={t("{y} y {m} m {d} d", { y: diff.years, m: diff.months, d: diff.remainingDays })} />
            <ResultRow label={t("Weekdays (Mon–Fri)")} value={String(diff.weekdays)} />
          </div>
        )}
      </Panel>
      <Panel title={t("Add to a date")}>
        <TextField label={t("Date")} value={base} onChange={setBase} type="date" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <TextField label={t("Years")} value={add.years} onChange={(v) => setAdd((x) => ({ ...x, years: v }))} mono />
          <TextField label={t("Months")} value={add.months} onChange={(v) => setAdd((x) => ({ ...x, months: v }))} mono />
          <TextField label={t("Days")} value={add.days} onChange={(v) => setAdd((x) => ({ ...x, days: v }))} mono />
        </div>
        <ErrorLine>{addErr}</ErrorLine>
        {added && <ResultRow label={added.weekday} value={added.date} big />}
      </Panel>
      <Panel title={t("Age")}>
        <TextField label={t("Date of birth")} value={birth} onChange={setBirth} type="date" />
        <ErrorLine>{ageErr}</ErrorLine>
        {age && (
          <>
            <ResultRow label={t("Age")} value={t("{y} y {m} m {d} d", { y: age.years, m: age.months, d: age.days })} big />
            <ResultRow label={t("Days lived")} value={age.totalDays.toLocaleString()} />
          </>
        )}
      </Panel>
      <Panel title={t("Add up durations · 12/24-hour clock")}>
        <TextField label={t("Durations (comma-separated)")} value={durs} onChange={setDurs} mono />
        <ErrorLine>{sumErr}</ErrorLine>
        {sum && <ResultRow label={t("Total")} value={sum} />}
        <TextField className="mt-3" label={t("Time (14:30 or 2:30 PM)")} value={clock} onChange={setClock} mono />
        <ErrorLine>{clErr}</ErrorLine>
        {cl && (
          <>
            <ResultRow label={t("24-hour")} value={cl.h24} />
            <ResultRow label={t("12-hour")} value={cl.h12} />
          </>
        )}
      </Panel>
    </div>
  );
}

export function RandomTool() {
  const t = useT();
  const [lo, setLo] = useState("1");
  const [hi, setHi] = useState("100");
  const [n, setN] = useState("2");
  const [sides, setSides] = useState("6");
  const [num, setNum] = useState<string | null>(null);
  const [dice, setDice] = useState<{ rolls: number[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Cryptographic randomness, not Math.random.
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title={t("Random whole number")}>
        <div className="grid grid-cols-2 gap-2">
          <TextField label={t("From")} value={lo} onChange={setLo} mono />
          <TextField label={t("To")} value={hi} onChange={setHi} mono />
        </div>
        <div className="mt-3">
          <Button
            onClick={() => {
              const a = Number(lo);
              const b = Number(hi);
              if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) return setErr(t("Use two whole numbers, the first not larger"));
              setErr(null);
              setNum(String(a + Math.floor(rnd() * (b - a + 1))));
            }}
          >
            {t("Draw")}
          </Button>
        </div>
        {num && <ResultRow label={t("Number")} value={num} big />}
      </Panel>
      <Panel title={t("Dice")}>
        <div className="grid grid-cols-2 gap-2">
          <TextField label={t("Dice")} value={n} onChange={setN} mono />
          <TextField label={t("Sides")} value={sides} onChange={setSides} mono />
        </div>
        <div className="mt-3">
          <Button
            onClick={() => {
              const [r, e] = attempt(() => tools.rollDice(Number(n), Number(sides), rnd));
              setDice(r);
              setErr(e);
            }}
          >
            <Dices className="size-3.5" /> {t("Roll")}
          </Button>
        </div>
        {dice && <ResultRow label={dice.rolls.join(" + ")} value={String(dice.total)} big />}
      </Panel>
      <div className="md:col-span-2">
        <ErrorLine>{err}</ErrorLine>
      </div>
    </div>
  );
}
