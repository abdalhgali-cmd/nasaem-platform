import { useEffect,useMemo,useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View } from "react-native";
import { getPublicVisaTypes,PublicVisaType } from "../src/api/services";
import { colors } from "../src/theme";

export default function VisasScreen(){
  const [items,setItems]=useState<PublicVisaType[]>([]);
  const [country,setCountry]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{getPublicVisaTypes().then(setItems).catch(()=>setError("تعذر تحميل أنواع التأشيرات")).finally(()=>setLoading(false));},[]);
  const countries=useMemo(()=>Array.from(new Set(items.map(x=>x.country))).filter(Boolean),[items]);
  const shown=country?items.filter(x=>x.country===country):[];

  if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/><Text>جاري تحميل التأشيرات…</Text></View>;
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>التأشيرات</Text><Text style={s.desc}>اختر الدولة ثم نوع التأشيرة. الأسعار والمتطلبات من لوحة الإدارة مباشرة.</Text>{!!error&&<Text style={s.error}>{error}</Text>}
  {!country?<View style={s.grid}>{countries.map(c=><Pressable key={c} style={s.country} onPress={()=>setCountry(c)}><Text style={s.countryText}>{c}</Text></Pressable>)}</View>:<><Pressable onPress={()=>setCountry(null)}><Text style={s.back}>تغيير الدولة</Text></Pressable><Text style={s.subtitle}>{country}</Text>{shown.map(v=><View key={v.id} style={s.card}><Text style={s.cardTitle}>{v.name}</Text>{!!v.description&&<Text style={s.small}>{v.description}</Text>}<View style={s.meta}><Text style={s.price}>{v.basePrice!=null?`${v.basePrice} ${v.currency??""}`:"السعر بعد المراجعة"}</Text>{v.priceSdg!=null&&<Text style={s.sdg}>≈ {Math.round(v.priceSdg).toLocaleString()} SDG</Text>}</View>{!!v.processingTime&&<Text style={s.small}>مدة المعالجة: {v.processingTime}</Text>}<Pressable style={s.button} onPress={()=>router.push({pathname:"/request/[kind]",params:{kind:"visas",visaTypeId:v.id,serviceId:v.serviceId??"",serviceName:v.name,country:v.country,visaTypeName:v.name}})}><Text style={s.buttonText}>ابدأ الطلب</Text></Pressable></View>)}</>}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:18,gap:12,paddingBottom:36},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},title:{fontSize:21,fontWeight:"900",color:colors.navy,textAlign:"right"},subtitle:{fontSize:16,fontWeight:"800",color:colors.text,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},grid:{gap:10},country:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:15},countryText:{textAlign:"right",fontWeight:"800",color:colors.text},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,gap:8},cardTitle:{fontSize:14,fontWeight:"800",color:colors.navy,textAlign:"right"},small:{fontSize:10.5,color:colors.muted,textAlign:"right",lineHeight:17},meta:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},price:{fontSize:13,fontWeight:"900",color:colors.text},sdg:{fontSize:10.5,color:colors.gold,fontWeight:"700"},button:{backgroundColor:colors.navy,borderRadius:9,padding:11,marginTop:4},buttonText:{color:"#FFF",fontWeight:"800",textAlign:"center"},back:{color:colors.navy,fontWeight:"700",textAlign:"right"},error:{color:colors.danger,textAlign:"right"}});
