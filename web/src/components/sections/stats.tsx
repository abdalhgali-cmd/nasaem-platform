import { Award, Plane, ShieldCheck, Users } from "lucide-react";
import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { CountUp } from "@/components/motion/count-up";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

const stats = [
  { icon: Users, value: 15000, suffix: "+", label: "عميل سعيد" },
  { icon: Plane, value: 22000, suffix: "+", label: "رحلة مُنجزة" },
  { icon: ShieldCheck, value: 98, suffix: "%", label: "نسبة رضا العملاء" },
  { icon: Award, value: 10, suffix: "+", label: "سنوات من الخبرة" },
];

export function Stats() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary to-[#0a2f70] py-20 text-white">
      <GradientBackdrop variant="dark" />
      <Container className="relative">
        <Stagger className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <FadeIn key={stat.label} delay={index * 0.08} className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10 text-accent">
                <stat.icon className="size-7" />
              </span>
              <p className="mt-4 text-3xl font-extrabold sm:text-4xl">
                <CountUp value={stat.value} suffix={stat.suffix} />
              </p>
              <span className="mt-1 block text-sm text-white/75">{stat.label}</span>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
