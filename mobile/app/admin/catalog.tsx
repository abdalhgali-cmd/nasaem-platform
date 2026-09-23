// LEGACY / DEFERRED — mobile-admin surface.
// This Android app is customer-only; staff functionality is being
// consolidated into the Web Admin Portal (web/src/app/admin/), which is
// the canonical staff application going forward. This screen is kept only
// for continuity (still auth-gated behind staff login) and is no longer
// linked from any customer-facing navigation in this app. Do not add new
// mobile-admin functionality here — build it in web/src/app/admin/ instead.
import { useEffect,useState } from "react";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { AdminCatalogItem,getAdminServices,getAdminVisaTypes,updateAdminService,updateAdminVisaType } from "../../src/api/admin";
import { colors } from "../../src/theme";

type Draft={price:string;currency:string;processingTime:string;active:boolean};
export default function AdminCatalogScreen(){
 const [services,setServices]=useState<AdminCatalogItem[]>([]);
 const [visas,setVisas]=useState<AdminCatalogItem[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState(""),[message,setMessage]=useState("");

 async function load(){
  try{
   setLoading(true);setMessage("");
   const [s,v]=await Promise.all([getAdminServices(),getAdminVisaTypes()]);
   setServices(s);setVisas(v);
   const next:Record<string,Draft>={};
   [...s,...v].forEach(x=>{next[x.id]={price:String(x.basePrice??0),currency:x.currency??"SAR",processingTime:x.processingTime??"",active:x.active!==false};});
   setDrafts(next);
  }catch{setMessage("تعذر تحميل الكتالوج أو لا تملك الصلاحية.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);

 function patch(id:string,p:Partial<Draft>){setDrafts(d=>({...d,[id]:{...d[id],...p}}));}
 async function save(item:AdminCatalogItem,type:"service"|"visa"){
  try{
   setBusyId(item.id);setMessage("");
   const d=drafts[item.id];
   const payload={basePrice:Number(d.price)||0,currency:d.currency as any,processingTime:d.processingTime||null,active:d.active};
   if(type==="service")await updateAdminService(item.id,payload);else await updateAdminVisaType(item.id,payload);
   setMessage("تم حفظ التعديل.");
  }catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ. تحقق من الصلاحيات.");}
  finally{setBusyId("");}
 }
 if(loading)return <View style={s.center}><ActivityIndicator color={colors.navy}/><Text>جاري تحميل الكتالوج…</Text></View>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.title}>إدارة الخدمات والأسعار</Text><Text style={s.desc}>أي تعديل هنا ينعكس على الكتالوج العام والتطبيق بعد الحفظ.</Text>
  {!!message&&<Text style={s.message}>{message}</Text>}
  <Text style={s.section}>الخدمات</Text>{services.map(x=><Editor key={x.id} item={x} draft={drafts[x.id]} busy={busyId===x.id} onPatch={p=>patch(x.id,p)} onSave={()=>save(x,"service")}/>)}
  <Text style={s.section}>أنواع التأشيرات</Text>{visas.map(x=><Editor key={x.id} item={x} draft={drafts[x.id]} busy={busyId===x.id} onPatch={p=>patch(x.id,p)} onSave={()=>save(x,"visa")}/>)}
 </ScrollView></SafeAreaView>;
}
function Editor({item,draft,busy,onPatch,onSave}:{item:AdminCatalogItem;draft?:Draft;busy:boolean;onPatch:(p:Partial<Draft>)=>void;onSave:()=>void}){
 if(!draft)return null;
 return <View style={s.card}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.code}>{item.code??item.category??item.country??""}</Text>
  <View style={s.row}><TextInput value={draft.price} onChangeText={v=>onPatch({price:v})} keyboardType="decimal-pad" placeholder="السعر" style={[s.input,s.flex]} textAlign="right"/><TextInput value={draft.currency} onChangeText={v=>onPatch({currency:v.toUpperCase()})} placeholder="SAR" autoCapitalize="characters" maxLength={3} style={[s.input,s.currency]} textAlign="center"/></View>
  <TextInput value={draft.processingTime} onChangeText={v=>onPatch({processingTime:v})} placeholder="مدة المعالجة" style={s.input} textAlign="right"/>
  <View style={s.row}><Pressable style={[s.toggle,draft.active&&s.toggleActive]} onPress={()=>onPatch({active:!draft.active})}><Text style={draft.active?s.toggleActiveText:s.toggleText}>{draft.active?"مفعلة":"موقوفة"}</Text></Pressable><Pressable disabled={busy} style={s.save} onPress={onSave}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.saveText}>حفظ</Text>}</Pressable></View>
 </View>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},page:{padding:18,gap:10,paddingBottom:40},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11,color:colors.muted,textAlign:"right"},message:{fontSize:11,color:colors.gold,textAlign:"right",fontWeight:"700"},section:{fontSize:14,fontWeight:"900",color:colors.text,textAlign:"right",marginTop:6},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:13,padding:13,gap:8},cardTitle:{fontSize:12.5,fontWeight:"800",color:colors.navy,textAlign:"right"},code:{fontSize:9.5,color:colors.subtle,textAlign:"right"},row:{flexDirection:"row-reverse",gap:8,alignItems:"center"},input:{backgroundColor:colors.soft,borderWidth:1,borderColor:colors.border,borderRadius:9,padding:10,fontSize:11.5},flex:{flex:1},currency:{width:75},toggle:{borderWidth:1,borderColor:colors.border,borderRadius:9,paddingHorizontal:14,paddingVertical:10},toggleActive:{backgroundColor:"#E8F7ED",borderColor:"#BEE8CB"},toggleText:{fontSize:10.5,color:colors.muted},toggleActiveText:{fontSize:10.5,color:colors.success,fontWeight:"800"},save:{flex:1,backgroundColor:colors.navy,borderRadius:9,padding:11},saveText:{color:"#FFF",fontWeight:"800",textAlign:"center",fontSize:11}});
