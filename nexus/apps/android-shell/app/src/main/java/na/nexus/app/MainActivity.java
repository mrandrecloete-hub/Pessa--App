package na.nexus.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Thin shell: shows the NEXUS web app. All data and rules stay on the NEXUS server. */
public class MainActivity extends Activity {
    private static final int NAVY = Color.parseColor("#07111F"), GOLD = Color.parseColor("#D6A64B");
    private SharedPreferences prefs;
    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("nexus", MODE_PRIVATE);
        getWindow().setStatusBarColor(NAVY); getWindow().setNavigationBarColor(NAVY);
        String url = prefs.getString("server", BuildConfig.DEFAULT_SERVER);
        if (url == null || url.isEmpty()) showSetup(null); else showWeb(url);
    }

    private void showSetup(String problem) {
        LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setGravity(Gravity.CENTER); l.setPadding(56, 56, 56, 56); l.setBackgroundColor(NAVY);
        TextView t = new TextView(this); t.setText("NEXUS NAMIBIA"); t.setTextColor(GOLD); t.setTextSize(26); t.setTypeface(Typeface.DEFAULT_BOLD); t.setGravity(Gravity.CENTER);
        TextView s = new TextView(this); s.setTextColor(Color.parseColor("#AAB7C8")); s.setGravity(Gravity.CENTER); s.setPadding(0, 24, 0, 24);
        s.setText((problem != null ? problem + "\n\n" : "") + "Enter the address of your NEXUS server (for example https://nexus.example.na). Use https for real data.");
        EditText in = new EditText(this); in.setHint("https://"); in.setText(prefs.getString("server", "")); in.setSingleLine(); in.setTextColor(Color.WHITE); in.setHintTextColor(Color.GRAY);
        Button go = new Button(this); go.setText("Open NEXUS");
        go.setOnClickListener(v -> { String u = in.getText().toString().trim(); if (u.isEmpty()) return; if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
            prefs.edit().putString("server", u).apply(); showWeb(u); });
        l.addView(t); l.addView(s); l.addView(in, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); l.addView(go);
        web = null; setContentView(l);
    }

    private void showWeb(String url) {
        web = new WebView(this); web.setBackgroundColor(NAVY);
        WebSettings ws = web.getSettings(); ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setAllowFileAccess(false); ws.setAllowContentAccess(false);
        CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) showSetup("Could not reach the server (" + e.getDescription() + ").");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return false; }
        });
        setContentView(web); web.loadUrl(url);
    }

    @Override public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
