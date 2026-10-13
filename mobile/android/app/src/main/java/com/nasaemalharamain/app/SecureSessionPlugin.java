package com.nasaemalharamain.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Session secrets for the customer app, kept out of WebView-readable storage.
 *
 * Every value is AES-256-GCM encrypted with a key that lives in the Android
 * Keystore (non-exportable; hardware-backed where the device has it) and only
 * the ciphertext is written to this app's private SharedPreferences.
 *
 * Biometric login is opt-in. When enabled for a key, its value is re-encrypted
 * with a second Keystore key that requires a strong biometric for every use
 * and is invalidated by Android when fingerprints/faces are added or removed.
 * The value can then only be decrypted inside a successful BiometricPrompt
 * (CryptoObject), so the fingerprint unlocks the stored token, it is not a
 * yes/no flag the JS layer could fake. No biometric data ever reaches the app:
 * Android does the matching and only releases the key.
 *
 * Unlocking only recovers the token. The JS layer must still have the server
 * confirm the session before treating the customer as signed in.
 */
@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String VALUE_KEY_ALIAS = "nasaem.session.v1";
    private static final String BIOMETRIC_KEY_ALIAS = "nasaem.session.biometric.v1";
    private static final String PREFS = "nasaem_secure_session";
    private static final String VALUE_PREFIX = "v.";
    private static final String BIOMETRIC_PREFIX = "b.";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private boolean promptInProgress = false;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- Keystore helpers -------------------------------------------------

    private static KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        return ks;
    }

    private static SecretKey existingKey(String alias) throws Exception {
        KeyStore ks = keyStore();
        if (!ks.containsAlias(alias)) return null;
        return (SecretKey) ks.getKey(alias, null);
    }

    private static SecretKey createKey(String alias, boolean biometric) throws Exception {
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256);
        if (biometric) {
            builder.setUserAuthenticationRequired(true);
            builder.setInvalidatedByBiometricEnrollment(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // 0 = authentication required for every single use.
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
            }
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(builder.build());
        return generator.generateKey();
    }

    private static void deleteKey(String alias) {
        try {
            KeyStore ks = keyStore();
            if (ks.containsAlias(alias)) ks.deleteEntry(alias);
        } catch (Exception ignored) {
            // Nothing stored under it can be decrypted anyway.
        }
    }

    private static String pack(byte[] iv, byte[] cipherText) {
        return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipherText, Base64.NO_WRAP);
    }

    private static byte[][] unpack(String stored) {
        String[] parts = stored.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("corrupt entry");
        return new byte[][] { Base64.decode(parts[0], Base64.NO_WRAP), Base64.decode(parts[1], Base64.NO_WRAP) };
    }

    private String encryptValue(String value) throws Exception {
        SecretKey key = existingKey(VALUE_KEY_ALIAS);
        if (key == null) key = createKey(VALUE_KEY_ALIAS, false);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] cipherText = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return pack(cipher.getIV(), cipherText);
    }

    private String decryptValue(String stored) throws Exception {
        SecretKey key = existingKey(VALUE_KEY_ALIAS);
        if (key == null) throw new UnrecoverableKeyException("value key missing");
        byte[][] parts = unpack(stored);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, parts[0]));
        return new String(cipher.doFinal(parts[1]), StandardCharsets.UTF_8);
    }

    private static String requireKey(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required", "INVALID_ARGUMENT");
            return null;
        }
        return key;
    }

    // ---- Plain (non-biometric) encrypted values ---------------------------

    @PluginMethod
    public void get(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        String stored = prefs().getString(VALUE_PREFIX + key, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            result.put("value", decryptValue(stored));
        } catch (Exception e) {
            // Key lost (e.g. app data restored to another device) or entry
            // corrupted: unreadable for good, so drop it rather than retry.
            prefs().edit().remove(VALUE_PREFIX + key).apply();
            result.put("value", JSObject.NULL);
            result.put("unreadable", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required", "INVALID_ARGUMENT");
            return;
        }
        try {
            prefs().edit().putString(VALUE_PREFIX + key, encryptValue(value)).commit();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not store the value securely", "STORAGE_ERROR", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        prefs().edit().remove(VALUE_PREFIX + key).remove(BIOMETRIC_PREFIX + key).commit();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().clear().commit();
        deleteKey(BIOMETRIC_KEY_ALIAS);
        deleteKey(VALUE_KEY_ALIAS);
        call.resolve();
    }

    // ---- Biometrics --------------------------------------------------------

    private String availability() {
        int status = BiometricManager.from(getContext()).canAuthenticate(STRONG);
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "AVAILABLE";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "NONE_ENROLLED";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "NO_HARDWARE";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "HW_UNAVAILABLE";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "SECURITY_UPDATE_REQUIRED";
            default:
                return "UNSUPPORTED";
        }
    }

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        String key = call.getString("key");
        String reason = availability();
        JSObject result = new JSObject();
        result.put("available", "AVAILABLE".equals(reason));
        result.put("reason", reason);
        result.put("enabled", key != null && prefs().contains(BIOMETRIC_PREFIX + key));
        call.resolve(result);
    }

    /** Moves `value` under biometric protection after one successful prompt. */
    @PluginMethod
    public void enableBiometric(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required", "INVALID_ARGUMENT");
            return;
        }
        String reason = availability();
        if (!"AVAILABLE".equals(reason)) {
            call.reject("Biometric authentication is not available", reason);
            return;
        }
        Cipher cipher;
        try {
            // Reuse the existing key (so a cancelled prompt while renewing
            // leaves the stored session readable); create one if there is
            // none or Android invalidated it after an enrollment change.
            cipher = Cipher.getInstance(TRANSFORMATION);
            try {
                SecretKey bioKey = existingKey(BIOMETRIC_KEY_ALIAS);
                if (bioKey == null) throw new KeyPermanentlyInvalidatedException();
                cipher.init(Cipher.ENCRYPT_MODE, bioKey);
            } catch (KeyPermanentlyInvalidatedException | UnrecoverableKeyException e) {
                prefs().edit().remove(BIOMETRIC_PREFIX + key).commit();
                deleteKey(BIOMETRIC_KEY_ALIAS);
                cipher.init(Cipher.ENCRYPT_MODE, createKey(BIOMETRIC_KEY_ALIAS, true));
            }
        } catch (Exception e) {
            call.reject("Could not prepare biometric key", "KEY_ERROR", e);
            return;
        }
        prompt(call, cipher, (authenticated) -> {
            try {
                byte[] cipherText = authenticated.doFinal(value.getBytes(StandardCharsets.UTF_8));
                prefs()
                    .edit()
                    .putString(BIOMETRIC_PREFIX + key, pack(authenticated.getIV(), cipherText))
                    .remove(VALUE_PREFIX + key)
                    .commit();
                JSObject result = new JSObject();
                result.put("enabled", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not store the value", "KEY_ERROR", e);
            }
        });
    }

    /** Shows the system prompt and returns the value only on success. */
    @PluginMethod
    public void unlockBiometric(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        String stored = prefs().getString(BIOMETRIC_PREFIX + key, null);
        if (stored == null) {
            call.reject("Biometric login is not enabled", "NOT_ENABLED");
            return;
        }
        Cipher cipher;
        byte[] cipherText;
        try {
            SecretKey bioKey = existingKey(BIOMETRIC_KEY_ALIAS);
            if (bioKey == null) throw new KeyPermanentlyInvalidatedException();
            byte[][] parts = unpack(stored);
            cipherText = parts[1];
            cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, bioKey, new GCMParameterSpec(GCM_TAG_BITS, parts[0]));
        } catch (KeyPermanentlyInvalidatedException | UnrecoverableKeyException | IllegalArgumentException e) {
            // Fingerprints changed (or the key is gone): the stored session
            // can never be decrypted again. Drop it; the customer signs in
            // with their password and may enable biometrics again.
            forgetBiometric(key);
            call.reject("Biometric enrollment changed", "KEY_INVALIDATED");
            return;
        } catch (Exception e) {
            call.reject("Could not prepare biometric key", "KEY_ERROR", e);
            return;
        }
        final byte[] encrypted = cipherText;
        prompt(call, cipher, (authenticated) -> {
            try {
                String value = new String(authenticated.doFinal(encrypted), StandardCharsets.UTF_8);
                JSObject result = new JSObject();
                result.put("value", value);
                call.resolve(result);
            } catch (AEADBadTagException e) {
                forgetBiometric(key);
                call.reject("Stored session is corrupted", "KEY_INVALIDATED");
            } catch (Exception e) {
                call.reject("Could not read the stored session", "KEY_ERROR", e);
            }
        });
    }

    /** Turns biometrics off; `value` (if given) goes back to normal storage. */
    @PluginMethod
    public void disableBiometric(PluginCall call) {
        String key = requireKey(call);
        if (key == null) return;
        String value = call.getString("value");
        try {
            SharedPreferences.Editor editor = prefs().edit().remove(BIOMETRIC_PREFIX + key);
            if (value != null) editor.putString(VALUE_PREFIX + key, encryptValue(value));
            editor.commit();
            deleteKey(BIOMETRIC_KEY_ALIAS);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not disable biometric login", "STORAGE_ERROR", e);
        }
    }

    private void forgetBiometric(String key) {
        prefs().edit().remove(BIOMETRIC_PREFIX + key).commit();
        deleteKey(BIOMETRIC_KEY_ALIAS);
    }

    private interface CipherAction {
        void run(Cipher cipher);
    }

    private static String promptErrorCode(int errorCode) {
        switch (errorCode) {
            case BiometricPrompt.ERROR_LOCKOUT:
                return "LOCKOUT";
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return "LOCKOUT_PERMANENT";
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_CANCELED:
                return "CANCELLED";
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
                return "NONE_ENROLLED";
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
                return "HW_UNAVAILABLE";
            case BiometricPrompt.ERROR_TIMEOUT:
                return "TIMEOUT";
            default:
                return "FAILED";
        }
    }

    private void prompt(PluginCall call, Cipher cipher, CipherAction onSuccess) {
        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("No activity", "UNAVAILABLE");
            return;
        }
        if (promptInProgress) {
            call.reject("A biometric prompt is already open", "BUSY");
            return;
        }
        String title = call.getString("title", "تأكيد الهوية");
        String subtitle = call.getString("subtitle", "");
        String cancel = call.getString("cancel", "إلغاء");

        activity.runOnUiThread(() -> {
            promptInProgress = true;
            BiometricPrompt biometricPrompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        promptInProgress = false;
                        BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                        if (crypto == null || crypto.getCipher() == null) {
                            call.reject("Biometric result had no key", "FAILED");
                            return;
                        }
                        onSuccess.run(crypto.getCipher());
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        promptInProgress = false;
                        call.reject(errString.toString(), promptErrorCode(errorCode));
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // One unrecognised finger: the system prompt stays open
                        // and lets the user try again (Android enforces lockout).
                    }
                }
            );
            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setNegativeButtonText(cancel)
                .setAllowedAuthenticators(STRONG)
                .setConfirmationRequired(false);
            if (!subtitle.isEmpty()) info.setSubtitle(subtitle);
            try {
                biometricPrompt.authenticate(info.build(), new BiometricPrompt.CryptoObject(cipher));
            } catch (Exception e) {
                promptInProgress = false;
                call.reject("Could not show biometric prompt", "FAILED", e);
            }
        });
    }
}
