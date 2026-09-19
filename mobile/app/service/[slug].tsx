import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PublicService } from "../../src/api/services";
import { colors } from "../../src/theme";

function requestKind(service: PublicService | null) {
  const category=(service?.category??"").toLowerCase();
  const code=(service?.code??"").toUpperCase();
  if(code==="SVC-EGYPT-CLEARANCE" || category.includes("security")) return "egypt";
  if(category.includes("flight")) return "flights";
  if(category.includes("hotel") || category.includes("package") || category.includes("tour")) return "hotels";
  if(category.includes("family")) return "family";
  if(category.includes("ferry")) return "ferries";
  if(category.includes("umrah")) return "umrah";
  return "generic";
}

export default function ServiceDetailsScreen() {
  const params=useLocalSearchParams<{slug:string;payload?:string}>();
  let service:PublicService|null=null;
  try{service=params.payload?JSON.parse(params.payload) as PublicService:null;}catch{service=null;}
  const kind=requestKind(service);
  const price=service?.basePrice!=null?`${service.basePrice} ${service.currency??""}`:"يحدد بعد مراجعة الطلب";
  const sdg=service?.priceSdg!=null?`≈ ${Math.round(service.priceSdg).toLocaleString()} جنيه سوداني`:null;

  return <ScrollView contentContainerStyle={s.page}>
    <Text style={s.title}>{service?.name??service?.nameAr??service?.title??"تفاصيل الخدمة"}</Text>
    {!!service?.description&&<Text style={s.description}>{service.description}</Text>}
    <View style={s.card}><Text style={s.label}>السعر الحالي</Text><Text style={s.value}>{price}</Text>{sdg&&<Text style={s.sdg}>{sdg}</Text>}</View>
    {!!service?.processingTime&&<View style={s.card}><Text style={s.label}>مدة المعالجة</Text><Text style={s.value}>{service.processingTime}</Text></View>}
    <Pressable style={s.button} onPress={()=>kind==="umrah"?router.push("/umrah"):router.push({pathname:"/request/[kind]",params:{kind,serviceId:service?.id??"",serviceName:service?.name??"طلب خدمة"}})}><Text style={s.buttonText}>ابدأ الطلب</Text></Pressable>
    <Text style={s.note}>السعر النهائي وتعليمات الدفع تعتمد على مراجعة الوكالة وحالة الطلب.</Text>
  </ScrollView>;
}
const s=StyleSheet.create({page:{padding:20,gap:14,backgroundColor:colors.background,flexGrow:1},title:{fontSize:24,fontWeight:"900",color:colors.navy,textAlign:"right"},description:{fontSize:14,lineHeight:24,color:colors.muted,textAlign:"right"},card:{backgroundColor:"#FFF",borderRadius:14,padding:15,borderWidth:1,borderColor:colors.border},label:{textAlign:"right",color:colors.muted,fontSize:11,marginBottom:6},value:{textAlign:"right",color:colors.text,fontSize:16,fontWeight:"800"},sdg:{textAlign:"right",color:colors.gold,fontSize:11,fontWeight:"700",marginTop:5},button:{backgroundColor:colors.navy,borderRadius:10,padding:14},buttonText:{color:"#FFF",fontWeight:"800",textAlign:"center"},note:{textAlign:"right",color:colors.subtle,lineHeight:20,fontSize:11}});
