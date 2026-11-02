package com.nasaemalharamain.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local native plugins must be registered before the bridge starts.
        registerPlugin(SecureSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
