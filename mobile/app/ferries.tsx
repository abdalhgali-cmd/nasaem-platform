import { useEffect,useMemo,useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View } from "react-native";
import { FerryOperator,FerrySchedule,getPublicFerries } from "../src/api/travel";
import { colors } from "../src/theme";

export default function FerriesScreen(){
 const [operators,setOperators]=useState<FerryOperator[]>([]);
 const [schedules,setSchedules]=useState<FerrySchedule[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{getPublicFerries().then(r=>{setOperators(r.operators);setSchedules(r.schedules);}).catch(()=>setError("تعذر تحميل مواعيد البواخر")).finally(()=>setLoading(false));},[]);
 const operatorMap=useMemo(()=>Object.fromEntries(operators.map(o=>[o.id,o])),[operators]);

 function select(sc:FerrySchedule){
  const op=operatorMap[sc.operatorId];
  router.push({pathname:"/request/[kind]",params:{
   kind:"ferries",origin:sc.origin,destination:sc.destination,date:sc.travelDate,
   operatorName:op?.name??"",scheduleId:sc.id,departureTime:sc.departureTime??"",
   basePrice:String(sc.basePrice??""),currency:sc.currency??"SAR",
  }});
 }

 if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/><Text>جاري تحميل المواعيد…</Text></View>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.title}>حجوزات البواخر</Text><Text style={s.desc}>المواعيد والشركات أدناه من لوحة الإدارة مباشرة.</Text>
  {!!error&&<Text style={s.error}>{error}</Text>}
  {schedules.length===0?<View style={s.empty}><Text style={s.desc}>لا توجد مواعيد منشورة حاليًا.</Text><Pressable onPress={()=>router.push({pathname:"/request/[kind]",params:{kind:"ferries"}})}><Text style={s.link}>إرسال طلب حجز للوكالة</Text></Pressable></View>:schedules.map(sc=>{
   const op=operatorMap[sc.operatorId];
   return <View key={sc.id} style={s.card}>
    <View style={s.row}><Text style={s.operator}>{op?.name??"شركة الباخرة"}</Text><Text style={s.price}>{sc.basePrice} {sc.currency}</Text></View>
    <Text style={s.route}>{sc.origin} → {sc.destination}</Text>
    <Text style={s.meta}>{formatDate(sc.travelDate)} {sc.departureTime?"· "+sc.departureTime:""} {sc.arrivalTime?"→ "+sc.arrivalTime:""}</Text>
    {sc.capacity!=null&&<Text style={s.meta}>السعة المنشورة: {sc.capacity}</Text>}
    <Pressable style={s.primary} onPress={()=>select(sc)}><Text style={s.primaryText}>اختيار هذا الموعد</Text></Pressable>
   </View>;
  })}
 </ScrollView></SafeAreaView>;
}
function formatDate(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString();}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},page:{padding:18,gap:11,paddingBottom:40},title:{fontSize:21,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},error:{fontSize:11,color:colors.danger,textAlign:"right"},empty:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:13,padding:16,gap:8},link:{color:colors.navy,fontWeight:"800",textAlign:"right"},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,gap:7},row:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:8},operator:{fontSize:13,fontWeight:"900",color:colors.navy},price:{fontSize:12,fontWeight:"900",color:colors.gold},route:{fontSize:12.5,fontWeight:"800",color:colors.text,textAlign:"right"},meta:{fontSize:10.5,color:colors.muted,textAlign:"right"},primary:{backgroundColor:colors.navy,borderRadius:9,padding:11},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center",fontSize:11}});
