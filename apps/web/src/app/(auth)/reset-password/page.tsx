"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useT } from "@/i18n";

function ResetForm() {
  const t = useT();
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const signIn = (
    <Link href="/login" className="hover:text-fg">
      {t("← Back to sign in")}
    </Link>
  );

  if (!token || params.get("error"))
    return (
      <AuthShell title={t("This link doesn't work")} subtitle={t("Reset links work once and expire after an hour.")} footer={signIn}>
        <Link href="/forgot-password" className="text-[13px] text-fg hover:underline" data-testid="reset-invalid">
          {t("Send a new link")}
        </Link>
      </AuthShell>
    );

  if (done)
    return (
      <AuthShell title={t("Password changed")} subtitle={t("You were signed out on your other devices. Sign in with your new password.")} footer={null}>
        <Link href="/login" data-testid="reset-done">
          <Button variant="primary" size="lg" className="w-full">
            {t("Sign in")}
          </Button>
        </Link>
      </AuthShell>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError(t("The two passwords don't match."));
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { token, newPassword: password } });
      setDone(true);
    } catch (err: any) {
      setError(/token/i.test(err?.message ?? "") ? t("This link has expired or was already used. Ask for a new one.") : (err?.message ?? t("Couldn't change the password.")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={t("Choose a new password")} subtitle={t("Use at least 10 characters.")} footer={signIn}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("New password")}>
          <Input type="password" autoComplete="new-password" autoFocus required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="new-password" />
        </Field>
        <Field label={t("Repeat it")}>
          <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="confirm-password" />
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          {t("Change password")}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
