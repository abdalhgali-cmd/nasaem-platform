import { useState } from "react";
import { router,useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { saveEgyptTravelPlan } from "../../src/api/tracking";
import type { UploadAsset } from "../../src/api/requests";
import { colors } from "../../src/theme";

export default function EgyptTravelPlanScreen(){
 const {id}=useLocalSearchParams<{id:string}>();
 const [entryMode,setEntryMode]=useState<"AIR"|"BORDER">("AIR");
 const [bookingStatus,setBookingStatus]=useState<"EXISTING"|"NEEDS_NASAEM">("EXISTING");
 const [entryDate,setEntryDate]=useState("");
 const [file,setFile]=useState<UploadAsset|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [done,setDone]=useState("");

 async function pick(){
  const r=await DocumentPicker.getDocumentAsync({type:["image/jpeg","image/png","image/webp","application/pdf"],copyToCacheDirectory:true,multiple:false});
  if(r.canceled)return;
  const a=r.assets[0];
  setFile({uri:a.uri,name:a.name,mimeType:a.mimeType,label:"تذكرة / حجز السفر"});
 }
 async function submit(){
  try{
   setBusy(true);setError("");setDone("");
   if(!/^\d{4}-\d{2}-\d{2}$/.test(entryDate))throw new Error("اكتب التاريخ بصيغة YYYY-MM-DD");
   if(bookingStatus==="EXISTING"&&!file)throw new Error("ارفع التذكرة أو الحجز الموجود");
   const r=await saveEgyptTravelPlan(id,{entryMode,bookingStatus,entryDate},file);
   setDone(r.message);
  }catch(e){setError(e instanceof Error?e.message:"تعذر حفظ بيانات السفر");}
  finally{setBusy(false);}
 }

 if(done)return <SafeAreaView style={s.safe}><View style={s.success}><Text style={s.check}>✓</Text><Text style={s.title}>تم حفظ بيانات السفر</Text><Text style={s.desc}>{done}</Text><Pressable style={s.primary} onPress={()=>router.back()}><Text style={s.primaryText}>العودة للطلب</Text></Pressable></View></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.title}>بيانات السفر والتعميم</Text>
  <Text style={s.desc}>بعد صدور الموافقة الأمنية، أدخل بيانات الرحلة حتى يكمل فريق نسائم الحرمين إجراءات التعميم أو الحجز.</Text>
  <Text style={s.label}>طريقة الدخول</Text>
  <View style={s.chips}>
   {[["AIR","جوي"],["BORDER","بري"]].map(([v,l])=><Pressable key={v} style={[s.chip,entryMode===v&&s.active]} onPress={()=>setEntryMode(v as "AIR"|"BORDER")}><Text style={entryMode===v?s.activeText:s.chipText}>{l}</Text></Pressable>)}
  </View>
  <Text style={s.label}>الحجز</Text>
  <View style={s.chips}>
   {[["EXISTING","عندي حجز"],["NEEDS_NASAEM","أريد نسائم تحجز لي"]].map(([v,l])=><Pressable key={v} style={[s.chip,bookingStatus===v&&s.active]} onPress={()=>{setBookingStatus(v as "EXISTING"|"NEEDS_NASAEM");if(v==="NEEDS_NASAEM")setFile(null);}}><Text style={bookingStatus===v?s.activeText:s.chipText}>{l}</Text></Pressable>)}
  </View>
  <Text style={s.label}>تاريخ الدخول</Text>
  <TextInput value={entryDate} onChangeText={setEntryDate} placeholder="2026-10-15" style={s.input} textAlign="right"/>
  {bookingStatus==="EXISTING"&&<View style={s.fileBox}><Text style={s.fileTitle}>التذكرة / إثبات الحجز</Text><Pressable style={[s.fileButton,file&&s.fileDone]} onPress={file?()=>setFile(null):pick}><Text style={file?s.fileDoneText:s.fileButtonText}>{file?"✓ "+file.name:"اختيار ملف"}</Text></Pressable></View>}
  {!!error&&<Text style={s.error}>{error}</Text>}
  <Pressable disabled={busy||!entryDate} style={[s.primary,(busy||!entryDate)&&s.disabled]} onPress={submit}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>حفظ وإرسال للوكالة</Text>}</Pressable>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:12},success:{flex:1,padding:26,justifyContent:"center",gap:14},check:{fontSize:42,color:colors.success,textAlign:"center",fontWeight:"900"},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:20},label:{fontSize:11,color:colors.muted,textAlign:"right"},chips:{flexDirection:"row-reverse",gap:8,flexWrap:"wrap"},chip:{borderWidth:1,borderColor:colors.border,borderRadius:999,paddingHorizontal:13,paddingVertical:9,backgroundColor:"#FFF"},active:{backgroundColor:colors.navy,borderColor:colors.navy},chipText:{fontSize:11,color:colors.text},activeText:{fontSize:11,color:"#FFF",fontWeight:"800"},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12},fileBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,gap:8},fileTitle:{fontSize:11.5,fontWeight:"700",color:colors.text,textAlign:"right"},fileButton:{backgroundColor:colors.navy,borderRadius:9,padding:11},fileButtonText:{color:"#FFF",fontWeight:"800",textAlign:"center"},fileDone:{backgroundColor:"#E8F7ED"},fileDoneText:{color:colors.success,fontWeight:"800",textAlign:"center"},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.45},error:{fontSize:11,color:colors.danger,textAlign:"right"}});
