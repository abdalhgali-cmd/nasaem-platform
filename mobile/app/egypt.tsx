import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ServiceLanding } from "../src/components/ServiceLanding";
import {
  getPublicServices,
  getPublicVisaTypes,
  PublicService,
  PublicVisaType,
} from "../src/api/services";

export default function EgyptLandingScreen() {
  const [service, setService] = useState<PublicService | null>(null);
  const [visaType, setVisaType] = useState<PublicVisaType | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getPublicServices(), getPublicVisaTypes()])
      .then(([services, visaTypes]) => {
        if (!active) return;
        setService(
          services.find((item) => (item.code ?? "").toUpperCase() === "SVC-EGYPT-CLEARANCE") ??
            null
        );
        setVisaType(
          visaTypes.find((item) => (item.code ?? "").toUpperCase() === "VISA-EGYPT-CLEARANCE") ??
            null
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const start = () =>
    router.push({
      pathname: "/request/[kind]",
      params: {
        kind: "egypt",
        serviceId: service?.id ?? "",
        serviceName: service?.name ?? "الموافقة الأمنية لمصر",
        visaTypeId: visaType?.id ?? "",
      },
    });

  return (
    <ServiceLanding
      icon="🇪🇬"
      kicker="السفر إلى مصر"
      title="الموافقة الأمنية لمصر"
      subtitle="من الجواز لحد الموافقة والتعميم — كل خطوة في وقتها."
      description="دخل بياناتك، اختار طريقة الدخول وارفع الجواز. بعد مراجعة الوكالة يظهر الدفع، وبعد صدور الموافقة نكمل معاك التعميم أو حجز الرحلة."
      highlights={[
        "بيانات المسافر وطريقة الدخول",
        "رفع الجواز ومراجعة الوكالة",
        "الدفع بالجنيه بعد القبول",
        "استلام الموافقة ثم التعميم أو حجز الرحلة",
      ]}
      price={visaType?.basePrice ?? service?.basePrice}
      currency={visaType?.currency ?? service?.currency}
      priceSdg={visaType?.priceSdg ?? service?.priceSdg}
      onStart={start}
      onBack={() => router.back()}
    />
  );
}
