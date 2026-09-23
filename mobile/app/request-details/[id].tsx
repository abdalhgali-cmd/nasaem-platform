import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  approveTrackedInvoice,
  chooseTrackedPaymentCurrency,
  getTrackedRequests,
  markTrackedTransferSent,
  rejectTrackedInvoice,
  selectTrackedOffer,
  TrackedRequest,
  uploadTrackedDocument,
  uploadTrackedPaymentReceipt,
} from "../../src/api/tracking";
import { colors } from "../../src/theme";

export default function RequestDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<TrackedRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const all = await getTrackedRequests();
    setItem(all.find((request) => request.id === id) ?? null);
  }, [id]);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الطلب")
    );
  }, [load]);

  async function action(fn: () => Promise<unknown>, success = "تم تحديث الطلب") {
    try {
      setBusy(true);
      setMessage("");
      await fn();
      await load();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPayment() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    await action(async () => {
      await uploadTrackedPaymentReceipt(id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        label: "إشعار الدفع",
      });
      await markTrackedTransferSent(id);
    }, "تم رفع الإشعار وإرساله للمراجعة");
  }

  async function uploadChecklistDocument(next: NonNullable<TrackedRequest["nextActions"]>[number]) {
    if (!next.requirementId) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const label = next.label.replace(/^إعادة رفع:\s*|^رفع:\s*/, "");
    await action(
      () =>
        uploadTrackedDocument(
          id,
          {
            label,
            requirementId: next.requirementId,
            travelerId: next.travelerId,
          },
          {
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType,
            label,
          }
        ),
      "تم رفع المستند للمراجعة"
    );
  }

  const timeline = useMemo(() => (item ? buildTimeline(item) : []), [item]);
  const isEgypt =
    item?.visaType?.code === "VISA-EGYPT-CLEARANCE" ||
    /مصر/i.test(item?.service ?? "");
  const hasResult = Boolean(item?.deliverables?.length);

  if (!item) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Text style={s.muted}>{message || "بنفتح الطلب…"}</Text>
      </View>
    );
  }

  const documentActions = (item.nextActions ?? []).filter(
    (next) => next.code === "UPLOAD_DOCUMENT" || next.code === "REPLACE_DOCUMENT"
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.orbOne} />
          <View style={s.orbTwo} />
          <Pressable style={s.back} onPress={() => router.back()}>
            <Text style={s.backText}>‹</Text>
          </Pressable>
          <Text style={s.kicker}>تفاصيل الطلب</Text>
          <Text style={s.title}>{item.service ?? item.visaType?.name ?? "طلب خدمة"}</Text>
          <Text style={s.requestNo}>{"#" + item.id}</Text>
        </View>

        <View style={s.stateCard}>
          <Text style={s.stateLabel}>آخر تحديث</Text>
          <Text style={s.stateTitle}>{item.statusLabel ?? "قيد المراجعة"}</Text>
          {item.nextActions?.[0] ? (
            <View style={s.actionHighlight}>
              <Text style={s.actionHighlightLabel}>مطلوب منك الآن</Text>
              <Text style={s.actionHighlightText}>{item.nextActions[0].label}</Text>
            </View>
          ) : (
            <Text style={s.stateText}>ما عليك أي إجراء حالياً — نحن بنتابع الطلب.</Text>
          )}
        </View>

        {item.invoice?.status === "PENDING" ? (
          <View style={s.card}>
            <Text style={s.cardKicker}>السعر المعتمد من الوكالة</Text>
            <Text style={s.bigPrice}>
              {formatAmount(item.invoice.amount) + " " + (item.invoice.currency ?? "")}
            </Text>
            <Text style={s.helper}>راجع السعر واعتمده عشان نفتح مرحلة الدفع.</Text>
            <View style={s.rowActions}>
              <Pressable
                disabled={busy}
                style={s.rejectButton}
                onPress={() => action(() => rejectTrackedInvoice(item.id), "تم رفض السعر")}
              >
                <Text style={s.rejectText}>رفض</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                style={s.goldButton}
                onPress={() => action(() => approveTrackedInvoice(item.id), "تم اعتماد السعر")}
              >
                <Text style={s.goldButtonText}>اعتماد السعر</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {item.offers?.length && !item.selectedOfferId ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>العروض المتاحة</Text>
            {item.offers.map((offer) => (
              <View key={offer.id} style={s.offer}>
                <View style={s.offerCopy}>
                  <Text style={s.offerTitle}>{offer.carrier ?? "عرض"}</Text>
                  {offer.description ? <Text style={s.helper}>{offer.description}</Text> : null}
                </View>
                <Pressable
                  disabled={busy}
                  style={s.offerButton}
                  onPress={() =>
                    action(() => selectTrackedOffer(item.id, offer.id), "تم اختيار العرض")
                  }
                >
                  <Text style={s.offerButtonText}>
                    {formatAmount(offer.amount) + " " + (offer.currency ?? "")}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {item.paymentStatus === "AWAITING_TRANSFER" ? (
          <View style={s.card}>
            <Text style={s.cardKicker}>الدفع</Text>
            <Text style={s.cardTitle}>اختار العملة المناسبة ليك</Text>

            {(item.paymentOptions ?? []).length > 1 ? (
              <View style={s.currencyRow}>
                {(item.paymentOptions ?? []).map((currency) => (
                  <Pressable
                    key={currency}
                    disabled={busy}
                    onPress={() =>
                      void action(
                        () => chooseTrackedPaymentCurrency(item.id, currency),
                        "تم اختيار عملة الدفع"
                      )
                    }
                    style={[
                      s.currencyChip,
                      item.paymentCurrency === currency && s.currencyChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.currencyText,
                        item.paymentCurrency === currency && s.currencyTextActive,
                      ]}
                    >
                      {currency}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={s.amountBox}>
              <Text style={s.amountLabel}>المبلغ المطلوب</Text>
              <Text style={s.bigPrice}>
                {(item.paymentAmount != null ? formatAmount(item.paymentAmount) : "—") +
                  " " +
                  (item.paymentCurrency ?? "")}
              </Text>
              {item.paymentCurrency === "SDG" &&
              item.paymentBaseCurrency &&
              item.paymentBaseCurrency !== "SDG" ? (
                <Text style={s.helper}>
                  {"الأصل: " +
                    formatAmount(item.paymentBaseAmount) +
                    " " +
                    item.paymentBaseCurrency +
                    (item.paymentFxRate ? " · سعر الصرف " + formatAmount(item.paymentFxRate) : "")}
                </Text>
              ) : null}
            </View>

            <Text style={s.cardTitle}>الحسابات</Text>
            {item.paymentAccounts?.length ? (
              item.paymentAccounts.map((account) => (
                <View key={account.id} style={s.account}>
                  <Text style={s.accountName}>
                    {account.name ?? account.bankName ?? "حساب الدفع"}
                  </Text>
                  <Text selectable style={s.accountNumber}>
                    {account.accountNumber ?? account.iban ?? ""}
                  </Text>
                  {account.accountName ? <Text style={s.helper}>{account.accountName}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={s.warning}>ما في حساب نشط لهذه العملة حالياً.</Text>
            )}

            <Pressable
              disabled={busy || !item.paymentAccounts?.length}
              style={[
                s.goldButton,
                (!item.paymentAccounts?.length || busy) && s.disabled,
              ]}
              onPress={() => void uploadPayment()}
            >
              {busy ? (
                <ActivityIndicator color={colors.navyDark} />
              ) : (
                <Text style={s.goldButtonText}>رفع إشعار السداد</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {item.paymentStatus === "UNDER_REVIEW" ? (
          <View style={s.waitCard}>
            <Text style={s.waitIcon}>◷</Text>
            <View style={s.waitCopy}>
              <Text style={s.waitTitle}>إشعار الدفع وصلنا</Text>
              <Text style={s.helper}>
                الموظف بيراجع التحويل، وحننبهك أول ما يتم التأكيد.
              </Text>
            </View>
          </View>
        ) : null}

        {documentActions.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>مستندات مطلوبة منك</Text>
            {documentActions.map((next, index) => (
              <View key={(next.requirementId ?? "doc") + "-" + index} style={s.documentAction}>
                <View style={s.documentCopy}>
                  <Text style={s.documentTitle}>{next.label}</Text>
                  {next.reason ? <Text style={s.reason}>{next.reason}</Text> : null}
                </View>
                <Pressable
                  disabled={busy}
                  style={s.uploadButton}
                  onPress={() => void uploadChecklistDocument(next)}
                >
                  <Text style={s.uploadText}>رفع</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {hasResult ? (
          <View style={s.celebration}>
            <Text style={s.celebrationEmoji}>🎉</Text>
            <Text style={s.celebrationTitle}>{resultTitle(item)}</Text>
            <Text style={s.celebrationText}>
              {item.deliverables?.length === 1
                ? item.deliverables[0]?.label ?? "الملف النهائي جاهز"
                : String(item.deliverables?.length ?? 0) + " ملفات جاهزة في طلبك"}
            </Text>
            {isEgypt ? (
              <Pressable
                style={s.primaryButton}
                onPress={() =>
                  router.push({ pathname: "/egypt-plan/[id]", params: { id: item.id } })
                }
              >
                <Text style={s.primaryButtonText}>التعميم / حجز رحلتك</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={s.card}>
          <Text style={s.cardTitle}>مسار الطلب</Text>
          {timeline.map((step, index) => (
            <TimelineRow
              key={step.title}
              title={step.title}
              subtitle={step.subtitle}
              state={step.state}
              last={index === timeline.length - 1}
            />
          ))}
        </View>

        {message ? <Text style={s.message}>{message}</Text> : null}

        <Pressable
          style={s.refresh}
          disabled={busy}
          onPress={() => void action(load, "تم تحديث الطلب")}
        >
          <Text style={s.refreshText}>تحديث الطلب</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function buildTimeline(item: TrackedRequest) {
  const checklist = item.checklist ?? [];
  const documentsDone =
    !checklist.length ||
    checklist.every(
      (row) => !row.required || row.state === "ACCEPTED" || row.state === "ANSWERED"
    );
  const priceDone =
    item.invoice?.status === "APPROVED" ||
    Boolean(item.selectedOfferId) ||
    ["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED"].includes(item.paymentStatus ?? "");
  const paymentDone = item.paymentStatus === "CONFIRMED";
  const finished = item.status === "CLOSED" || Boolean(item.deliverables?.length);

  return [
    { title: "تم استلام الطلب", subtitle: "البيانات محفوظة في النظام", state: "done" as const },
    {
      title: "مراجعة المستندات",
      subtitle: documentsDone ? "تمت مراجعة المطلوب" : "جاري المراجعة أو مطلوب استكمال",
      state: documentsDone ? ("done" as const) : ("active" as const),
    },
    {
      title: "اعتماد السعر",
      subtitle: priceDone ? "تم تحديد السعر" : "يظهر بعد قبول الطلب",
      state: priceDone ? ("done" as const) : ("pending" as const),
    },
    {
      title: "الدفع",
      subtitle:
        item.paymentStatus === "UNDER_REVIEW"
          ? "إشعار السداد تحت المراجعة"
          : paymentDone
            ? "تم تأكيد الدفع"
            : "بعد اعتماد السعر",
      state: paymentDone
        ? ("done" as const)
        : item.paymentStatus
          ? ("active" as const)
          : ("pending" as const),
    },
    {
      title: "إصدار الخدمة",
      subtitle: finished ? "النتيجة جاهزة" : "نرسل ليك التحديث فور صدوره",
      state: finished
        ? ("done" as const)
        : paymentDone
          ? ("active" as const)
          : ("pending" as const),
    },
  ];
}

function TimelineRow({
  title,
  subtitle,
  state,
  last,
}: {
  title: string;
  subtitle: string;
  state: "done" | "active" | "pending";
  last: boolean;
}) {
  return (
    <View style={s.timelineRow}>
      <View style={s.timelineCopy}>
        <Text style={[s.timelineTitle, state === "active" && s.timelineTitleActive]}>
          {title}
        </Text>
        <Text style={s.helper}>{subtitle}</Text>
      </View>
      <View style={s.timelineRail}>
        <View
          style={[
            s.timelineDot,
            state === "done" && s.timelineDone,
            state === "active" && s.timelineActive,
          ]}
        >
          <Text
            style={[
              s.timelineDotText,
              state !== "pending" && s.timelineDotTextActive,
            ]}
          >
            {state === "done" ? "✓" : state === "active" ? "•" : ""}
          </Text>
        </View>
        {!last ? <View style={s.timelineLine} /> : null}
      </View>
    </View>
  );
}

function resultTitle(item: TrackedRequest) {
  const text =
    (item.service ?? "") +
    " " +
    (item.visaType?.name ?? "") +
    " " +
    (item.visaType?.code ?? "");
  if (/عمرة/i.test(text)) return "مبروك، صدرت تأشيرة العمرة";
  if (/مصر|EGYPT/i.test(text)) return "موافقتك تمت";
  if (/زيارة|FAMILY/i.test(text)) return "مبروك، صدرت تأشيرة الزيارة";
  return "طلبك اكتمل";
}

function formatAmount(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  if (Math.round(number * 100) / 100 === Math.round(number)) {
    return Math.round(number).toLocaleString();
  }
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},
  center:{flex:1,justifyContent:"center",alignItems:"center",gap:10,backgroundColor:colors.background},
  muted:{color:colors.muted,fontSize:10,textAlign:"right"},
  page:{paddingBottom:38},
  hero:{overflow:"hidden",backgroundColor:colors.navyDark,minHeight:176,paddingHorizontal:18,paddingTop:22,paddingBottom:20,justifyContent:"flex-end"},
  orbOne:{position:"absolute",width:140,height:140,borderRadius:70,backgroundColor:"rgba(11,61,145,.54)",left:-42,top:-45},
  orbTwo:{position:"absolute",width:76,height:76,borderRadius:38,backgroundColor:"rgba(212,175,55,.14)",right:-12,top:54},
  back:{position:"absolute",left:16,top:18,width:38,height:38,borderRadius:19,backgroundColor:"rgba(255,255,255,.12)",alignItems:"center",justifyContent:"center"},
  backText:{color:"#FFF",fontSize:28,lineHeight:30},
  kicker:{color:colors.gold,fontSize:10,fontWeight:"900",textAlign:"right"},
  title:{color:"#FFF",fontSize:22,fontWeight:"900",textAlign:"right",marginTop:5},
  requestNo:{color:"#BFCBE2",fontSize:9.5,textAlign:"right",marginTop:4},
  stateCard:{marginHorizontal:16,marginTop:-14,backgroundColor:"#FFF",borderRadius:20,borderWidth:1,borderColor:colors.border,padding:16},
  stateLabel:{color:colors.gold,fontSize:9,fontWeight:"900",textAlign:"right"},
  stateTitle:{color:colors.text,fontSize:16,fontWeight:"900",textAlign:"right",marginTop:4},
  stateText:{color:colors.muted,fontSize:10,lineHeight:17,textAlign:"right",marginTop:5},
  actionHighlight:{backgroundColor:"#FFF9E9",borderRadius:13,padding:10,marginTop:10},
  actionHighlightLabel:{color:"#8A6800",fontSize:8.5,fontWeight:"900",textAlign:"right"},
  actionHighlightText:{color:colors.text,fontSize:10.5,fontWeight:"800",textAlign:"right",marginTop:2},
  card:{marginHorizontal:16,marginTop:12,backgroundColor:"#FFF",borderRadius:18,borderWidth:1,borderColor:colors.border,padding:14,gap:10},
  cardKicker:{color:colors.gold,fontSize:9,fontWeight:"900",textAlign:"right"},
  cardTitle:{color:colors.text,fontSize:13,fontWeight:"900",textAlign:"right"},
  helper:{color:colors.muted,fontSize:9.5,lineHeight:16,textAlign:"right"},
  bigPrice:{color:colors.navy,fontSize:23,fontWeight:"900",textAlign:"right",marginTop:2},
  rowActions:{flexDirection:"row-reverse",gap:8},
  goldButton:{flex:1,backgroundColor:colors.gold,borderRadius:14,paddingVertical:13,paddingHorizontal:12},
  goldButtonText:{color:colors.navyDark,fontSize:11.5,fontWeight:"900",textAlign:"center"},
  rejectButton:{flex:1,borderWidth:1,borderColor:colors.danger,borderRadius:14,paddingVertical:13},
  rejectText:{color:colors.danger,fontSize:11,fontWeight:"900",textAlign:"center"},
  offer:{flexDirection:"row-reverse",alignItems:"center",gap:10,borderTopWidth:1,borderTopColor:colors.border,paddingTop:9},
  offerCopy:{flex:1},
  offerTitle:{color:colors.text,fontSize:11.5,fontWeight:"900",textAlign:"right"},
  offerButton:{backgroundColor:"#EEF3FB",borderRadius:11,paddingHorizontal:11,paddingVertical:9},
  offerButtonText:{color:colors.navy,fontSize:10,fontWeight:"900"},
  currencyRow:{flexDirection:"row-reverse",gap:8,flexWrap:"wrap"},
  currencyChip:{borderWidth:1,borderColor:colors.border,borderRadius:999,paddingHorizontal:16,paddingVertical:9,backgroundColor:"#FFF"},
  currencyChipActive:{backgroundColor:colors.navy,borderColor:colors.navy},
  currencyText:{color:colors.text,fontSize:10.5,fontWeight:"800"},
  currencyTextActive:{color:"#FFF"},
  amountBox:{backgroundColor:"#F8FAFD",borderRadius:14,padding:12},
  amountLabel:{color:colors.muted,fontSize:9,textAlign:"right"},
  account:{backgroundColor:"#F8FAFD",borderRadius:13,padding:11},
  accountName:{color:colors.text,fontSize:11,fontWeight:"900",textAlign:"right"},
  accountNumber:{color:colors.navy,fontSize:13,fontWeight:"900",textAlign:"right",marginTop:4},
  warning:{color:"#8A6800",backgroundColor:"#FFF9E9",padding:10,borderRadius:12,fontSize:9.5,textAlign:"right"},
  disabled:{opacity:.42},
  waitCard:{marginHorizontal:16,marginTop:12,backgroundColor:"#FFF9E9",borderRadius:18,padding:14,flexDirection:"row-reverse",gap:10,alignItems:"center"},
  waitIcon:{color:colors.gold,fontSize:24,fontWeight:"900"},
  waitCopy:{flex:1},
  waitTitle:{color:colors.text,fontSize:12,fontWeight:"900",textAlign:"right"},
  documentAction:{flexDirection:"row-reverse",gap:10,alignItems:"center",borderTopWidth:1,borderTopColor:colors.border,paddingTop:9},
  documentCopy:{flex:1},
  documentTitle:{color:colors.text,fontSize:10.5,fontWeight:"800",textAlign:"right"},
  reason:{color:colors.danger,fontSize:9,lineHeight:15,textAlign:"right",marginTop:3},
  uploadButton:{backgroundColor:colors.navy,borderRadius:999,paddingHorizontal:14,paddingVertical:8},
  uploadText:{color:"#FFF",fontSize:9.5,fontWeight:"900"},
  celebration:{marginHorizontal:16,marginTop:12,backgroundColor:"#F2FFF6",borderRadius:20,borderWidth:1,borderColor:"#D8F2DF",padding:18,alignItems:"center"},
  celebrationEmoji:{fontSize:42},
  celebrationTitle:{color:colors.text,fontSize:18,fontWeight:"900",textAlign:"center",marginTop:8},
  celebrationText:{color:colors.muted,fontSize:10,lineHeight:17,textAlign:"center",marginTop:4},
  primaryButton:{marginTop:13,backgroundColor:colors.navy,borderRadius:14,paddingHorizontal:18,paddingVertical:12,alignSelf:"stretch"},
  primaryButtonText:{color:"#FFF",fontSize:11,fontWeight:"900",textAlign:"center"},
  timelineRow:{flexDirection:"row-reverse",gap:10,minHeight:58},
  timelineCopy:{flex:1,paddingBottom:8},
  timelineTitle:{color:colors.text,fontSize:11.5,fontWeight:"800",textAlign:"right"},
  timelineTitleActive:{color:colors.navy,fontWeight:"900"},
  timelineRail:{alignItems:"center",width:30},
  timelineDot:{width:26,height:26,borderRadius:13,backgroundColor:"#E7ECF3",alignItems:"center",justifyContent:"center"},
  timelineDone:{backgroundColor:colors.success},
  timelineActive:{backgroundColor:colors.navy},
  timelineDotText:{color:colors.subtle,fontSize:11,fontWeight:"900"},
  timelineDotTextActive:{color:"#FFF"},
  timelineLine:{width:2,flex:1,backgroundColor:colors.border},
  message:{marginHorizontal:16,marginTop:12,color:colors.muted,fontSize:10,textAlign:"right"},
  refresh:{marginHorizontal:16,marginTop:12,borderWidth:1,borderColor:colors.border,borderRadius:14,padding:12,backgroundColor:"#FFF"},
  refreshText:{color:colors.navy,fontSize:10.5,fontWeight:"900",textAlign:"center"},
});
