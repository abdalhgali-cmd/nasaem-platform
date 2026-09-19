import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { submitContactRequestWithDocuments, UploadAsset } from "../src/api/requests";
import { getPublicPackages, getPublicServices, PublicService } from "../src/api/services";
import { colors } from "../src/theme";

type TravelerDocs={passport:UploadAsset|null;guarantorId:UploadAsset|null};
type Traveler={id:string;name:string;passport:string;nationality:string;guarantorNumber:string;docs:TravelerDocs};
const makeTraveler=(n:number):Traveler=>({id:`traveler-${Date.now()}-${n}`,name:"",passport:"",nationality:"",guarantorNumber:"",docs:{passport:null,guarantorId:null}});

export default function UmrahScreen(){
 const [travelers,setTravelers]=useState<Traveler[]>([makeTraveler(1)]);
 const [phone,setPhone]=useState("");
 const [packages,setPackages]=useState<PublicService[]>([]);
 const [umrahService,setUmrahService]=useState<PublicService|null>(null);
 const [selectedPackageId,setSelectedPackageId]=useState("");
 const [catalogLoading,setCatalogLoading]=useState(true);
 const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [requestId,setRequestId]=useState<string|null>(null);

 useEffect(()=>{
   let active=true;
   (async()=>{
     try{
       const [services,pkgs]=await Promise.all([getPublicServices(),getPublicPackages()]);
       if(!active)return;
       setPackages(pkgs);
       const service=services.find(s=>(s.code??"").toUpperCase()==="SVC-UMRAH"||(s.category??"").toLowerCase()==="umrah")??null;
       setUmrahService(service);
       if(pkgs.length===1)setSelectedPackageId(pkgs[0].id);
     }catch{
       if(active)setError("تعذر تحميل باقات العمرة من الإدارة.");
     }finally{
       if(active)setCatalogLoading(false);
     }
   })();
   return()=>{active=false};
 },[]);

 const selectedPackage=packages.find(p=>p.id===selectedPackageId)??null;
 const update=(id:string,patch:Partial<Traveler>)=>setTravelers(v=>v.map(t=>t.id===id?{...t,...patch}:t));
 const complete=useMemo(()=>phone.trim().length>=6&&(!packages.length||Boolean(selectedPackageId))&&travelers.every(t=>t.name.trim()&&t.passport.trim()&&t.nationality.trim()&&t.guarantorNumber.trim()&&t.docs.passport&&t.docs.guarantorId),[travelers,phone,packages.length,selectedPackageId]);

 async function pickDocument(id:string,key:keyof TravelerDocs,label:string){
   const result=await DocumentPicker.getDocumentAsync({type:["image/jpeg","image/png","image/webp","application/pdf"],copyToCacheDirectory:true,multiple:false});
   if(result.canceled)return;
   const asset=result.assets[0];
   setTravelers(current=>current.map(t=>t.id===id?{...t,docs:{...t.docs,[key]:{uri:asset.uri,name:asset.name,mimeType:asset.mimeType,label}}}:t));
 }
 function removeDocument(id:string,key:keyof TravelerDocs){setTravelers(current=>current.map(t=>t.id===id?{...t,docs:{...t.docs,[key]:null}}:t));}

 async function submit(){
   try{
     setBusy(true);setError("");
     const documents:UploadAsset[]=[];
     travelers.forEach((t,index)=>{if(t.docs.passport)documents.push({...t.docs.passport,travelerIndex:index});if(t.docs.guarantorId)documents.push({...t.docs.guarantorId,travelerIndex:index});});
     const serviceRef=selectedPackage??umrahService;
     const id=await submitContactRequestWithDocuments({
       name:travelers[0].name,
       phone,
       service:serviceRef?.name??"العمرة",
       serviceId:serviceRef?.id,
       message:"طلب عمرة عبر تطبيق نسائم الحرمين",
       travelerCount:travelers.length,
       intakeData:{
         kind:"umrah",
         package:selectedPackage?{id:selectedPackage.id,name:selectedPackage.name,basePrice:selectedPackage.basePrice,currency:selectedPackage.currency,priceSdg:selectedPackage.priceSdg}:undefined,
         guarantors:travelers.map(t=>({travelerName:t.name,guarantorNumber:t.guarantorNumber})),
       },
       travelers:travelers.map((t,index)=>({fullName:t.name,passportNo:t.passport,nationality:t.nationality,isPrimary:index===0})),
     },documents);
     setRequestId(id);
   }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال طلب العمرة");}
   finally{setBusy(false);}
 }

 if(requestId)return <SafeAreaView style={s.safe}><View style={s.successPage}><Text style={s.successIcon}>✓</Text><Text style={s.title}>تم استلام طلب العمرة</Text><Text style={s.desc}>تم حفظ بيانات المسافرين ومستنداتهم وربط كل مستند بصاحبه.</Text><View style={s.requestBox}><Text style={s.label}>رقم الطلب</Text><Text style={s.requestId}>{requestId}</Text></View><Pressable style={s.primary} onPress={()=>router.push({pathname:"/track",params:{requestId,phone}})}><Text style={s.primaryText}>متابعة الطلب</Text></Pressable></View></SafeAreaView>;

 if(review)return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>مراجعة طلب العمرة</Text>{selectedPackage&&<View style={s.card}><Text style={s.cardTitle}>{selectedPackage.name}</Text><Text style={s.price}>{selectedPackage.basePrice??""} {selectedPackage.currency??""}</Text>{selectedPackage.priceSdg!=null&&<Text style={s.sdg}>≈ {Math.round(selectedPackage.priceSdg).toLocaleString()} SDG</Text>}</View>}<View style={s.card}><Text style={s.cardTitle}>رقم الهاتف</Text><Text style={s.line}>{phone}</Text></View>{travelers.map((t,i)=><View key={t.id} style={s.card}><Text style={s.cardTitle}>مسافر {i+1} — {t.name}</Text><Text style={s.line}>الجواز: {t.passport}</Text><Text style={s.line}>الجنسية: {t.nationality}</Text><Text style={s.line}>رقم الضامن: {t.guarantorNumber}</Text><Text style={s.ok}>✓ صورة الجواز: {t.docs.passport?.name}</Text><Text style={s.ok}>✓ هوية الضامن: {t.docs.guarantorId?.name}</Text></View>)}<Text style={s.note}>السعر الظاهر استرشادي من الإدارة؛ الدفع لا يظهر إلا بعد اعتماد الوكالة للطلب.</Text>{!!error&&<Text style={s.error}>{error}</Text>}<View style={s.actions}><Pressable style={s.outline} onPress={()=>setReview(false)} disabled={busy}><Text style={s.outlineText}>تعديل</Text></Pressable><Pressable style={s.primary} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>إرسال الطلب</Text>}</Pressable></View></ScrollView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>طلب عمرة</Text><Text style={s.desc}>اختر الباقة وأدخل بيانات كل مسافر وارفع مستنداته بصورة مستقلة.</Text>{catalogLoading?<ActivityIndicator color={colors.navy}/>:packages.length>0&&<View style={s.packages}><Text style={s.sectionTitle}>باقات العمرة</Text>{packages.map(p=><Pressable key={p.id} style={[s.packageCard,selectedPackageId===p.id&&s.packageActive]} onPress={()=>setSelectedPackageId(p.id)}><View style={s.packageHead}><Text style={s.cardTitle}>{p.name??"باقة عمرة"}</Text>{selectedPackageId===p.id&&<Text style={s.selected}>✓ مختارة</Text>}</View><Text style={s.price}>{p.basePrice!=null?`${p.basePrice} ${p.currency??""}`:"السعر بعد المراجعة"}</Text>{p.priceSdg!=null&&<Text style={s.sdg}>≈ {Math.round(p.priceSdg).toLocaleString()} SDG</Text>}{!!p.description&&<Text style={s.line}>{p.description}</Text>}</Pressable>)}</View>}<TextInput value={phone} onChangeText={setPhone} placeholder="رقم هاتف مقدم الطلب" keyboardType="phone-pad" style={s.input} textAlign="right"/>{travelers.map((t,i)=><View key={t.id} style={s.card}><View style={s.cardHead}><Text style={s.cardTitle}>مسافر {i+1}</Text>{travelers.length>1&&<Pressable onPress={()=>setTravelers(v=>v.filter(x=>x.id!==t.id))}><Text style={s.remove}>حذف</Text></Pressable>}</View><TextInput value={t.name} onChangeText={name=>update(t.id,{name})} placeholder="الاسم الكامل" style={s.input} textAlign="right"/><View style={s.two}><TextInput value={t.passport} onChangeText={passport=>update(t.id,{passport})} placeholder="رقم الجواز" style={[s.input,s.flex]} textAlign="right"/><TextInput value={t.nationality} onChangeText={nationality=>update(t.id,{nationality})} placeholder="الجنسية" style={[s.input,s.flex]} textAlign="right"/></View><TextInput value={t.guarantorNumber} onChangeText={guarantorNumber=>update(t.id,{guarantorNumber})} placeholder="رقم الضامن" style={s.input} textAlign="right"/><DocRow label="صورة الجواز" file={t.docs.passport} onPick={()=>pickDocument(t.id,"passport","صورة الجواز")} onRemove={()=>removeDocument(t.id,"passport")}/><DocRow label="هوية الضامن / أبشر" file={t.docs.guarantorId} onPick={()=>pickDocument(t.id,"guarantorId","هوية الضامن / أبشر")} onRemove={()=>removeDocument(t.id,"guarantorId")}/></View>)}<Pressable disabled={travelers.length>=20} style={[s.add,travelers.length>=20&&s.disabled]} onPress={()=>setTravelers(v=>[...v,makeTraveler(v.length+1)])}><Text style={s.addText}>+ إضافة مسافر</Text></Pressable>{!!error&&<Text style={s.error}>{error}</Text>}<Pressable disabled={!complete} style={[s.primary,!complete&&s.disabled]} onPress={()=>setReview(true)}><Text style={s.primaryText}>مراجعة الطلب</Text></Pressable></ScrollView></SafeAreaView>;
}
function DocRow({label,file,onPick,onRemove}:{label:string;file:UploadAsset|null;onPick:()=>void;onRemove:()=>void}){return <View style={s.doc}><View style={s.docInfo}><Text style={s.docLabel}>{label}</Text><Text numberOfLines={1} style={file?s.ok:s.pending}>{file?file.name:"مطلوب — صورة أو PDF"}</Text></View><Pressable onPress={file?onRemove:onPick} style={[s.docButton,file&&s.docDone]}><Text style={file?s.docDoneText:s.docButtonText}>{file?"إزالة":"اختيار ملف"}</Text></Pressable></View>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:14,paddingBottom:40},successPage:{flex:1,padding:26,justifyContent:"center",gap:14},title:{fontSize:20,fontWeight:"800",color:colors.navy,textAlign:"right"},desc:{fontSize:12,color:colors.muted,textAlign:"right"},sectionTitle:{fontSize:14,fontWeight:"900",color:colors.navy,textAlign:"right"},packages:{gap:9},packageCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,gap:5},packageActive:{borderColor:colors.gold,borderWidth:2},packageHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},selected:{fontSize:10,color:colors.success,fontWeight:"800"},price:{fontSize:14,fontWeight:"900",color:colors.text,textAlign:"right"},sdg:{fontSize:10.5,color:colors.gold,fontWeight:"700",textAlign:"right"},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,gap:10},cardHead:{flexDirection:"row-reverse",justifyContent:"space-between"},cardTitle:{fontSize:13,fontWeight:"800",color:colors.navy,textAlign:"right"},remove:{color:colors.danger,fontSize:11,fontWeight:"700"},input:{backgroundColor:colors.soft,borderWidth:1,borderColor:colors.border,borderRadius:9,padding:11,fontSize:12.5},two:{flexDirection:"row-reverse",gap:8},flex:{flex:1},doc:{backgroundColor:colors.soft,borderRadius:9,padding:10,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:8},docInfo:{flex:1},docLabel:{fontSize:11.5,color:colors.text,textAlign:"right"},pending:{fontSize:9.5,color:colors.subtle,textAlign:"right",marginTop:2},ok:{fontSize:10,color:colors.success,textAlign:"right",marginTop:4},docButton:{backgroundColor:colors.navy,borderRadius:999,paddingHorizontal:13,paddingVertical:7},docButtonText:{color:"#FFF",fontSize:10.5,fontWeight:"700"},docDone:{backgroundColor:"#E8F7ED"},docDoneText:{color:colors.success,fontSize:10.5,fontWeight:"700"},add:{borderWidth:1.5,borderStyle:"dashed",borderColor:colors.navy,borderRadius:10,padding:12},addText:{color:colors.navy,fontWeight:"800",textAlign:"center"},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14,flex:2},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.4},note:{fontSize:11,color:colors.subtle,lineHeight:18,textAlign:"right"},actions:{flexDirection:"row-reverse",gap:10},outline:{borderWidth:1.5,borderColor:colors.navy,borderRadius:10,padding:13,flex:1},outlineText:{color:colors.navy,fontWeight:"800",textAlign:"center"},line:{fontSize:12,color:colors.muted,textAlign:"right"},error:{fontSize:11,color:colors.danger,textAlign:"right"},successIcon:{fontSize:42,color:colors.success,textAlign:"center",fontWeight:"900"},requestBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:18},label:{fontSize:11,color:colors.muted,textAlign:"center"},requestId:{fontFamily:"monospace",fontSize:17,fontWeight:"900",color:colors.navy,textAlign:"center",marginTop:6}});
