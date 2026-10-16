"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useT } from "@/i18n";

/** A read-only value with a copy button. */
export function CopyField({ label, hint, value, testId }: { label: string; hint?: string; value: string; testId?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-[12px]" data-testid={testId} aria-label={label} />
        <Button
          variant="outline"
          size="icon"
          aria-label={t("Copy {what}", { what: label.toLowerCase() })}
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

