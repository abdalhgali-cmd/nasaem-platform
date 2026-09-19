import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { getPublicServices, PublicService } from "../src/api/services";
import { colors } from "../src/theme";

function titleOf(item: PublicService) { return item.nameAr ?? item.name ?? item.title ?? "خدمة"; }

export default function HomeScreen() {
  const [services,setServices]=useState<PublicService[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState(false);
  const load=useCallback(async()=>{try{setError(false);setServices(await getPublicServices());}catch{setError(true);}finally{setLoading(false);setRefreshing(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const main=useMemo(()=>services.slice(0,8),[services]);

  if(loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.navy}/><Text style={s.muted}>جاري تحميل الخدمات…</Text></View>;

  return <SafeAreaView style={s.safe}><FlatList
    data={main}
    numColumns={2}
    columnWrapperStyle={s.row}
    keyExtractor={(x,i)=>String(x.id??x.slug??i)}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}/>}
    contentContainerStyle={s.content}
    ListHeaderComponent={<>
      <View style={s.header}><View><Text style={s.welcome}>أهلاً بك</Text><Text style={s.brand}>نسائم الحرمين</Text></View><View style={s.logoMark}><Text style={s.logoText}>ن</Text></View></View>
      <View style={s.offer}><Text style={s.offerTag}>عرض العمرة</Text><Text style={s.offerTitle}>اكتشف باقات العمرة والخدمات المتاحة</Text><Pressable style={s.goldButton} onPress={()=>router.push("/umrah")}><Text style={s.goldButtonText}>عرض الباقات</Text></Pressable></View>
      <Pressable style={s.track} onPress={()=>router.push("/requests")}><Text style={s.trackText}>ابدأ طلب جديد</Text><Text style={s.chev}>‹</Text></Pressable><Pressable style={s.track} onPress={()=>router.push("/track")}><Text style={s.trackText}>تتبع طلبك برقم الطلب</Text><Text style={s.chev}>‹</Text></Pressable><Pressable style={s.track} onPress={()=>router.push("/account")}><Text style={s.trackText}>الحساب والإدارة</Text><Text style={s.chev}>‹</Text></Pressable>
      <View style={s.section}><Text style={s.sectionTitle}>الخدمات الرئيسية</Text><Pressable onPress={()=>router.push("/services")}><Text style={s.link}>عرض الكل</Text></Pressable></View>
      {error&&<Pressable style={s.errorBox} onPress={()=>{setLoading(true);void load();}}><Text style={s.errorText}>تعذر تحديث الخدمات — اضغط لإعادة المحاولة</Text></Pressable>}
    </>}
    renderItem={({item})=><Pressable style={s.card} onPress={()=>router.push({pathname:"/service/[slug]",params:{slug:item.slug??String(item.id),payload:JSON.stringify(item)}})}>
      <View style={s.icon}><Text style={s.iconText}>✦</Text></View><Text style={s.cardTitle}>{titleOf(item)}</Text><Text numberOfLines={2} style={s.desc}>{item.description??"عرض التفاصيل والمتطلبات"}</Text>
    </Pressable>}
    ListEmptyComponent={<View style={s.empty}><Text style={s.muted}>لا توجد خدمات متاحة حاليًا.</Text></View>}
  /></SafeAreaView>;
}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},content:{paddingBottom:36},center:{flex:1,justifyContent:"center",alignItems:"center",gap:12,backgroundColor:colors.background},muted:{color:colors.muted},
 header:{backgroundColor:colors.navy,paddingHorizontal:20,paddingVertical:20,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",borderBottomLeftRadius:22,borderBottomRightRadius:22},welcome:{color:"#C7D5F0",fontSize:11,textAlign:"right"},brand:{color:"#FFF",fontSize:17,fontWeight:"800",textAlign:"right"},logoMark:{width:38,height:38,borderRadius:19,backgroundColor:"rgba(255,255,255,.14)",alignItems:"center",justifyContent:"center"},logoText:{color:colors.gold,fontWeight:"900",fontSize:18},
 offer:{margin:16,marginBottom:0,backgroundColor:colors.navyDark,borderRadius:16,padding:18,alignItems:"flex-end",gap:9},offerTag:{color:colors.gold,fontSize:11,fontWeight:"800"},offerTitle:{color:"#FFF",fontSize:16,fontWeight:"800",textAlign:"right"},goldButton:{backgroundColor:colors.gold,borderRadius:999,paddingVertical:9,paddingHorizontal:18},goldButtonText:{color:colors.navy,fontSize:12,fontWeight:"800"},
 track:{marginHorizontal:16,marginTop:14,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:14,backgroundColor:"#FFF",flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},trackText:{fontWeight:"700",color:colors.text,fontSize:13},chev:{fontSize:22,color:colors.subtle},
 section:{paddingHorizontal:18,paddingTop:20,paddingBottom:10,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},sectionTitle:{fontSize:15,fontWeight:"800",color:colors.text},link:{fontSize:12,color:colors.navy,fontWeight:"700"},
 row:{paddingHorizontal:16,gap:12},card:{flex:1,minHeight:126,backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginBottom:12,alignItems:"flex-end"},icon:{width:36,height:36,borderRadius:10,backgroundColor:"#EEF3FB",alignItems:"center",justifyContent:"center",marginBottom:10},iconText:{color:colors.navy,fontWeight:"900"},cardTitle:{fontSize:13,fontWeight:"800",color:colors.text,textAlign:"right"},desc:{fontSize:11,color:colors.muted,lineHeight:17,textAlign:"right",marginTop:5},
 errorBox:{marginHorizontal:16,marginTop:12,padding:12,borderRadius:10,backgroundColor:"#FFF4F2"},errorText:{color:colors.danger,textAlign:"right",fontSize:11},empty:{padding:30,alignItems:"center"}
});
