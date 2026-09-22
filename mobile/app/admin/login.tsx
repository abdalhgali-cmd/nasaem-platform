// LEGACY / DEFERRED — mobile-admin surface.
// This Android app is customer-only; staff functionality is being
// consolidated into the Web Admin Portal (web/src/app/admin/), which is
// the canonical staff application going forward. This screen is kept only
// for continuity (still auth-gated behind staff login) and is no longer
// linked from any customer-facing navigation in this app. Do not add new
// mobile-admin functionality here — build it in web/src/app/admin/ instead.
import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator,Pressable,SafeAreaView,StyleSheet,Text,TextInput,View } from "react-native";
import { staffLogin } from "../../src/api/auth";
import { colors } from "../../src/theme";
export default function StaffLogin(){const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");const submit=async()=>{try{setBusy(true);setError("");await staffLogin(email.trim(),password);router.replace("/admin");}catch{setError("بيانات الدخول غير صحيحة أو لا يمكن الوصول للخادم.");}finally{setBusy(false);}};return <SafeAreaView style={s.safe}><View style={s.page}><Text style={s.title}>دخول الإدارة</Text><Text style={s.desc}>للموظفين والإدارة المصرح لهم فقط</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" style={s.input} textAlign="right"/><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="كلمة المرور" style={s.input} textAlign="right"/>{!!error&&<Text style={s.error}>{error}</Text>}<Pressable disabled={busy||!email||!password} onPress={submit} style={[s.button,(busy||!email||!password)&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>تسجيل الدخول</Text>}</Pressable></View></SafeAreaView>}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},page:{padding:24,gap:14,justifyContent:"center",flex:1},title:{fontSize:23,fontWeight:"900",color:colors.navy,textAlign:"center"},desc:{fontSize:12,color:colors.muted,textAlign:"center",marginBottom:10},input:{backgroundColor:"#FFF",borderWidth:1,borderColor:colors.border,borderRadius:10,padding:13},button:{backgroundColor:colors.navy,borderRadius:10,padding:14},disabled:{opacity:.45},buttonText:{color:"#FFF",fontWeight:"800",textAlign:"center"},error:{color:colors.danger,fontSize:11,textAlign:"right"}});
