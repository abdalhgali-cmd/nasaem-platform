// LEGACY / DEFERRED — mobile-admin surface.
// This Android app is customer-only; staff functionality is being
// consolidated into the Web Admin Portal (web/src/app/admin/), which is
// the canonical staff application going forward. This screen is kept only
// for continuity (still auth-gated behind staff login) and is no longer
// linked from any customer-facing navigation in this app. Do not add new
// mobile-admin functionality here — build it in web/src/app/admin/ instead.
import { useCallback,useEffect,useState } from "react";
import { ActivityIndicator,Pressable,RefreshControl,SafeAreaView,ScrollView,StyleSheet,Text,View } from "react-native";
import { StaffNotification,getStaffNotifications,markStaffNotificationRead } from "../../src/api/notifications";
import { colors } from "../../src/theme";

function formatWhen(iso:string){
 try{return new Date(iso).toLocaleString("ar",{calendar:"gregory",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
 catch{return iso;}
}

export default function StaffNotifications(){
 const [items,setItems]=useState<StaffNotification[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
 const load=useCallback(async(silent?:boolean)=>{try{if(!silent)setLoading(true);setError("");const {items:list}=await getStaffNotifications();setItems(list);}catch{setError("تعذر تحميل الإشعارات.");}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{void load();},[load]);
 async function onRefresh(){setRefreshing(true);await load(true);}
 async function markRead(id:string){
  setItems(prev=>prev.map(n=>n.id===id?{...n,readAt:n.readAt??new Date().toISOString()}:n));
  try{await markStaffNotificationRead(id);}catch{void load(true);}
 }
 if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/></View>;
 return <SafeAreaView style={s.safe}>
  <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy}/>}>
   <Text style={s.title}>الإشعارات</Text>
   {!!error&&<Text style={s.error}>{error}</Text>}
   {!items.length&&!error&&<Text style={s.empty}>لا توجد إشعارات حتى الآن.</Text>}
   {items.map(n=>{const unread=!n.readAt;return <Pressable key={n.id} style={[s.card,unread&&s.unread]} onPress={()=>unread&&markRead(n.id)}>
    <View style={s.row}>{unread&&<View style={s.dot}/>}<Text style={s.cardTitle}>{n.title}</Text></View>
    <Text style={s.message}>{n.message}</Text>
    <Text style={s.when}>{formatWhen(n.createdAt)}</Text>
   </Pressable>;})}
  </ScrollView>
 </SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:18,gap:10,paddingBottom:40},center:{flex:1,justifyContent:"center",alignItems:"center"},title:{fontSize:21,fontWeight:"900",color:colors.navy,textAlign:"right",marginBottom:4},empty:{fontSize:11.5,color:colors.muted,textAlign:"right"},error:{color:colors.danger,textAlign:"right",fontSize:11},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:13,padding:14,gap:5},unread:{borderColor:colors.navy,backgroundColor:"#EEF3FB"},row:{flexDirection:"row-reverse",alignItems:"center",gap:6},dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.gold},cardTitle:{fontSize:13,fontWeight:"800",color:colors.text,textAlign:"right",flex:1},message:{fontSize:11,color:colors.muted,textAlign:"right",lineHeight:17},when:{fontSize:9.5,color:colors.subtle,textAlign:"right"}});
