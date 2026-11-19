package na.nexus.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Two modes, chosen when the app is built:
 *  - LOCAL (default): the whole NEXUS app is bundled in assets/www and served to the WebView from a private
 *    https origin. No server, no internet needed, data stays on the phone (localStorage).
 *  - SERVER: build with -PserverUrl=https://host to open a hosted NEXUS server instead.
 */
public class MainActivity extends Activity {
    private static final int NAVY = Color.parseColor("#07111F");
    private static final String HOST = "appassets.nexus.local";
    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(NAVY); getWindow().setNavigationBarColor(NAVY);
        final boolean local = BuildConfig.DEFAULT_SERVER == null || BuildConfig.DEFAULT_SERVER.isEmpty();
        web = new WebView(this); web.setBackgroundColor(NAVY);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setAllowFileAccess(false); ws.setAllowContentAccess(false);
        ws.setUserAgentString(ws.getUserAgentString() + " NexusAndroid");
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (!local) return null;
                Uri u = r.getUrl();
                // Optional cloud sync: the bundled app may call a NEXUS server over https. Plain http and everything else stays blocked.
                if (!HOST.equals(u.getHost())) { if ("https".equals(u.getScheme())) return null; return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null, new ByteArrayInputStream(new byte[0])); }
                return asset(u.getPath());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (local && HOST.equals(u.getHost())) return false;
                if (!local && Uri.parse(BuildConfig.DEFAULT_SERVER).getHost() != null && Uri.parse(BuildConfig.DEFAULT_SERVER).getHost().equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }   // official programme websites open in the browser
                return true;
            }
        });
        setContentView(web);
        web.loadUrl(local ? "https://" + HOST + "/dashboard/" : BuildConfig.DEFAULT_SERVER);
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.isEmpty()) path = "/";
        if (path.endsWith("/")) path += "index.html";
        if (path.contains("..")) return notFound();
        String rel = path.startsWith("/") ? path.substring(1) : path;
        try {
            InputStream in;
            try { in = getAssets().open("www/" + rel); }
            catch (IOException e) { in = getAssets().open("www/" + rel + "/index.html"); }  // path without trailing slash
            return new WebResourceResponse(mime(rel), "utf-8", in);
        } catch (IOException e) { return notFound(); }
    }
    private WebResourceResponse notFound() { return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new ByteArrayInputStream(new byte[0])); }
    private static String mime(String p) {
        String s = p.toLowerCase();
        if (s.endsWith(".html")) return "text/html"; if (s.endsWith(".js")) return "application/javascript"; if (s.endsWith(".css")) return "text/css";
        if (s.endsWith(".json") || s.endsWith(".webmanifest")) return "application/json"; if (s.endsWith(".png")) return "image/png"; if (s.endsWith(".svg")) return "image/svg+xml";
        if (s.endsWith(".ico")) return "image/x-icon"; if (s.endsWith(".woff2")) return "font/woff2"; if (s.endsWith(".txt")) return "text/plain"; return "application/octet-stream";
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
