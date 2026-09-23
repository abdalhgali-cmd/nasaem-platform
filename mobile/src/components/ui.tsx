import type { PropsWithChildren, ReactNode } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius, shadow } from "../theme";

export function BrandHeader({
  eyebrow = "نسائم الحرمين",
  title,
  subtitle,
  compact = false,
  children,
}: PropsWithChildren<{ eyebrow?: string; title: string; subtitle?: string; compact?: boolean }>) {
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View pointerEvents="none" style={styles.headerOrbOne} />
      <View pointerEvents="none" style={styles.headerOrbTwo} />
      <Text style={styles.eyebrow}>✦ {eyebrow}</Text>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function SurfaceCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}><Text style={styles.sectionAction}>{action}</Text></Pressable>
      ) : null}
    </View>
  );
}

export function AppButton({
  label,
  onPress,
  disabled,
  busy,
  variant = "primary",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "gold" | "outline" | "soft";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "gold" && styles.buttonGold,
        variant === "outline" && styles.buttonOutline,
        variant === "soft" && styles.buttonSoft,
        (disabled || busy) && styles.disabled,
        pressed && !disabled && !busy && styles.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={variant === "outline" || variant === "soft" ? colors.navy : "#FFF"} /> : (
        <Text style={[
          styles.buttonText,
          variant === "gold" && styles.buttonGoldText,
          (variant === "outline" || variant === "soft") && styles.buttonOutlineText,
        ]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function FormField({ label, optional, style, ...props }: TextInputProps & { label: string; optional?: boolean }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}{optional ? <Text style={styles.optional}> (اختياري)</Text> : null}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.subtle}
        style={[styles.field, props.multiline && styles.fieldMultiline, style]}
        textAlign="right"
      />
    </View>
  );
}

export function ChoiceCard({
  title,
  subtitle,
  meta,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
      <View style={styles.choiceMain}>
        {icon ? <Text style={styles.choiceIcon}>{icon}</Text> : null}
        <View style={styles.choiceCopy}>
          <Text style={[styles.choiceTitle, selected && styles.choiceTitleSelected]}>{title}</Text>
          {subtitle ? <Text style={styles.choiceSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {meta ? <Text style={[styles.choiceMeta, selected && styles.choiceMetaSelected]}>{meta}</Text> : null}
    </Pressable>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.steps}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={`${label}-${index}`} style={styles.stepItem}>
            <View style={[styles.stepCircle, (done || active) && styles.stepCircleActive, done && styles.stepCircleDone]}>
              <Text style={[styles.stepNumber, (done || active) && styles.stepNumberActive]}>{done ? "✓" : index + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const navItems = [
  { key: "home", label: "الرئيسية", icon: "⌂", route: "/" as const },
  { key: "services", label: "الخدمات", icon: "✦", route: "/requests" as const },
  { key: "track", label: "طلباتي", icon: "▣", route: "/track" as const },
  { key: "account", label: "حسابي", icon: "◉", route: "/account" as const },
];

export function BottomNav({ active }: { active: "home" | "services" | "track" | "account" }) {
  return (
    <View style={styles.bottomNav}>
      {navItems.map((item) => (
        <Pressable key={item.key} onPress={() => router.push(item.route)} style={styles.navItem}>
          <Text style={[styles.navIcon, item.key === active && styles.navActive]}>{item.icon}</Text>
          <Text style={[styles.navLabel, item.key === active && styles.navActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function EmptyState({ icon = "✦", title, description, action }: { icon?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <SurfaceCard style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.navyDark, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 30, overflow: "hidden" },
  headerCompact: { paddingBottom: 22 },
  headerOrbOne: { position: "absolute", width: 130, height: 130, borderRadius: 65, backgroundColor: "rgba(255,255,255,.04)", end: -42, top: -40 },
  headerOrbTwo: { position: "absolute", width: 92, height: 92, borderRadius: 46, borderWidth: 18, borderColor: "rgba(255,255,255,.035)", start: -30, bottom: -38 },
  eyebrow: { color: colors.gold, fontSize: 11, fontWeight: "800", textAlign: "right", marginBottom: 8 },
  headerTitle: { color: "#FFF", fontSize: 25, lineHeight: 34, fontWeight: "900", textAlign: "right" },
  headerSubtitle: { color: "#CFD9ED", fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 7 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, ...shadow.card },
  sectionHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "right" },
  sectionAction: { color: colors.navy, fontSize: 12, fontWeight: "800" },
  button: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.navy },
  buttonGold: { backgroundColor: colors.gold },
  buttonGoldText: { color: colors.navyDeep },
  buttonOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.navy },
  buttonSoft: { backgroundColor: colors.blueSoft },
  buttonOutlineText: { color: colors.navy },
  buttonText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  fieldWrap: { gap: 7 },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: "800", textAlign: "right" },
  optional: { color: colors.subtle, fontWeight: "500" },
  field: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, color: colors.text, paddingHorizontal: 14, fontSize: 13 },
  fieldMultiline: { minHeight: 92, paddingTop: 14, textAlignVertical: "top" },
  choice: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 },
  choiceSelected: { borderColor: colors.navy, backgroundColor: colors.blueSoft, borderWidth: 1.5 },
  choiceMain: { flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1 },
  choiceCopy: { flex: 1 },
  choiceIcon: { fontSize: 22 },
  choiceTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900", textAlign: "right" },
  choiceTitleSelected: { color: colors.navy },
  choiceSubtitle: { color: colors.muted, fontSize: 10.5, lineHeight: 17, textAlign: "right", marginTop: 3 },
  choiceMeta: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  choiceMetaSelected: { color: colors.navy },
  steps: { flexDirection: "row-reverse", justifyContent: "space-between", backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepItem: { flex: 1, alignItems: "center", gap: 5 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF0F4" },
  stepCircleActive: { backgroundColor: colors.navy },
  stepCircleDone: { backgroundColor: colors.success },
  stepNumber: { color: colors.subtle, fontSize: 10, fontWeight: "900" },
  stepNumberActive: { color: "#FFF" },
  stepLabel: { color: colors.subtle, fontSize: 8.5, textAlign: "center" },
  stepLabelActive: { color: colors.navy, fontWeight: "900" },
  bottomNav: { position: "absolute", start: 12, end: 12, bottom: 10, minHeight: 64, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", ...shadow.card },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 8 },
  navIcon: { color: colors.subtle, fontSize: 19, fontWeight: "900" },
  navLabel: { color: colors.subtle, fontSize: 9, fontWeight: "700" },
  navActive: { color: colors.navy },
  empty: { alignItems: "center", paddingVertical: 28 },
  emptyIcon: { fontSize: 30 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 15, marginTop: 10 },
  emptyDescription: { color: colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 5 },
});
