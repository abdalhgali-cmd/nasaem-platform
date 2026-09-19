import { useEffect,useMemo,useState } from "react";
import { router,useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { submitContactRequest,submitContactRequestWithDocuments,UploadAsset } from "../../src/api/requests";
import { getPublicServices,getServiceRequirements,getVisaRequirements,PublicRequirement } from "../../src/api/services";
import { colors } from "../../src/theme";

type Meta={title:string;fields:string[];note:string;nameField:string;phoneField:string;travelerField?:string};
const META:Record<string,Meta>={
 flights:{title:"حجز الطيران",fields:["الاسم الكامل","مدينة المغادرة","الوجهة","تاريخ السفر","تاريخ العودة (اختياري)","عدد المسافرين","الدرجة المفضلة","رقم الهاتف"],note:"سنراجع الرحلة والسعر والتوفر قبل تأكيد الدفع.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد المسافرين"},
 visas:{title:"التأشيرات",fields:["الدولة","نوع التأشيرة","الاسم حسب الجواز","رقم الجواز","الجنسية","تاريخ السفر المتوقع","رقم الهاتف"],note:"المتطلبات والسعر النهائي يعتمدان على نوع التأشيرة المنشور من الإدارة.",nameField:"الاسم حسب الجواز",phoneField:"رقم الهاتف"},
 ferries:{title:"حجز البواخر",fields:["الاسم الكامل","ميناء المغادرة","ميناء الوصول","تاريخ السفر","عدد المسافرين","شركة الباخرة (اختياري)","رقم الهاتف"],note:"سيتم تأكيد المقاعد والسعر بعد مراجعة الوكالة.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد المسافرين"},
 hotels:{title:"الفنادق والسياحة",fields:["الاسم الكامل","المدينة / الوجهة","تاريخ الدخول","تاريخ الخروج","عدد النزلاء","عدد الغرف","ملاحظات","رقم الهاتف"],note:"نراجع التوفر ونرسل العرض قبل الدفع.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد النزلاء"},
 egypt:{title:"الموافقة الأمنية لمصر",fields:["الاسم حسب الجواز","رقم الجواز","الجنسية","تاريخ الميلاد","طريقة السفر (جوي / بري)","منفذ الوصول","رقم الهاتف"],note:"سنراجع البيانات والمستندات قبل اعتماد الموافقة.",nameField:"الاسم حسب الجواز",phoneField:"رقم الهاتف"},
 family:{title:"الزيارة العائلية السعودية",fields:["اسم مقدم الطلب","رقم الطلب / التأشيرة إن وجد","صلة القرابة","عدد الزوار","مرحلة المعاملة الحالية","رقم الهاتف"],note:"يمكن متابعة مراحل الطلب بعد إنشائه من صفحة التتبع.",nameField:"اسم مقدم الطلب",phoneField:"رقم الهاتف",travelerField:"عدد الزوار"},
 generic:{title:"طلب خدمة",fields:["الاسم","رقم الهاتف","ملاحظات"],note:"سيتم مراجعة الطلب من الوكالة.",nameField:"الاسم",phoneField:"رقم الهاتف"},
};


function requirementApplies(req:PublicRequirement,answers:Record<string,string>){
 if(!req.conditionRequirementId||!req.conditionOperator)return true;
 const actual=answers[req.conditionRequirementId]??"";
 const expected=req.conditionValue??"";
 if(req.conditionOperator==="EQUALS")return String(actual)===String(expected);
 if(req.conditionOperator==="NOT_EQUALS")return String(actual)!==String(expected);
 const a=Number(actual),e=Number(expected);
 if(Number.isNaN(a)||Number.isNaN(e))return false;
 return req.conditionOperator==="GREATER_THAN"?a>e:a<e;
}

function matchesKind(kind:string,category?:string|null,code?:string){
 const c=(category??"").toLowerCase(),x=(code??"").toUpperCase();
 if(kind==="egypt") return x==="SVC-EGYPT-CLEARANCE";
 if(kind==="flights") return c.includes("flight");
 if(kind==="ferries") return c.includes("ferry");
 if(kind==="hotels") return c.includes("hotel")||c.includes("tour")||c==="package";
 if(kind==="family") return c.includes("family");
 return false;
}

export default function ServiceRequest(){
 const params=useLocalSearchParams<{kind:string;serviceId?:string;visaTypeId?:string;serviceName?:string;country?:string;visaTypeName?:string}>();
 const kind=params.kind??"generic";
 const meta=META[kind]??META.generic;
 const [values,setValues]=useState<Record<string,string>>(()=>({
   ...(params.country?{"الدولة":params.country}:{}),
   ...(params.visaTypeName?{"نوع التأشيرة":params.visaTypeName}:{}),
 }));
 const [serviceId,setServiceId]=useState(params.serviceId??"");
 const [serviceName,setServiceName]=useState(params.serviceName??meta.title);
 const [requirements,setRequirements]=useState<PublicRequirement[]>([]);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [docs,setDocs]=useState<Record<string,UploadAsset|null>>({});
 const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[loadingReq,setLoadingReq]=useState(true);
 const [error,setError]=useState(""),[requestId,setRequestId]=useState<string|null>(null);

 useEffect(()=>{
   let active=true;
   (async()=>{
     try{
       let resolvedServiceId=serviceId;
       if(!resolvedServiceId && kind!=="visas"){
         const services=await getPublicServices();
         const found=services.find(s=>matchesKind(kind,s.category,s.code));
         if(found){resolvedServiceId=found.id; if(active){setServiceId(found.id);setServiceName(found.name??meta.title);}}
       }
       const list=params.visaTypeId?await getVisaRequirements(params.visaTypeId):resolvedServiceId?await getServiceRequirements(resolvedServiceId):[];
       if(active)setRequirements(list);
     }catch{if(active)setError("تعذر تحميل متطلبات الخدمة من الإدارة.");}
     finally{if(active)setLoadingReq(false);}
   })();
   return()=>{active=false};
 },[kind,params.visaTypeId]);

 const requiredBase=useMemo(()=>meta.fields.filter(x=>!x.includes("اختياري")&&!x.includes("ملاحظات")&&!x.includes("إن وجد")).every(x=>values[x]?.trim()),[values,meta.fields]);
 const activeRequirements=useMemo(()=>requirements.filter(r=>requirementApplies(r,answers)),[requirements,answers]);
 const requiredDynamic=useMemo(()=>activeRequirements.filter(r=>r.required).every(r=>r.type==="DOCUMENT"?Boolean(docs[r.id]):Boolean(answers[r.id]?.trim())),[activeRequirements,docs,answers]);
 const complete=requiredBase&&requiredDynamic;

 async function pickRequirement(req:PublicRequirement){
   const types=req.allowedMimeTypes?.length?req.allowedMimeTypes:["image/jpeg","image/png","image/webp","application/pdf"];
   const result=await DocumentPicker.getDocumentAsync({type:types,copyToCacheDirectory:true,multiple:false});
   if(result.canceled)return;
   const a=result.assets[0];
   setDocs(d=>({...d,[req.id]:{uri:a.uri,name:a.name,mimeType:a.mimeType,label:req.name,requirementId:req.id,travelerIndex:req.scope==="TRAVELER"?0:undefined}}));
 }

 async function submit(){
   try{
     setBusy(true);setError("");
     const travelerCountRaw=meta.travelerField?Number(values[meta.travelerField]):undefined;
     const traveler=(kind==="visas"||kind==="egypt")?[{fullName:values[meta.nameField],passportNo:values["رقم الجواز"]||undefined,nationality:values["الجنسية"]||undefined,birthDate:values["تاريخ الميلاد"]||undefined,isPrimary:true}]:undefined;
     const input={name:values[meta.nameField],phone:values[meta.phoneField],service:serviceName||meta.title,message:`طلب ${serviceName||meta.title} عبر تطبيق نسائم الحرمين`,serviceId:serviceId||undefined,visaTypeId:params.visaTypeId||undefined,travelerCount:travelerCountRaw&&travelerCountRaw>0?travelerCountRaw:traveler?.length,intakeData:{kind,fields:values},answers,travelers:traveler};
     const files=Object.values(docs).filter(Boolean) as UploadAsset[];
     const id=files.length?await submitContactRequestWithDocuments(input,files):await submitContactRequest(input);
     setRequestId(id);
   }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الطلب");}
   finally{setBusy(false);}
 }

 if(requestId)return <SafeAreaView style={s.safe}><View style={s.successPage}><Text style={s.successIcon}>✓</Text><Text style={s.title}>تم استلام طلبك</Text><Text style={s.desc}>تم حفظ الطلب والمستندات فعليًا وسيظهر لفريق الإدارة.</Text><View style={s.requestBox}><Text style={s.label}>رقم الطلب</Text><Text style={s.requestId}>{requestId}</Text></View><Pressable style={s.primary} onPress={()=>router.push({pathname:"/track",params:{requestId,phone:values[meta.phoneField]}})}><Text style={s.primaryText}>متابعة الطلب</Text></Pressable></View></SafeAreaView>;

 if(review)return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>مراجعة {serviceName||meta.title}</Text>{meta.fields.map(f=>values[f]?<Review key={f} label={f} value={values[f]}/>:null)}{activeRequirements.map(r=><Review key={r.id} label={r.name} value={r.type==="DOCUMENT"?(docs[r.id]?.name??"غير مرفق"):(answers[r.id]??"")}/>)}<Text style={s.note}>{meta.note}</Text>{!!error&&<Text style={s.error}>{error}</Text>}<View style={s.actions}><Pressable style={s.outline} onPress={()=>setReview(false)} disabled={busy}><Text style={s.outlineText}>تعديل</Text></Pressable><Pressable style={s.primary} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>إرسال للوكالة</Text>}</Pressable></View></ScrollView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>{serviceName||meta.title}</Text><Text style={s.desc}>{meta.note}</Text>{meta.fields.map(f=><View key={f}><Text style={s.label}>{f}</Text><TextInput editable={!(kind==="visas"&&(f==="الدولة"||f==="نوع التأشيرة"))} value={values[f]??""} onChangeText={v=>setValues(x=>({...x,[f]:v}))} placeholder={f} style={[s.input,kind==="visas"&&(f==="الدولة"||f==="نوع التأشيرة")&&s.readonly]} textAlign="right" multiline={f==="ملاحظات"} keyboardType={f.includes("عدد")||f==="رقم الهاتف"?"phone-pad":"default"}/></View>)}{loadingReq?<ActivityIndicator color={colors.navy}/>:activeRequirements.length>0&&<View style={s.requirements}><Text style={s.sectionTitle}>المتطلبات</Text>{activeRequirements.map(r=><RequirementField key={r.id} req={r} answer={answers[r.id]??""} file={docs[r.id]??null} onAnswer={v=>setAnswers(a=>({...a,[r.id]:v}))} onPick={()=>pickRequirement(r)} onRemove={()=>setDocs(d=>({...d,[r.id]:null}))}/>)}</View>}{!!error&&<Text style={s.error}>{error}</Text>}<Pressable disabled={!complete} style={[s.primary,!complete&&s.disabled]} onPress={()=>setReview(true)}><Text style={s.primaryText}>مراجعة الطلب</Text></Pressable></ScrollView></SafeAreaView>;
}

function RequirementField({req,answer,file,onAnswer,onPick,onRemove}:{req:PublicRequirement;answer:string;file:UploadAsset|null;onAnswer:(v:string)=>void;onPick:()=>void;onRemove:()=>void}){
 const opts=Array.isArray(req.options)?req.options.map(String):[];
 if(req.type==="DOCUMENT")return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text>{!!req.description&&<Text style={s.reqDesc}>{req.description}</Text>}<Pressable style={[s.docButton,file&&s.docDone]} onPress={file?onRemove:onPick}><Text style={file?s.docDoneText:s.docButtonText}>{file?`✓ ${file.name}`:"اختيار ملف"}</Text></Pressable></View>;
 if(req.type==="YES_NO")return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text><View style={s.chips}>{["نعم","لا"].map(v=><Pressable key={v} style={[s.chip,answer===v&&s.chipActive]} onPress={()=>onAnswer(v)}><Text style={answer===v?s.chipTextActive:s.chipText}>{v}</Text></Pressable>)}</View></View>;
 if(req.type==="SELECT"&&opts.length)return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text><View style={s.chips}>{opts.map(v=><Pressable key={v} style={[s.chip,answer===v&&s.chipActive]} onPress={()=>onAnswer(v)}><Text style={answer===v?s.chipTextActive:s.chipText}>{v}</Text></Pressable>)}</View></View>;
 return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text>{!!req.description&&<Text style={s.reqDesc}>{req.description}</Text>}<TextInput value={answer} onChangeText={onAnswer} placeholder={req.name} style={s.input} textAlign="right" keyboardType={req.type==="NUMBER"?"numeric":"default"}/></View>;
}
function Review({label,value}:{label:string;value:string}){return <View style={s.review}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:12,paddingBottom:40},successPage:{flex:1,padding:26,justifyContent:"center",gap:14},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},label:{fontSize:11,color:colors.muted,textAlign:"right",marginBottom:5},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,fontSize:12.5,minHeight:44},readonly:{backgroundColor:"#F1F3F5",color:colors.muted},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14,flex:2},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.4},review:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12},value:{fontSize:13,fontWeight:"700",color:colors.text,textAlign:"right"},note:{fontSize:11,color:colors.subtle,textAlign:"right",lineHeight:18},actions:{flexDirection:"row-reverse",gap:10},outline:{borderWidth:1.5,borderColor:colors.navy,borderRadius:10,padding:13,flex:1},outlineText:{color:colors.navy,fontWeight:"800",textAlign:"center"},error:{color:colors.danger,textAlign:"right",fontSize:11},successIcon:{fontSize:42,color:colors.success,textAlign:"center",fontWeight:"900"},requestBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:18},requestId:{fontFamily:"monospace",fontSize:17,fontWeight:"900",color:colors.navy,textAlign:"center",marginTop:6},requirements:{gap:10,marginTop:4},sectionTitle:{fontSize:15,fontWeight:"900",color:colors.navy,textAlign:"right"},reqCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,gap:7},reqTitle:{fontSize:12,fontWeight:"800",color:colors.text,textAlign:"right"},reqDesc:{fontSize:10.5,color:colors.muted,textAlign:"right",lineHeight:17},docButton:{backgroundColor:colors.navy,borderRadius:9,padding:11},docButtonText:{color:"#FFF",fontWeight:"700",textAlign:"center",fontSize:11},docDone:{backgroundColor:"#E8F7ED"},docDoneText:{color:colors.success,fontWeight:"700",textAlign:"center",fontSize:11},chips:{flexDirection:"row-reverse",flexWrap:"wrap",gap:8},chip:{borderWidth:1,borderColor:colors.border,borderRadius:999,paddingHorizontal:12,paddingVertical:8},chipActive:{backgroundColor:colors.navy,borderColor:colors.navy},chipText:{color:colors.text,fontSize:11},chipTextActive:{color:"#FFF",fontSize:11,fontWeight:"700"}});
