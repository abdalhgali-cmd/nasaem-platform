// LEGACY / DEFERRED — mobile-admin surface.
// This Android app is customer-only; staff functionality is being
// consolidated into the Web Admin Portal (web/src/app/admin/), which is
// the canonical staff application going forward. This screen is kept only
// for continuity (still auth-gated behind staff login) and is no longer
// linked from any customer-facing navigation in this app. Do not add new
// mobile-admin functionality here — build it in web/src/app/admin/ instead.
import { useEffect,useState } from "react";
import { ActivityIndicator,Pressable,SafeAreaView,StyleSheet,Text,TextInput,View } from "react-native";
import { FxRates,getAdminFxRates,updateAdminFxRates } from "../../src/api/admin";
import { colors } from "../../src/theme";
const codes:(keyof FxRates)[]=["USD","SAR","AED","EGP","QAR"];
export default function AdminRatesScreen(){
 const [rates,setRates]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{getAdminFxRates().then(r=>setRates(Object.fromEntries(codes.map(c=>[c,String(r[c]??0)])))).catch(()=>setMessage("تعذر تحميل أسعار الصرف أو لا تملك الصلاحية.")).finally(()=>setLoading(false));},[]);
 async function save(){try{setBusy(true);setMessage("");const payload:object={};codes.forEach(c=>(payload as any)[c]=Number(rates[c])||0);const r=await updateAdminFxRates(payload as Partial<FxRates>);setRates(Object.fromEntries(codes.map(c=>[c,String(r[c]??0)])));setMessage("تم تحديث أسعار الصرف.");}catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ.");}finally{setBusy(false);}}
 if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/></View>;
 return <SafeAreaView style={s.safe}><View style={s.page}><Text style={s.title}>أسعار الصرف إلى الجنيه</Text><Text style={s.desc}>تُستخدم هذه القيم لحساب المقابل بالجنيه السوداني في الأسعار العامة.</Text>{codes.map(c=><View key={c} style={s.row}><Text style={s.code}>{c}</Text><TextInput value={rates[c]??""} onChangeText={v=>setRates(x=>({...x,[c]:v}))} keyboardType="decimal-pad" style={s.input} textAlign="right"/></View>)}{!!message&&<Text style={s.message}>{message}</Text>}<Pressable style={s.button} onPress={save} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>حفظ أسعار الصرف</Text>}</Pressable></View></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:"center",justifyContent:"center"},page:{padding:20,gap:12},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11,color:colors.muted,textAlign:"right",lineHeight:18},row:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:11,padding:10,flexDirection:"row-reverse",alignItems:"center",gap:10},code:{width:45,fontWeight:"900",color:colors.navy,textAlign:"center"},input:{flex:1,backgroundColor:colors.soft,borderRadius:8,padding:10},message:{fontSize:11,color:colors.gold,textAlign:"right",fontWeight:"700"},button:{backgroundColor:colors.navy,borderRadius:10,padding:14},buttonText:{color:"#FFF",fontWeight:"800",textAlign:"center"}});
