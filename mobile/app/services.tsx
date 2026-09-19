import { useCallback,useEffect,useState } from "react";
import { ActivityIndicator,FlatList,Pressable,RefreshControl,SafeAreaView,StyleSheet,Text,View } from "react-native";
import { router } from "expo-router";
import { getPublicServices,PublicService } from "../src/api/services";
import { colors } from "../src/theme";
export default function ServicesScreen(){
 const [items,setItems]=useState<PublicService[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(false);
 const load=useCallback(async()=>{try{setError(false);setItems(await getPublicServices());}catch{setError(true);}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{void load();},[load]);
 if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/><Text>جاري تحميل الخدمات…</Text></View>;
 return <SafeAreaView style={s.safe}><FlatList data={items} numColumns={2} columnWrapperStyle={s.row} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load();}}/>} keyExtractor={(x,i)=>String(x.id??x.slug??i)}
 ListHeaderComponent={<><Text style={s.title}>جميع الخدمات</Text><Pressable style={s.track} onPress={()=>router.push("/track")}><Text style={s.trackText}>تتبع طلبك برقم الطلب</Text></Pressable>{error&&<Text style={s.error}>تعذر تحميل الخدمات. اسحب للتحديث أو حاول مرة أخرى.</Text>}</>}
 renderItem={({item})=><Pressable style={s.card} onPress={()=>router.push({pathname:"/service/[slug]",params:{slug:item.slug??String(item.id),payload:JSON.stringify(item)}})}><Text style={s.cardTitle}>{item.nameAr??item.name??item.title??"خدمة"}</Text><Text numberOfLines={3} style={s.desc}>{item.description??"عرض التفاصيل والمتطلبات"}</Text></Pressable>}
 ListEmptyComponent={<View style={s.center}><Text style={s.desc}>لا توجد خدمات متاحة حاليًا.</Text></View>}/></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:36},title:{fontSize:20,fontWeight:"800",color:colors.navy,textAlign:"right",marginBottom:12},track:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:14,marginBottom:14},trackText:{textAlign:"right",fontWeight:"700",color:colors.text},row:{gap:12},card:{flex:1,minHeight:118,backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:15,marginBottom:12},cardTitle:{fontSize:13,fontWeight:"800",color:colors.text,textAlign:"right"},desc:{fontSize:11,color:colors.muted,lineHeight:18,textAlign:"right",marginTop:7},center:{flex:1,minHeight:220,alignItems:"center",justifyContent:"center",gap:10},error:{color:colors.danger,textAlign:"right",fontSize:11,marginBottom:10}});
