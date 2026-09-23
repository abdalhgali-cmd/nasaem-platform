import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../theme";
import { formatPrice, formatSdgEquivalent } from "../utils/price";

type Props = {
  icon: string;
  kicker: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  price?: number | string | null;
  currency?: string | null;
  priceSdg?: number | null;
  ctaLabel?: string;
  onStart: () => void;
  onBack?: () => void;
};

export function ServiceLanding({
  icon,
  kicker,
  title,
  subtitle,
  description,
  highlights,
  price,
  currency,
  priceSdg,
  ctaLabel = "ابدأ الطلب",
  onStart,
  onBack,
}: Props) {
  const motion = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      motion.stopAnimation();
      motion.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [motion, reduceMotion]);

  const orbOne = {
    transform: [
      {
        translateY: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 12],
        }),
      },
      {
        translateX: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        }),
      },
    ],
  };
  const orbTwo = {
    opacity: motion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.55],
    }),
    transform: [
      {
        scale: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <Animated.View style={[s.orbOne, orbOne]} />
          <Animated.View style={[s.orbTwo, orbTwo]} />
          {onBack ? (
            <Pressable onPress={onBack} style={s.back}>
              <Text style={s.backText}>‹</Text>
            </Pressable>
          ) : null}
          <View style={s.iconWrap}>
            <Text style={s.icon}>{icon}</Text>
          </View>
          <Text style={s.kicker}>{kicker}</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>

        <View style={s.priceCard}>
          <View style={s.priceCopy}>
            <Text style={s.priceLabel}>السعر</Text>
            <Text style={s.price}>
              {formatPrice(price, currency, "السعر قيد المراجعة")}
            </Text>
            {formatSdgEquivalent(priceSdg) ? (
              <Text style={s.sdg}>{formatSdgEquivalent(priceSdg)}</Text>
            ) : null}
          </View>
          <View style={s.priceBadge}>
            <Text style={s.priceBadgeText}>واضح من البداية</Text>
          </View>
        </View>

        <View style={s.about}>
          <Text style={s.aboutTitle}>الخدمة ببساطة</Text>
          <Text style={s.description}>{description}</Text>
          <View style={s.steps}>
            {highlights.map((item, index) => (
              <View key={item} style={s.step}>
                <View style={s.stepDot}>
                  <Text style={s.stepDotText}>{index + 1}</Text>
                </View>
                <Text style={s.stepText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.trust}>
          <Text style={s.trustIcon}>✓</Text>
          <View style={s.trustCopy}>
            <Text style={s.trustTitle}>كل خطوة تظهر في وقتها</Text>
            <Text style={s.trustText}>
              ما بنغرقك في تفاصيل كثيرة — التطبيق يوريك المطلوب منك الآن فقط.
            </Text>
          </View>
        </View>

        <Pressable style={s.cta} onPress={onStart}>
          <Text style={s.ctaText}>{ctaLabel}</Text>
          <Text style={s.ctaArrow}>←</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingBottom: 28 },
  hero: {
    minHeight: 330,
    overflow: "hidden",
    backgroundColor: colors.navyDark,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    justifyContent: "flex-end",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  orbOne: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(11,61,145,.62)",
    left: -64,
    top: -38,
  },
  orbTwo: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "rgba(212,175,55,.22)",
    right: -22,
    top: 86,
  },
  back: {
    position: "absolute",
    top: 18,
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: "#FFF", fontSize: 28, lineHeight: 30 },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginBottom: 18,
  },
  icon: { fontSize: 32 },
  kicker: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "right",
  },
  title: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 5,
  },
  subtitle: {
    color: "#D6E0F0",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 8,
  },
  priceCard: {
    marginHorizontal: 16,
    marginTop: -20,
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  priceCopy: { flex: 1, alignItems: "flex-end" },
  priceLabel: { color: colors.muted, fontSize: 10 },
  price: {
    color: colors.navy,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
    textAlign: "right",
  },
  sdg: {
    color: colors.muted,
    fontSize: 10.5,
    marginTop: 4,
    textAlign: "right",
  },
  priceBadge: {
    backgroundColor: "#FFF8E6",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  priceBadgeText: { color: "#8A6800", fontSize: 9, fontWeight: "900" },
  about: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: "#FFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 17,
  },
  aboutTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
  },
  description: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 19,
    textAlign: "right",
    marginTop: 6,
  },
  steps: { marginTop: 16, gap: 10 },
  step: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF3FB",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: { color: colors.navy, fontSize: 10, fontWeight: "900" },
  stepText: {
    flex: 1,
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  trust: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#F2FFF6",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D8F2DF",
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  trustIcon: { color: colors.success, fontSize: 22, fontWeight: "900" },
  trustCopy: { flex: 1 },
  trustTitle: {
    color: colors.text,
    fontSize: 11.5,
    fontWeight: "900",
    textAlign: "right",
  },
  trustText: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 16,
    textAlign: "right",
    marginTop: 2,
  },
  cta: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.gold,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ctaText: { color: colors.navyDark, fontSize: 14, fontWeight: "900" },
  ctaArrow: { color: colors.navyDark, fontSize: 20, fontWeight: "900" },
});
