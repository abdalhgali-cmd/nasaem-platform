import { useEffect,useMemo,useState } from "react";
import { router,useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ActivityIndicator,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from "react-native";
import { submitContactRequest,submitContactRequestWithDocuments,UploadAsset } from "../../src/api/requests";
import { getPublicServices,getPublicVisaTypes,getServiceRequirements,getVisaRequirements,PublicRequirement } from "../../src/api/services";
import { colors } from "../../src/theme";

type Meta={title:string;fields:string[];note:string;nameField:string;phoneField:string;travelerField?:string;multiTraveler?:boolean};
const META:Record<string,Meta>={
 flights:{title:"حجز الطيران",fields:["الاسم الكامل","مدينة المغادرة","الوجهة","تاريخ السفر","تاريخ العودة (اختياري)","عدد المسافرين","الدرجة المفضلة","رقم الهاتف"],note:"سنراجع الرحلة والسعر والتوفر قبل تأكيد الدفع.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد المسافرين"},
 visas:{title:"التأشيرات",fields:["الدولة","نوع التأشيرة","الاسم حسب الجواز","رقم الجواز","الجنسية","تاريخ السفر المتوقع","رقم الهاتف"],note:"المتطلبات والسعر النهائي يعتمدان على نوع التأشيرة المنشور من الإدارة.",nameField:"الاسم حسب الجواز",phoneField:"رقم الهاتف"},
 ferries:{title:"حجز البواخر",fields:["الاسم الكامل","ميناء المغادرة","ميناء الوصول","تاريخ السفر","عدد المسافرين","شركة الباخرة (اختياري)","رقم الهاتف"],note:"سيتم تأكيد المقاعد والسعر بعد مراجعة الوكالة.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد المسافرين"},
 hotels:{title:"الفنادق والسياحة",fields:["الاسم الكامل","المدينة / الوجهة","تاريخ الدخول","تاريخ الخروج","عدد النزلاء","عدد الغرف","ملاحظات","رقم الهاتف"],note:"نراجع التوفر ونرسل العرض قبل الدفع.",nameField:"الاسم الكامل",phoneField:"رقم الهاتف",travelerField:"عدد النزلاء"},
 // Traveler identity (name/passport/nationality/DOB) moved into the
 // per-traveler list below instead of a single flat set of fields — the
 // Egypt Security Approval request supports multiple travelers, each with
 // independent passport data and an independently uploaded passport copy
 // (see travelers/documentTravelerRequirements). "طريقة السفر" was removed
 // from here: it duplicated the dynamic egypt_entry_mode requirement the
 // Requirements Engine already serves for this VisaType — case-level for
 // now, since ContactRequest.intakeData.answers has no per-traveler
 // dimension (a genuine backend data-model gap, not a mobile choice; see
 // the Phase 4 note in the PR description).
 egypt:{title:"الموافقة الأمنية لمصر",fields:["منفذ الوصول","رقم الهاتف"],note:"سنراجع البيانات والمستندات قبل اعتماد الموافقة. يمكنك إضافة أكثر من مسافر لنفس الطلب.",nameField:"رقم الهاتف",phoneField:"رقم الهاتف",multiTraveler:true},
 family:{title:"الزيارة العائلية السعودية",fields:["اسم مقدم الطلب","رقم الطلب / التأشيرة إن وجد","صلة القرابة","مرحلة المعاملة الحالية","رقم الهاتف"],note:"أضف بيانات كل زائر وارفع مستندات الزيارة المنشورة من الإدارة. يمكن متابعة مراحل الطلب بعد إنشائه من صفحة التتبع.",nameField:"اسم مقدم الطلب",phoneField:"رقم الهاتف",multiTraveler:true},
 generic:{title:"طلب خدمة",fields:["الاسم","رقم الهاتف","ملاحظات"],note:"سيتم مراجعة الطلب من الوكالة.",nameField:"الاسم",phoneField:"رقم الهاتف"},
};

type TravelerEntry={id:string;fullName:string;passportNo:string;nationality:string;birthDate:string};
const makeTravelerEntry=(n:number):TravelerEntry=>({id:`traveler-${Date.now()}-${n}`,fullName:"",passportNo:"",nationality:"",birthDate:""});


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
 const params=useLocalSearchParams<{kind:string;serviceId?:string;visaTypeId?:string;serviceName?:string;country?:string;visaTypeName?:string;from?:string;to?:string;date?:string;returnDate?:string;travelers?:string;tripType?:string;selectedFlight?:string;origin?:string;destination?:string;operatorName?:string;scheduleId?:string;departureTime?:string;basePrice?:string;currency?:string}>();
 const kind=params.kind??"generic";
 const meta=META[kind]??META.generic;
 const [values,setValues]=useState<Record<string,string>>(()=>({
   ...(params.country?{"الدولة":params.country}:{}),
   ...(params.visaTypeName?{"نوع التأشيرة":params.visaTypeName}:{}),
   ...(kind==="flights"&&params.from?{"مدينة المغادرة":params.from}:{}),
   ...(kind==="flights"&&params.to?{"الوجهة":params.to}:{}),
   ...(kind==="flights"&&params.date?{"تاريخ السفر":params.date}:{}),
   ...(kind==="flights"&&params.returnDate?{"تاريخ العودة (اختياري)":params.returnDate}:{}),
   ...(kind==="flights"&&params.travelers?{"عدد المسافرين":params.travelers}:{}),
   ...(kind==="ferries"&&params.origin?{"ميناء المغادرة":params.origin}:{}),
   ...(kind==="ferries"&&params.destination?{"ميناء الوصول":params.destination}:{}),
   ...(kind==="ferries"&&params.date?{"تاريخ السفر":params.date}:{}),
   ...(kind==="ferries"&&params.operatorName?{"شركة الباخرة (اختياري)":params.operatorName}:{}),
 }));
 const [serviceId,setServiceId]=useState(params.serviceId??"");
 const [serviceName,setServiceName]=useState(params.serviceName??meta.title);
 const [requirements,setRequirements]=useState<PublicRequirement[]>([]);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [docs,setDocs]=useState<Record<string,UploadAsset|null>>({});
 const [effectiveVisaTypeId,setEffectiveVisaTypeId]=useState(params.visaTypeId??"");
 const [travelers,setTravelers]=useState<TravelerEntry[]>(()=>meta.multiTraveler?[makeTravelerEntry(1)]:[]);
 // travelerId -> requirementId -> uploaded file. Keyed by travelerId (not
 // array index) so removing an earlier traveler never re-associates a
 // later traveler's already-uploaded document with the wrong requirement.
 const [travelerDocs,setTravelerDocs]=useState<Record<string,Record<string,UploadAsset|null>>>({});
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
       let resolvedVisaTypeId=params.visaTypeId;
       // Egypt's requirement checklist (passport, entry mode) is attached
       // to its VisaType (VISA-EGYPT-CLEARANCE), not to the Service — a
       // requirements/public lookup by serviceId alone returns nothing for
       // it. Home/Services/the Request hub all link into this screen with
       // only a serviceId, so the VisaType must be resolved here rather
       // than silently falling through to an empty checklist.
       if(!resolvedVisaTypeId && (kind==="egypt"||kind==="family")){
         try{
           const visaTypes=await getPublicVisaTypes();
           const expectedCode=kind==="egypt"?"VISA-EGYPT-CLEARANCE":"VISA-FAMILY-VISIT";
           const matchingVisaType=visaTypes.find(v=>(v.code??"").toUpperCase()===expectedCode)??visaTypes.find(v=>v.serviceId===resolvedServiceId);
           if(matchingVisaType)resolvedVisaTypeId=matchingVisaType.id;
         }catch{/* falls through to the serviceId-based lookup below */}
       }
       if(active&&resolvedVisaTypeId)setEffectiveVisaTypeId(resolvedVisaTypeId);
       const list=resolvedVisaTypeId?await getVisaRequirements(resolvedVisaTypeId):resolvedServiceId?await getServiceRequirements(resolvedServiceId):[];
       if(active)setRequirements(list);
     }catch{if(active)setError("تعذر تحميل متطلبات الخدمة من الإدارة.");}
     finally{if(active)setLoadingReq(false);}
   })();
   return()=>{active=false};
 },[kind,meta.title,params.visaTypeId,serviceId]);

 const requiredBase=useMemo(()=>meta.fields.filter(x=>!x.includes("اختياري")&&!x.includes("ملاحظات")&&!x.includes("إن وجد")).every(x=>values[x]?.trim()),[values,meta.fields]);
 const activeRequirements=useMemo(()=>requirements.filter(r=>requirementApplies(r,answers)),[requirements,answers]);
 // For a multi-traveler kind, a TRAVELER-scoped DOCUMENT requirement (e.g.
 // Egypt's passport copy) is rendered and uploaded once per traveler below
 // instead of once globally — otherwise traveler #2's upload would
 // overwrite traveler #1's in the shared `docs` map. Every other
 // requirement (case-level fields, and non-document TRAVELER-scoped
 // answers like entry mode — see the `answers` map's single-value-per-
 // request shape, a real backend data-model limit, not a UI choice) keeps
 // rendering exactly as it did before.
 const documentTravelerRequirements=useMemo(()=>meta.multiTraveler?activeRequirements.filter(r=>r.scope==="TRAVELER"&&r.type==="DOCUMENT"):[],[activeRequirements,meta.multiTraveler]);
 const caseRequirements=useMemo(()=>meta.multiTraveler?activeRequirements.filter(r=>!(r.scope==="TRAVELER"&&r.type==="DOCUMENT")):activeRequirements,[activeRequirements,meta.multiTraveler]);
 const requiredDynamic=useMemo(()=>caseRequirements.filter(r=>r.required).every(r=>r.type==="DOCUMENT"?Boolean(docs[r.id]):Boolean(answers[r.id]?.trim())),[caseRequirements,docs,answers]);
 const travelersComplete=useMemo(()=>!meta.multiTraveler||travelers.every(t=>t.fullName.trim()&&t.passportNo.trim()&&t.nationality.trim()&&t.birthDate.trim()),[travelers,meta.multiTraveler]);
 const travelerDocsComplete=useMemo(()=>!meta.multiTraveler||travelers.every(t=>documentTravelerRequirements.filter(r=>r.required).every(r=>Boolean(travelerDocs[t.id]?.[r.id]))),[travelers,travelerDocs,documentTravelerRequirements,meta.multiTraveler]);
 const complete=requiredBase&&requiredDynamic&&travelersComplete&&travelerDocsComplete;

 async function pickRequirement(req:PublicRequirement){
   const types=req.allowedMimeTypes?.length?req.allowedMimeTypes:["image/jpeg","image/png","image/webp","application/pdf"];
   const result=await DocumentPicker.getDocumentAsync({type:types,copyToCacheDirectory:true,multiple:false});
   if(result.canceled)return;
   const a=result.assets[0];
   setDocs(d=>({...d,[req.id]:{uri:a.uri,name:a.name,mimeType:a.mimeType,label:req.name,requirementId:req.id,travelerIndex:req.scope==="TRAVELER"?0:undefined}}));
 }

 async function pickTravelerRequirement(travelerId:string,req:PublicRequirement){
   const types=req.allowedMimeTypes?.length?req.allowedMimeTypes:["image/jpeg","image/png","image/webp","application/pdf"];
   const result=await DocumentPicker.getDocumentAsync({type:types,copyToCacheDirectory:true,multiple:false});
   if(result.canceled)return;
   const a=result.assets[0];
   setTravelerDocs(d=>({...d,[travelerId]:{...d[travelerId],[req.id]:{uri:a.uri,name:a.name,mimeType:a.mimeType,label:req.name}}}));
 }
 function removeTravelerDocument(travelerId:string,requirementId:string){
   setTravelerDocs(d=>({...d,[travelerId]:{...d[travelerId],[requirementId]:null}}));
 }
 function updateTraveler(id:string,patch:Partial<TravelerEntry>){
   setTravelers(v=>v.map(t=>t.id===id?{...t,...patch}:t));
 }
 function addTraveler(){
   setTravelers(v=>[...v,makeTravelerEntry(v.length+1)]);
 }
 function removeTraveler(id:string){
   setTravelers(v=>v.filter(t=>t.id!==id));
   setTravelerDocs(d=>{const next={...d};delete next[id];return next;});
 }

 async function submit(){
   try{
     setBusy(true);setError("");
     const travelerCountRaw=meta.travelerField?Number(values[meta.travelerField]):undefined;
     const traveler=meta.multiTraveler
       ?travelers.map((t,index)=>({fullName:t.fullName,passportNo:t.passportNo||undefined,nationality:t.nationality||undefined,birthDate:t.birthDate||undefined,isPrimary:index===0}))
       :kind==="visas"?[{fullName:values[meta.nameField],passportNo:values["رقم الجواز"]||undefined,nationality:values["الجنسية"]||undefined,birthDate:values["تاريخ الميلاد"]||undefined,isPrimary:true}]:undefined;
     const selectedFlight=(()=>{try{return params.selectedFlight?JSON.parse(params.selectedFlight):undefined;}catch{return undefined;}})();
     const intakeSelection=kind==="flights"?{tripType:params.tripType,selectedFlight}:kind==="ferries"?{scheduleId:params.scheduleId,operatorName:params.operatorName,departureTime:params.departureTime,basePrice:params.basePrice,currency:params.currency}:undefined;
     const requestName=kind==="family"?values[meta.nameField]:meta.multiTraveler?(travelers[0]?.fullName||serviceName||meta.title):values[meta.nameField];
     const input={name:requestName,phone:values[meta.phoneField],service:serviceName||meta.title,message:`طلب ${serviceName||meta.title} عبر تطبيق نسائم الحرمين`,serviceId:serviceId||undefined,visaTypeId:effectiveVisaTypeId||undefined,travelerCount:travelerCountRaw&&travelerCountRaw>0?travelerCountRaw:traveler?.length,intakeData:{kind,fields:values,...(intakeSelection?{selection:intakeSelection}:{})},answers,travelers:traveler};
     const caseFiles=Object.values(docs).filter(Boolean) as UploadAsset[];
     // Each traveler's documents are tagged with that traveler's actual
     // array position — the same travelerIndex convention
     // submitContactRequestWithDocuments already uses to associate an
     // uploaded file with the Traveler row created from `travelers[index]`
     // (see mobile/app/umrah.tsx for the same pattern), so traveler #2's
     // passport can never land on traveler #1's record.
     const travelerFiles:UploadAsset[]=meta.multiTraveler
       ?travelers.flatMap((t,index)=>documentTravelerRequirements.reduce<UploadAsset[]>((acc,r)=>{
           const asset=travelerDocs[t.id]?.[r.id];
           if(asset)acc.push({...asset,requirementId:r.id,travelerIndex:index,label:r.name});
           return acc;
         },[]))
       :[];
     const files=[...caseFiles,...travelerFiles];
     const id=files.length?await submitContactRequestWithDocuments(input,files):await submitContactRequest(input);
     setRequestId(id);
   }catch(e){setError(e instanceof Error?e.message:"تعذر إرسال الطلب");}
   finally{setBusy(false);}
 }

 if(requestId)return <SafeAreaView style={s.safe}><View style={s.successPage}><Text style={s.successIcon}>✓</Text><Text style={s.title}>تم استلام طلبك</Text><Text style={s.desc}>تم حفظ الطلب والمستندات فعليًا وسيظهر لفريق الإدارة.</Text><View style={s.requestBox}><Text style={s.label}>رقم الطلب</Text><Text style={s.requestId}>{requestId}</Text></View><Pressable style={s.primary} onPress={()=>router.push({pathname:"/track",params:{requestId,phone:values[meta.phoneField]}})}><Text style={s.primaryText}>متابعة الطلب</Text></Pressable></View></SafeAreaView>;

 if(review)return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>مراجعة {serviceName||meta.title}</Text>{meta.fields.map(f=>values[f]?<Review key={f} label={f} value={values[f]}/>:null)}{meta.multiTraveler?travelers.map((t,i)=><View key={t.id} style={s.card}><Text style={s.cardTitle}>مسافر {i+1} — {t.fullName}</Text><Text style={s.line}>الجواز: {t.passportNo}</Text><Text style={s.line}>الجنسية: {t.nationality}</Text><Text style={s.line}>تاريخ الميلاد: {t.birthDate}</Text>{documentTravelerRequirements.map(r=><Text key={r.id} style={travelerDocs[t.id]?.[r.id]?s.ok:s.error}>{travelerDocs[t.id]?.[r.id]?`✓ ${r.name}: ${travelerDocs[t.id]?.[r.id]?.name}`:`${r.name}: غير مرفق`}</Text>)}</View>):null}{caseRequirements.map(r=><Review key={r.id} label={r.name} value={r.type==="DOCUMENT"?(docs[r.id]?.name??"غير مرفق"):(answers[r.id]??"")}/>)}<Text style={s.note}>{meta.note}</Text>{!!error&&<Text style={s.error}>{error}</Text>}<View style={s.actions}><Pressable style={s.outline} onPress={()=>setReview(false)} disabled={busy}><Text style={s.outlineText}>تعديل</Text></Pressable><Pressable style={s.primary} onPress={submit} disabled={busy}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>إرسال للوكالة</Text>}</Pressable></View></ScrollView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.title}>{serviceName||meta.title}</Text><Text style={s.desc}>{meta.note}</Text>{meta.fields.map(f=><View key={f}><Text style={s.label}>{f}</Text><TextInput editable={!(kind==="visas"&&(f==="الدولة"||f==="نوع التأشيرة"))} value={values[f]??""} onChangeText={v=>setValues(x=>({...x,[f]:v}))} placeholder={f} style={[s.input,kind==="visas"&&(f==="الدولة"||f==="نوع التأشيرة")&&s.readonly]} textAlign="right" multiline={f==="ملاحظات"} keyboardType={f.includes("عدد")||f==="رقم الهاتف"?"phone-pad":"default"}/></View>)}
 {meta.multiTraveler&&<View style={s.requirements}>
   <Text style={s.sectionTitle}>المسافرون</Text>
   {travelers.map((t,i)=><View key={t.id} style={s.card}>
     <View style={s.cardHead}><Text style={s.cardTitle}>مسافر {i+1}</Text>{travelers.length>1&&<Pressable onPress={()=>removeTraveler(t.id)}><Text style={s.remove}>حذف</Text></Pressable>}</View>
     <TextInput value={t.fullName} onChangeText={v=>updateTraveler(t.id,{fullName:v})} placeholder="الاسم الكامل حسب الجواز" style={s.input} textAlign="right"/>
     <View style={s.two}><TextInput value={t.passportNo} onChangeText={v=>updateTraveler(t.id,{passportNo:v})} placeholder="رقم الجواز" style={[s.input,s.flex]} textAlign="right"/><TextInput value={t.nationality} onChangeText={v=>updateTraveler(t.id,{nationality:v})} placeholder="الجنسية" style={[s.input,s.flex]} textAlign="right"/></View>
     <TextInput value={t.birthDate} onChangeText={v=>updateTraveler(t.id,{birthDate:v})} placeholder="تاريخ الميلاد (YYYY-MM-DD)" style={s.input} textAlign="right"/>
     {documentTravelerRequirements.map(r=><View key={r.id} style={s.reqCard}><Text style={s.reqTitle}>{r.name}{r.required?" *":""}</Text>{!!r.description&&<Text style={s.reqDesc}>{r.description}</Text>}<Pressable style={[s.docButton,travelerDocs[t.id]?.[r.id]&&s.docDone]} onPress={()=>travelerDocs[t.id]?.[r.id]?removeTravelerDocument(t.id,r.id):pickTravelerRequirement(t.id,r)}><Text style={travelerDocs[t.id]?.[r.id]?s.docDoneText:s.docButtonText}>{travelerDocs[t.id]?.[r.id]?`✓ ${travelerDocs[t.id]?.[r.id]?.name}`:"اختيار ملف"}</Text></Pressable></View>)}
   </View>)}
   <Pressable style={s.add} onPress={addTraveler}><Text style={s.addText}>+ إضافة مسافر</Text></Pressable>
 </View>}
 {loadingReq?<ActivityIndicator color={colors.navy}/>:caseRequirements.length>0&&<View style={s.requirements}><Text style={s.sectionTitle}>المتطلبات</Text>{caseRequirements.map(r=><RequirementField key={r.id} req={r} answer={answers[r.id]??""} file={docs[r.id]??null} onAnswer={v=>setAnswers(a=>({...a,[r.id]:v}))} onPick={()=>pickRequirement(r)} onRemove={()=>setDocs(d=>({...d,[r.id]:null}))}/>)}</View>}{!!error&&<Text style={s.error}>{error}</Text>}<Pressable disabled={!complete} style={[s.primary,!complete&&s.disabled]} onPress={()=>setReview(true)}><Text style={s.primaryText}>مراجعة الطلب</Text></Pressable></ScrollView></SafeAreaView>;
}

function RequirementField({req,answer,file,onAnswer,onPick,onRemove}:{req:PublicRequirement;answer:string;file:UploadAsset|null;onAnswer:(v:string)=>void;onPick:()=>void;onRemove:()=>void}){
 const opts=Array.isArray(req.options)?req.options.map(String):[];
 if(req.type==="DOCUMENT")return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text>{!!req.description&&<Text style={s.reqDesc}>{req.description}</Text>}<Pressable style={[s.docButton,file&&s.docDone]} onPress={file?onRemove:onPick}><Text style={file?s.docDoneText:s.docButtonText}>{file?`✓ ${file.name}`:"اختيار ملف"}</Text></Pressable></View>;
 if(req.type==="YES_NO")return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text><View style={s.chips}>{["نعم","لا"].map(v=><Pressable key={v} style={[s.chip,answer===v&&s.chipActive]} onPress={()=>onAnswer(v)}><Text style={answer===v?s.chipTextActive:s.chipText}>{v}</Text></Pressable>)}</View></View>;
 if(req.type==="SELECT"&&opts.length)return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text><View style={s.chips}>{opts.map(v=><Pressable key={v} style={[s.chip,answer===v&&s.chipActive]} onPress={()=>onAnswer(v)}><Text style={answer===v?s.chipTextActive:s.chipText}>{v}</Text></Pressable>)}</View></View>;
 return <View style={s.reqCard}><Text style={s.reqTitle}>{req.name}{req.required?" *":""}</Text>{!!req.description&&<Text style={s.reqDesc}>{req.description}</Text>}<TextInput value={answer} onChangeText={onAnswer} placeholder={req.name} style={s.input} textAlign="right" keyboardType={req.type==="NUMBER"?"numeric":"default"}/></View>;
}
function Review({label,value}:{label:string;value:string}){return <View style={s.review}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:20,gap:12,paddingBottom:40},successPage:{flex:1,padding:26,justifyContent:"center",gap:14},title:{fontSize:20,fontWeight:"900",color:colors.navy,textAlign:"right"},desc:{fontSize:11.5,color:colors.muted,textAlign:"right",lineHeight:19},label:{fontSize:11,color:colors.muted,textAlign:"right",marginBottom:5},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12,fontSize:12.5,minHeight:44},readonly:{backgroundColor:"#F1F3F5",color:colors.muted},primary:{backgroundColor:colors.navy,borderRadius:10,padding:14,flex:2},primaryText:{color:"#FFF",fontWeight:"800",textAlign:"center"},disabled:{opacity:.4},review:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:12},value:{fontSize:13,fontWeight:"700",color:colors.text,textAlign:"right"},note:{fontSize:11,color:colors.subtle,textAlign:"right",lineHeight:18},actions:{flexDirection:"row-reverse",gap:10},outline:{borderWidth:1.5,borderColor:colors.navy,borderRadius:10,padding:13,flex:1},outlineText:{color:colors.navy,fontWeight:"800",textAlign:"center"},error:{color:colors.danger,textAlign:"right",fontSize:11},successIcon:{fontSize:42,color:colors.success,textAlign:"center",fontWeight:"900"},requestBox:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:18},requestId:{fontFamily:"monospace",fontSize:17,fontWeight:"900",color:colors.navy,textAlign:"center",marginTop:6},requirements:{gap:10,marginTop:4},sectionTitle:{fontSize:15,fontWeight:"900",color:colors.navy,textAlign:"right"},reqCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,gap:7},reqTitle:{fontSize:12,fontWeight:"800",color:colors.text,textAlign:"right"},reqDesc:{fontSize:10.5,color:colors.muted,textAlign:"right",lineHeight:17},docButton:{backgroundColor:colors.navy,borderRadius:9,padding:11},docButtonText:{color:"#FFF",fontWeight:"700",textAlign:"center",fontSize:11},docDone:{backgroundColor:"#E8F7ED"},docDoneText:{color:colors.success,fontWeight:"700",textAlign:"center",fontSize:11},chips:{flexDirection:"row-reverse",flexWrap:"wrap",gap:8},chip:{borderWidth:1,borderColor:colors.border,borderRadius:999,paddingHorizontal:12,paddingVertical:8},chipActive:{backgroundColor:colors.navy,borderColor:colors.navy},chipText:{color:colors.text,fontSize:11},chipTextActive:{color:"#FFF",fontSize:11,fontWeight:"700"},card:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:14,padding:14,gap:10,marginTop:10},cardHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},cardTitle:{fontSize:13,fontWeight:"800",color:colors.navy,textAlign:"right"},remove:{color:colors.danger,fontSize:11,fontWeight:"700"},two:{flexDirection:"row-reverse",gap:8},flex:{flex:1},add:{borderWidth:1.5,borderStyle:"dashed",borderColor:colors.navy,borderRadius:10,padding:12,marginTop:10},addText:{color:colors.navy,fontWeight:"800",textAlign:"center"},line:{fontSize:12,color:colors.muted,textAlign:"right"},ok:{fontSize:10,color:colors.success,textAlign:"right",marginTop:2}});
