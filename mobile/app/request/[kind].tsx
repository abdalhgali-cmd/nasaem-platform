import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { submitContactRequest } from "../../src/api/requests";
import { colors } from "../../src/theme";

type Meta = { title: string; fields: string[]; note: string; nameField: string; phoneField: string; travelerField?: string };
const META: Record<string, Meta> = {
  flights: { title:"حجز الطيران", fields:["الاسم الكامل","مدينة المغادرة","الوجهة","تاريخ السفر","تاريخ العودة (اختياري)","عدد المسافرين","الدرجة المفضلة","رقم الهاتف"], note:"سنراجع الرحلة والسعر والتوفر قبل تأكيد الدفع.", nameField:"الاسم الكامل", phoneField:"رقم الهاتف", travelerField:"عدد المسافرين" },
  visas: { title:"التأشيرات", fields:["الدولة","نوع التأشيرة","الاسم حسب الجواز","رقم الجواز","الجنسية","تاريخ السفر المتوقع","رقم الهاتف"], note:"المتطلبات والسعر النهائي يعتمدان على نوع التأشيرة المنشور من الإدارة.", nameField:"الاسم حسب الجواز", phoneField:"رقم الهاتف" },
  ferries: { title:"حجز البواخر", fields:["الاسم الكامل","ميناء المغادرة","ميناء الوصول","تاريخ السفر","عدد المسافرين","شركة الباخرة (اختياري)","رقم الهاتف"], note:"سيتم تأكيد المقاعد والسعر بعد مراجعة الوكالة.", nameField:"الاسم الكامل", phoneField:"رقم الهاتف", travelerField:"عدد المسافرين" },
  hotels: { title:"الفنادق والسياحة", fields:["الاسم الكامل","المدينة / الوجهة","تاريخ الدخول","تاريخ الخروج","عدد النزلاء","عدد الغرف","ملاحظات","رقم الهاتف"], note:"نراجع التوفر ونرسل العرض قبل الدفع.", nameField:"الاسم الكامل", phoneField:"رقم الهاتف", travelerField:"عدد النزلاء" },
  egypt: { title:"الموافقة الأمنية لمصر", fields:["الاسم حسب الجواز","رقم الجواز","الجنسية","تاريخ الميلاد","طريقة السفر (جوي / بري)","منفذ الوصول","رقم الهاتف"], note:"سنراجع البيانات والمستندات قبل اعتماد الموافقة.", nameField:"الاسم حسب الجواز", phoneField:"رقم الهاتف" },
  family: { title:"الزيارة العائلية السعودية", fields:["اسم مقدم الطلب","رقم الطلب / التأشيرة إن وجد","صلة القرابة","عدد الزوار","مرحلة المعاملة الحالية","رقم الهاتف"], note:"يمكن متابعة مراحل الطلب بعد إنشائه من صفحة التتبع.", nameField:"اسم مقدم الطلب", phoneField:"رقم الهاتف", travelerField:"عدد الزوار" },
};

export default function ServiceRequest() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const meta = META[kind ?? ""] ?? { title:"طلب خدمة", fields:["الاسم","رقم الهاتف","ملاحظات"], note:"سيتم مراجعة الطلب من الوكالة.", nameField:"الاسم", phoneField:"رقم الهاتف" };
  const [values,setValues]=useState<Record<string,string>>({});
  const [review,setReview]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [requestId,setRequestId]=useState<string|null>(null);

  const complete=useMemo(
    ()=>meta.fields.filter(x=>!x.includes("اختياري")&&!x.includes("ملاحظات")&&!x.includes("إن وجد")).every(x=>values[x]?.trim()),
    [values,meta.fields],
  );

  async function submit() {
    try {
      setBusy(true); setError("");
      const travelerCountRaw=meta.travelerField ? Number(values[meta.travelerField]) : undefined;
      const structuredTraveler =
        kind==="visas" || kind==="egypt"
          ? [{ fullName: values[meta.nameField], passportNo: values["رقم الجواز"] || undefined, nationality: values["الجنسية"] || undefined, birthDate: values["تاريخ الميلاد"] || undefined, isPrimary:true }]
          : undefined;
      const id=await submitContactRequest({
        name: values[meta.nameField],
        phone: values[meta.phoneField],
        service: meta.title,
        message: `طلب ${meta.title} عبر تطبيق نسائم الحرمين`,
        travelerCount: travelerCountRaw && travelerCountRaw > 0 ? travelerCountRaw : structuredTraveler?.length,
        intakeData: { kind: kind ?? "generic", fields: values },
        travelers: structuredTraveler,
      });
      setRequestId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  if(requestId) return <SafeAreaView style={s.safe}><View style={s.successPage}><Text style={s.successIcon}>✓</Text><Text style={s.title}>تم استلام طلبك</Text><Text style={s.desc}>تم حفظ الطلب فعليًا وسيظهر لفريق الإدارة.</Text><View style={s.requestBox}><Text style={s.label}>رقم الطلب</Text><Text style={s.requestId}>{requestId}</Text></View><Pressable style={s.primary} onPress={()=>router.push({pathname:"/track",params:{requestId,phone:values[meta.phoneField]}})}><Text style={s.primaryText}>متابعة الطلب</Text></Pressable><Pressable style={s.outline} onPress={()=>router.replace("/")}><Text style={s.outlineText}>العودة للرئيسية</Text></Pressable></View></SafeAreaView>;

  if(review) return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>مراجعة {meta.title}</Text>{meta.fields.map(f=>values[f]?<View key={f} style={s.review}><Text style={s.label}>{f}</Text><Text style={s.value}>{values[f]}</Text></View>:null)}<Text style={s.note}>{meta.note}</Text>{!!error&&<Text style={s.error}>{error}</Text>}<View style={s.actions}><Pressable style={s.outline} onPress={()=>setReview(false)} disabled={busy}><Text style={s.outlineText}>تعديل</Text></Pressable><Pressable style={s.primary} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>إرسال للوكالة</Text>}</Pressable></View></ScrollView></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>{meta.title}</Text><Text style={s.desc}>{meta.note}</Text>{meta.fields.map(f=><View key={f}><Text style={s.label}>{f}</Text><TextInput value={values[f]??""} onChangeText={v=>setValues(x=>({...x,[f]:v}))} placeholder={f} style={s.input} textAlign="right" multiline={f==="ملاحظات"} keyboardType={f.includes("عدد")||f==="رقم الهاتف"?"phone-pad":"default"}/></View>)}<Pressable disabled={!complete} style={[s.primary,!complete&&s.disabled]} onPress={()=>setReview(true)}><Text style={s.primaryText}>مراجعة الطلب</Text></Pressable></ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:12,paddingBottom:40},successPage:{flex:1,padding:26,justifyContent:"center",gap:14},
 title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},label:{fontSize:11,color:colors.muted,textAlign:"right",marginBottom:5},
 input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,fontSize:12.5,minHeight:44},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14,flex:2},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.4},
 review:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12},value:{fontSize:13,fontWeight:"700",color:colors.text,textAlign:"right"},note:{fontSize:11,color:colors.subtle,textAlign:"right",lineHeight:18},
 actions:{flexDirection:"row-reverse",gap:10},outline:{borderWidth:1.5,borderColor:colors.navy,borderRadius:10,padding:13,flex:1},outlineText:{color:colors.navy,fontWeight:"800",textAlign:"center"},error:{color:colors.danger,textAlign:"right",fontSize:11},
 successIcon:{fontSize:42,color:colors.success,textAlign:"center",fontWeight:"900"},requestBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:18},requestId:{fontFamily:"monospace",fontSize:17,fontWeight:"900",color:colors.navy,textAlign:"center",marginTop:6}
});
