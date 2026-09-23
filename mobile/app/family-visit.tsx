import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ServiceLanding } from "../src/components/ServiceLanding";
import {
  getPublicServices,
  getPublicVisaTypes,
  PublicService,
  PublicVisaType,
} from "../src/api/services";

export default function FamilyVisitLandingScreen() {
  const [service, setService] = useState<PublicService | null>(null);
  const [visaType, setVisaType] = useState<PublicVisaType | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getPublicServices(), getPublicVisaTypes()])
      .then(([services, visaTypes]) => {
        if (!active) return;
        const foundService =
          services.find((item) => (item.category ?? "").toLowerCase().includes("family")) ?? null;
        setService(foundService);
        setVisaType(
          visaTypes.find((item) => (item.code ?? "").toUpperCase() === "VISA-FAMILY-VISIT") ??
            visaTypes.find((item) => item.serviceId === foundService?.id) ??
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
        kind: "family",
        serviceId: service?.id ?? "",
        serviceName: service?.name ?? "الزيارة العائلية السعودية",
        visaTypeId: visaType?.id ?? "",
      },
    });

  return (
    <ServiceLanding
      icon="🇸🇦"
      kicker="زيارة عائلية"
      title="الزيارة العائلية السعودية"
      subtitle="طلب واحد واضح، ومتابعة مرحلة بمرحلة."
      description="ندخل بيانات الزائر والمضيف، نراجع المستندات، وبعد القبول يظهر الدفع. بعد كدا التطبيق يوريك الخطوة المطلوبة منك فقط لحد صدور التأشيرة."
      highlights={[
        "بيانات الزائر والمضيف",
        "المستندات ومراجعة الوكالة",
        "الدفع بعد قبول الطلب",
        "متابعة الإجراءات حتى صدور التأشيرة",
      ]}
      price={visaType?.basePrice ?? service?.basePrice}
      currency={visaType?.currency ?? service?.currency}
      priceSdg={visaType?.priceSdg ?? service?.priceSdg}
      onStart={start}
      onBack={() => router.back()}
    />
  );
}
