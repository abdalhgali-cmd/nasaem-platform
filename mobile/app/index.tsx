import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { getPublicServices, PublicService } from "../src/api/services";
import { colors } from "../src/theme";
import { formatPrice, formatSdgEquivalent } from "../src/utils/price";

function titleOf(item: PublicService){return item.nameAr ?? item.name ?? item.title ?? "خدمة";}
const quick=[["🕋","العمرة","/umrah"],["✈️","الطيران","/flights"],["🛂","التأشيرات","/visas"],["⛴️","البواخر","/ferries"]] as const;

export default function HomeScreen(){
 const [services,setServices]=useState<PublicService[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(false),[query,setQuery]=useState("");
 const load=useCallback(async()=>{try{setError(false);setServices(await getPublicServices());}catch{setError(true);}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const main=useMemo(()=>services.filter(x=>titleOf(x).includes(query.trim())).slice(0,6),[services,query]);
 if(loading)return <View style={s.center}><ActivityIndicator size="large" color={colors.navy}/><Text style={s.muted}>بنجهز ليك الرحلة…</Text></View>;
 return <SafeAreaView style={s.safe}><FlatList data={main} numColumns={2} columnWrapperStyle={s.row} keyExtractor={(x,i)=>String(x.id??x.slug??i)}
 refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}/>} contentContainerStyle={s.content}
 ListHeaderComponent={<>
  <View style={s.hero}>
   <View style={s.top}><View style={s.avatar}><Text style={s.avatarText}>ن</Text></View><View><Text style={s.hello}>أهلاً بيك في نسائم الحرمين</Text><Text style={s.heroTitle}>وين ناوي تسافر؟ ✈️</Text></View></View>
   <Text style={s.heroSub}>من أول فكرة للرحلة لحد ما تصل — كل طلباتك في مكان واحد.</Text>
   <View style={s.search}><TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن عمرة، تأشيرة، رحلة…" placeholderTextColor={colors.subtle} style={s.searchInput}/><Text style={s.searchIcon}>⌕</Text></View>
  </View>
  <FlatList horizontal inverted showsHorizontalScrollIndicator={false} data={quick} keyExtractor={x=>x[1]} contentContainerStyle={s.quickList}
   renderItem={({item})=><Pressable style={s.quickCard} onPress={()=>router.push(item[2] as never)}><View style={s.quickIcon}><Text style={s.quickEmoji}>{item[0]}</Text></View><Text style={s.quickText}>{item[1]}</Text></Pressable>}/>
  <Pressable style={s.activeTrip} onPress={()=>router.push("/track")}>
   <View style={s.tripTop}><Text style={s.tripArrow}>‹</Text><View><Text style={s.tripLabel}>عندك طلب شغال؟</Text><Text style={s.tripTitle}>تابع رحلتك خطوة بخطوة</Text></View></View>
   <View style={s.progress}><View style={s.progressFill}/></View><Text style={s.tripHint}>أدخل رقم الطلب وشوف آخر تحديث فوراً</Text>
  </Pressable>
  <View style={s.section}><Pressable onPress={()=>router.push("/services")}><Text style={s.link}>عرض الكل</Text></Pressable><View><Text style={s.sectionTitle}>اكتشف خدماتنا</Text><Text style={s.sectionSub}>اختار الخدمة المناسبة لرحلتك</Text></View></View>
  {error&&<Pressable style={s.errorBox} onPress={()=>{setLoading(true);void load();}}><Text style={s.errorText}>تعذر تحديث الخدمات — اضغط للمحاولة مرة تانية</Text></Pressable>}
 </>}
 renderItem={({item})=><Pressable style={s.card} onPress={()=>router.push({pathname:"/service/[slug]",params:{slug:item.slug??String(item.id),payload:JSON.stringify(item)}})}>
   <View style={s.cardIcon}><Text style={s.cardIconText}>✦</Text></View><Text style={s.cardTitle}>{titleOf(item)}</Text><Text numberOfLines={2} style={s.desc}>{item.description??"شوف التفاصيل والمتطلبات وابدأ طلبك"}</Text>
   <View style={s.priceRow}><Text style={s.cardPrice}>{formatPrice(item.basePrice,item.currency)}</Text>{!!formatSdgEquivalent(item.priceSdg)&&<Text style={s.cardSdg}>{formatSdgEquivalent(item.priceSdg)}</Text>}</View>
 </Pressable>}
 ListFooterComponent={<><Pressable style={s.cta} onPress={()=>router.push("/requests")}><Text style={s.ctaText}>ابدأ طلب جديد</Text><Text style={s.ctaArrow}>←</Text></Pressable><View style={s.nav}><Pressable onPress={()=>router.push("/account")}><Text style={s.navText}>◎{"\n"}حسابي</Text></Pressable><Pressable onPress={()=>router.push("/track")}><Text style={s.navText}>◷{"\n"}طلباتي</Text></Pressable><Text style={s.navActive}>⌂{"\n"}الرئيسية</Text></View></>}
 /></SafeAreaView>;
}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#F5F7FB"},content:{paddingBottom:22},center:{flex:1,justifyContent:"center",alignItems:"center",gap:12,backgroundColor:"#F5F7FB"},muted:{color:colors.muted},
 hero:{backgroundColor:colors.navyDark,paddingHorizontal:20,paddingTop:24,paddingBottom:26,borderBottomLeftRadius:30,borderBottomRightRadius:30},top:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},avatar:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(255,255,255,.13)",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"rgba(255,255,255,.18)"},avatarText:{color:colors.gold,fontWeight:"900",fontSize:20},hello:{color:"#BFCBE2",fontSize:11,textAlign:"right"},heroTitle:{color:"#FFF",fontSize:26,fontWeight:"900",textAlign:"right",marginTop:3},heroSub:{color:"#D5DCEC",fontSize:12,lineHeight:20,textAlign:"right",marginTop:14},
 search:{marginTop:18,backgroundColor:"#FFF",borderRadius:16,height:52,flexDirection:"row-reverse",alignItems:"center",paddingHorizontal:15},searchInput:{flex:1,textAlign:"right",fontSize:13,color:colors.text},searchIcon:{fontSize:23,color:colors.navy,marginLeft:8},
 quickList:{paddingHorizontal:16,paddingTop:18,gap:10},quickCard:{width:88,backgroundColor:"#FFF",borderRadius:18,paddingVertical:13,alignItems:"center",borderWidth:1,borderColor:"#E9EDF5"},quickIcon:{width:42,height:42,borderRadius:14,backgroundColor:"#F0F4FB",alignItems:"center",justifyContent:"center"},quickEmoji:{fontSize:20},quickText:{fontSize:11,fontWeight:"800",color:colors.text,marginTop:7},
 activeTrip:{margin:16,marginBottom:3,backgroundColor:"#FFF",borderRadius:20,padding:17,borderWidth:1,borderColor:"#E6EAF2"},tripTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},tripArrow:{fontSize:27,color:colors.gold},tripLabel:{fontSize:10,color:colors.gold,fontWeight:"900",textAlign:"right"},tripTitle:{fontSize:15,color:colors.text,fontWeight:"900",textAlign:"right",marginTop:3},progress:{height:5,backgroundColor:"#E9EDF4",borderRadius:9,marginTop:15,overflow:"hidden"},progressFill:{width:"55%",height:"100%",backgroundColor:colors.gold,borderRadius:9},tripHint:{fontSize:10,color:colors.muted,textAlign:"right",marginTop:8},
 section:{paddingHorizontal:18,paddingTop:22,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end"},sectionTitle:{fontSize:18,fontWeight:"900",color:colors.text,textAlign:"right"},sectionSub:{fontSize:10,color:colors.muted,textAlign:"right",marginTop:3},link:{fontSize:11,color:colors.navy,fontWeight:"800"},
 row:{paddingHorizontal:16,gap:12},card:{flex:1,minHeight:154,backgroundColor:"#FFF",borderWidth:1,borderColor:"#E7EAF0",borderRadius:20,padding:15,marginBottom:12,alignItems:"flex-end"},cardIcon:{width:39,height:39,borderRadius:13,backgroundColor:"#EEF3FB",alignItems:"center",justifyContent:"center",marginBottom:12},cardIconText:{color:colors.navy,fontWeight:"900"},cardTitle:{fontSize:14,fontWeight:"900",color:colors.text,textAlign:"right"},desc:{fontSize:10.5,color:colors.muted,lineHeight:17,textAlign:"right",marginTop:5},priceRow:{marginTop:"auto",alignItems:"flex-end"},cardPrice:{fontSize:11.5,fontWeight:"900",color:colors.navy},cardSdg:{fontSize:9,color:colors.gold,fontWeight:"700",marginTop:2},
 cta:{marginHorizontal:16,marginTop:8,backgroundColor:colors.gold,borderRadius:18,paddingVertical:16,paddingHorizontal:18,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},ctaText:{color:colors.navyDark,fontWeight:"900",fontSize:14},ctaArrow:{color:colors.navyDark,fontSize:20,fontWeight:"900"},
 nav:{margin:16,marginBottom:0,backgroundColor:"#FFF",borderRadius:20,paddingVertical:12,paddingHorizontal:28,flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor:"#E7EAF0"},navText:{fontSize:10,color:colors.muted,textAlign:"center",lineHeight:18,fontWeight:"700"},navActive:{fontSize:10,color:colors.navy,textAlign:"center",lineHeight:18,fontWeight:"900"},
 errorBox:{marginHorizontal:16,padding:12,borderRadius:12,backgroundColor:"#FFF4F2"},errorText:{color:colors.danger,textAlign:"right",fontSize:11}
});