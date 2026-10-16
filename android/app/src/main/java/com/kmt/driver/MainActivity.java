package com.kmt.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before calling super.onCreate()
        registerPlugin(LocationServicePlugin.class);
        registerPlugin(PermissionsPlugin.class);

        super.onCreate(savedInstanceState);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        try {
            PluginHandle handle = getBridge().getPlugin("Permissions");
            if (handle != null && handle.getInstance() instanceof PermissionsPlugin) {
                ((PermissionsPlugin) handle.getInstance()).onRawRequestPermissionsResult(requestCode, permissions, grantResults);
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Error forwarding permission result: " + e.getMessage());
        }
    }
}
