import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { FlightOption,searchFlights } from "../src/api/travel";
import { colors } from "../src/theme";

export default function FlightsScreen(){
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[date,setDate]=useState(""),[returnDate,setReturnDate]=useState("");
 const [travelers,setTravelers]=useState("1"),[tripType,setTripType]=useState<"ONE_WAY"|"ROUND_TRIP">("ONE_WAY");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[results,setResults]=useState<FlightOption[]>([]);

 async function search(){
  try{
   setBusy(true);setError("");setResults([]);
   if(!from.trim()||!to.trim()||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))throw new Error("أدخل من/إلى وتاريخ السفر بصيغة YYYY-MM-DD");
   if(tripType==="ROUND_TRIP"&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(returnDate))throw new Error("أدخل تاريخ العودة بصيغة YYYY-MM-DD");
   const r=await searchFlights({from:from.trim(),to:to.trim(),date,returnDate:tripType==="ROUND_TRIP"?returnDate:undefined,travelers:Math.max(1,Number(travelers)||1),tripType});
   const first=r.legs[0];
   setResults([...(first?.manual??[]),...(first?.trip??[])]);
   if(!(first?.manual?.length||first?.trip?.length))setError("لا توجد رحلات مطابقة منشورة حاليًا. يمكنك إرسال طلب بحث للوكالة.");
  }catch(e){setError(e instanceof Error?e.message:"تعذر البحث عن الرحلات");}
  finally{setBusy(false);}
 }

 function request(selected?:FlightOption){
  router.push({pathname:"/request/[kind]",params:{
   kind:"flights",from,to,date,returnDate:tripType==="ROUND_TRIP"?returnDate:"",travelers,
   tripType,selectedFlight:selected?JSON.stringify(selected):"",
  }});
 }

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.title}>بحث الطيران</Text><Text style={s.desc}>ابحث في الرحلات المنشورة والمتاحة من نظام نسائم الحرمين، ثم أرسل طلب الحجز للمراجعة.</Text>
  <View style={s.toggle}>{[["ONE_WAY","ذهاب فقط"],["ROUND_TRIP","ذهاب وعودة"]].map(([v,l])=><Pressable key={v} style={[s.toggleBtn,tripType===v&&s.active]} onPress={()=>setTripType(v as "ONE_WAY"|"ROUND_TRIP")}><Text style={tripType===v?s.activeText:s.toggleText}>{l}</Text></Pressable>)}</View>
  <TextInput value={from} onChangeText={setFrom} placeholder="من: PZU أو Port Sudan" style={s.input} textAlign="right"/>
  <TextInput value={to} onChangeText={setTo} placeholder="إلى: JED أو Jeddah" style={s.input} textAlign="right"/>
  <TextInput value={date} onChangeText={setDate} placeholder="تاريخ السفر YYYY-MM-DD" style={s.input} textAlign="right"/>
  {tripType==="ROUND_TRIP"&&<TextInput value={returnDate} onChangeText={setReturnDate} placeholder="تاريخ العودة YYYY-MM-DD" style={s.input} textAlign="right"/>}
  <TextInput value={travelers} onChangeText={setTravelers} placeholder="عدد المسافرين" keyboardType="number-pad" style={s.input} textAlign="right"/>
  <Pressable style={s.primary} onPress={search} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>بحث الرحلات</Text>}</Pressable>
  {!!error&&<View style={s.notice}><Text style={s.noticeText}>{error}</Text><Pressable onPress={()=>request()}><Text style={s.link}>إرسال طلب للوكالة بدون اختيار رحلة</Text></Pressable></View>}
  {results.map((f,i)=><View key={String(f.id??f.externalRef??i)} style={s.card}>
   <View style={s.row}><Text style={s.airline}>{f.airline??"رحلة"}</Text><Text style={s.flightNo}>{f.flightNumber??""}</Text></View>
   <Text style={s.route}>{f.origin?.name??from} → {f.destination?.name??to}</Text>
   <Text style={s.meta}>{formatDate(f.departureAt)} {f.baggage?"· "+f.baggage:""} {f.cabin?"· "+f.cabin:""}</Text>
   <View style={s.row}><View><Text style={s.price}>{f.price!=null?String(f.price)+" "+(f.currency??""):"السعر بعد المراجعة"}</Text>{f.priceSdg!=null&&<Text style={s.sdg}>≈ {Math.round(f.priceSdg).toLocaleString()} SDG</Text>}</View><Pressable style={s.select} onPress={()=>request(f)}><Text style={s.selectText}>اختيار</Text></Pressable></View>
  </View>)}
 </ScrollView></SafeAreaView>;
}
function formatDate(v?:string){if(!v)return"";const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString();}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:18,gap:11,paddingBottom:40},title:{fontSize:21,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},toggle:{flexDirection:"row-reverse",gap:8},toggleBtn:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:999,padding:10,backgroundColor:"#FFF"},active:{backgroundColor:colors.navy,borderColor:colors.navy},toggleText:{textAlign:"center",fontSize:11,color:colors.text},activeText:{textAlign:"center",fontSize:11,color:"#FFF",fontWeight:"800"},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},notice:{backgroundColor:"#FFF8E1",borderRadius:10,padding:12,gap:7},noticeText:{fontSize:11,color:"#7A5A00",textAlign:"right"},link:{fontSize:11,color:colors.navy,fontWeight:"800",textAlign:"right"},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,gap:7},row:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:8},airline:{fontSize:13,fontWeight:"900",color:colors.navy},flightNo:{fontSize:10,color:colors.muted},route:{fontSize:12,fontWeight:"800",color:colors.text,textAlign:"right"},meta:{fontSize:10,color:colors.muted,textAlign:"right"},price:{fontSize:12.5,fontWeight:"900",color:colors.text,textAlign:"right"},sdg:{fontSize:9.5,color:colors.gold,fontWeight:"700",textAlign:"right"},select:{backgroundColor:colors.navy,borderRadius:9,paddingHorizontal:16,paddingVertical:9},selectText:{color:"#FFF",fontWeight:"800",fontSize:11}});
