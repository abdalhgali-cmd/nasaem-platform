import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { approveTrackedInvoice, getTrackedRequests, markTrackedTransferSent, rejectTrackedInvoice, requestTrackingCode, TrackedRequest, verifyTrackingCode } from "../src/api/tracking";
import { colors } from "../src/theme";

export default function TrackScreen(){
  const params=useLocalSearchParams<{requestId?:string;phone?:string}>();
  const [phone,setPhone]=useState(params.phone??"");
  const [requestNo,setRequestNo]=useState(params.requestId??"");
  const [code,setCode]=useState("");
  const [stage,setStage]=useState<"request"|"verify"|"results">("request");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [items,setItems]=useState<TrackedRequest[]>([]);

  async function sendCode(){try{setBusy(true);setMessage("");const r=await requestTrackingCode(phone);setStage("verify");setMessage(r.message);}catch(e){setMessage(e instanceof Error?e.message:"تعذر إرسال الرمز");}finally{setBusy(false);}}
  async function verify(){try{setBusy(true);setMessage("");await verifyTrackingCode(phone,code);const all=await getTrackedRequests();setItems(requestNo.trim()?all.filter(x=>String(x.id).toLowerCase()===requestNo.trim().toLowerCase()):all);setStage("results");}catch(e){setMessage(e instanceof Error?e.message:"تعذر التحقق");}finally{setBusy(false);}}
  async function action(fn:()=>Promise<unknown>){try{setBusy(true);setMessage("");await fn();setItems(await getTrackedRequests());setMessage("تم تحديث الطلب.");}catch(e){setMessage(e instanceof Error?e.message:"تعذر تنفيذ العملية");}finally{setBusy(false);}}

  if(stage==="results") return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>طلباتك</Text>{!!message&&<Text style={s.message}>{message}</Text>}{items.length===0?<View style={s.card}><Text style={s.desc}>لم يتم العثور على طلب مطابق لهذا الرقم لهذا الهاتف.</Text></View>:items.map(item=><View key={item.id} style={s.card}><Text style={s.cardTitle}>{item.service??"طلب خدمة"}</Text><Text style={s.id}>{item.id}</Text><Text style={s.status}>{item.statusLabel??item.status??"قيد المراجعة"}</Text>{item.invoice&&<View style={s.invoice}><Text style={s.value}>{item.invoice.amount??""} {item.invoice.currency??""}</Text><Text style={s.label}>عرض السعر</Text></View>}{item.invoice?.status==="PENDING"&&<View style={s.actions}><Pressable style={s.reject} disabled={busy} onPress={()=>action(()=>rejectTrackedInvoice(item.id))}><Text style={s.rejectText}>رفض السعر</Text></Pressable><Pressable style={s.primarySmall} disabled={busy} onPress={()=>action(()=>approveTrackedInvoice(item.id))}><Text style={s.primaryText}>الموافقة على السعر</Text></Pressable></View>}{item.paymentStatus==="AWAITING_TRANSFER"&&<Pressable style={s.primary} disabled={busy} onPress={()=>action(()=>markTrackedTransferSent(item.id))}><Text style={s.primaryText}>تم تحويل المبلغ</Text></Pressable>}</View>)}</ScrollView></SafeAreaView>;

  return <SafeAreaView style={s.safe}><View style={s.page}><Text style={s.title}>تتبع الطلب</Text>{stage==="request"?<><Text style={s.desc}>أدخل رقم الهاتف المستخدم عند التقديم. رقم الطلب اختياري لتصفية النتيجة.</Text><TextInput value={phone} onChangeText={setPhone} placeholder="رقم الهاتف" keyboardType="phone-pad" style={s.input} textAlign="right"/><TextInput value={requestNo} onChangeText={setRequestNo} placeholder="رقم الطلب (اختياري)" style={s.input} textAlign="right"/><Pressable disabled={busy||phone.trim().length<6} onPress={sendCode} style={[s.primary,(busy||phone.trim().length<6)&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>إرسال رمز التحقق</Text>}</Pressable></>:<><Text style={s.desc}>أدخل رمز التحقق الذي تم إرساله إلى رقمك.</Text><TextInput value={code} onChangeText={setCode} placeholder="رمز التحقق" keyboardType="number-pad" maxLength={6} style={s.input} textAlign="center"/><Pressable disabled={busy||code.length!==6} onPress={verify} style={[s.primary,(busy||code.length!==6)&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>عرض الطلبات</Text>}</Pressable><Pressable onPress={()=>setStage("request")}><Text style={s.link}>تغيير رقم الهاتف</Text></Pressable></>}{!!message&&<Text style={s.message}>{message}</Text>}</View></SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:14},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:12,color:colors.muted,textAlign:"right",lineHeight:20},
 input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:13,fontSize:13},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14},primarySmall:{backgroundColor:colors.navy,borderRadius:9,padding:11,flex:1},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.45},message:{fontSize:11,color:colors.muted,textAlign:"right",lineHeight:18},
 card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,gap:8},cardTitle:{fontSize:14,fontWeight:"800",color:colors.text,textAlign:"right"},id:{fontFamily:"monospace",fontSize:11,color:colors.subtle,textAlign:"right"},status:{fontSize:12,fontWeight:"700",color:colors.navy,textAlign:"right"},invoice:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",backgroundColor:colors.soft,borderRadius:9,padding:10},label:{fontSize:10,color:colors.muted},value:{fontSize:13,fontWeight:"800",color:colors.text},
 actions:{flexDirection:"row-reverse",gap:8},reject:{borderWidth:1,borderColor:colors.danger,borderRadius:9,padding:11,flex:1},rejectText:{color:colors.danger,fontWeight:"700",textAlign:"center"},link:{color:colors.navy,fontWeight:"700",textAlign:"center"}
});
