package com.nasaemalharamain.app;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "GoogleIdentity")
public class GoogleIdentityPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId"), nonce = call.getString("nonce");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com") ||
                nonce == null || !nonce.matches("[A-Za-z0-9_-]{32,128}")) {
            call.reject("تعذّر إعداد تسجيل Google."); return;
        }
        getActivity().runOnUiThread(() -> {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request,
                    new CancellationSignal(), ContextCompat.getMainExecutor(getContext()),
                    new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                        @Override public void onResult(GetCredentialResponse response) {
                            try {
                                GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(response.getCredential().getData());
                                JSObject result = new JSObject();
                                result.put("credential", credential.getIdToken());
                                call.resolve(result);
                            } catch (Exception error) { call.reject("تعذّر قراءة نتيجة Google."); }
                        }
                        @Override public void onError(GetCredentialException error) {
                            call.reject("لم يكتمل تسجيل Google. يمكنك استخدام كلمة المرور.");
                        }
                    });
        });
    }
}
