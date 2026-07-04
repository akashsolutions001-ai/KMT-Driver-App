package com.route.master.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before calling super.onCreate()
        registerPlugin(LocationServicePlugin.class);
        registerPlugin(PermissionsPlugin.class);

        super.onCreate(savedInstanceState);
    }
}
