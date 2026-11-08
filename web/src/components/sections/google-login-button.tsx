"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { customerApi } from "@/lib/customer-api";
import { saveCustomerToken } from "@/lib/customer-session";

type Challenge = { enabled: boolean; clientId?: string; nonce?: string };
type GoogleSdk = { accounts: { id: {
  initialize: (options: { client_id: string; nonce: string; callback: (data: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
} } };

export function GoogleLoginButton() {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    customerApi<Challenge>("/customer-auth/google/challenge")
      .then((value) => { if (active) setChallenge(value); })
      .catch(() => { /* Password login remains available when configuration cannot load. */ });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const google = (window as Window & { google?: GoogleSdk }).google;
    if (!ready || !challenge?.enabled || !challenge.clientId || !challenge.nonce || !host.current || !google) return;
    let active = true;
    google.accounts.id.initialize({ client_id: challenge.clientId, nonce: challenge.nonce,
      callback: async ({ credential }) => {
        if (!active || busy.current) return;
        busy.current = true;
        setError("");
        try {
          const result = await customerApi<{ token: string }>("/customer-auth/google", { method: "POST", body: { credential } });
          if (!active) return;
          saveCustomerToken(result.token);
          router.replace("/account");
          router.refresh();
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : "تعذّر تسجيل الدخول.");
        } finally { busy.current = false; }
      } });
    host.current.replaceChildren();
    google.accounts.id.renderButton(host.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "ar" });
    return () => { active = false; };
  }, [ready, challenge, router]);

  if (!challenge?.enabled) return null;
  return <div className="mb-5 flex flex-col items-center gap-2">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
      onReady={() => setReady(true)} onError={() => setError("تعذّر تحميل Google؛ استخدم طريقة الدخول المعتادة أو أعد المحاولة.")} />
    <div ref={host} />
    {error ? <div role="alert" className="text-sm text-destructive">{error}
      <button type="button" className="ms-2 underline" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>إعادة المحاولة</button>
    </div> : null}
  </div>;
}
