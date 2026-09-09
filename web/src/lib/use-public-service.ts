"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "./api-url";
import type { PublicService } from "./services";

export function usePublicService(code: string) {
  const [result, setResult] = useState<{ key: string; serviceId: string; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = `${code}:${attempt}`;

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    async function load() {
      try {
        const response = await fetch(`${API_URL}/services/public`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("catalog");
        const payload = await response.json() as { data?: { services?: PublicService[] } };
        const services = payload?.data?.services;
        if (!Array.isArray(services)) throw new Error("catalog");
        const service = services.find((item) => item.code === code);
        if (!ignore) {
          setResult({ key, serviceId: service?.id ?? "", error: service ? "" : "الخدمة غير متاحة للتقديم الإلكتروني الآن. تواصل معنا لمساعدتك." });
        }
      } catch {
        if (!ignore) setResult({ key, serviceId: "", error: "تعذر تحميل الخدمة. أعد المحاولة؛ بياناتك المدخلة ستبقى كما هي." });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => { ignore = true; window.clearTimeout(timeout); controller.abort(); };
  }, [code, key]);

  const current = result?.key === key ? result : null;
  return { serviceId: current?.serviceId ?? "", loading: !current, serviceError: current?.error ?? "", retry };
}
