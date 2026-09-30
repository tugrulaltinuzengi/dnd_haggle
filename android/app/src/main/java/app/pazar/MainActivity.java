package app.pazar;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;

/** A thin shell that shows the Pazar server full screen. The game logic lives on the server. */
public class MainActivity extends Activity {
    private static final String PREFS = "pazar";
    private static final String KEY_URL = "url";

    private WebView web;
    private SharedPreferences prefs;
    private boolean errorShown;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#1B1410"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // the player login is kept in localStorage
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(Color.parseColor("#1B1410"));
        web.addJavascriptInterface(new Bridge(), "PazarApp");
        web.setWebViewClient(new PazarClient());
        web.setWebChromeClient(new PazarChrome());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            open();
        }
    }

    private String serverUrl() {
        String saved = prefs.getString(KEY_URL, "");
        return saved.isEmpty() ? BuildConfig.DEFAULT_URL : saved;
    }

    private void open() {
        String url = serverUrl();
        if (url.isEmpty()) askUrl(false);
        else load(url);
    }

    /** The table's own Wi-Fi (192.168.4.1) has no internet, so Android would route around it. Bind this process to Wi-Fi for that address only. */
    private void load(final String url) {
        final ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        String host = Uri.parse(url).getHost();
        if (cm == null || !"192.168.4.1".equals(host)) {
            if (cm != null) cm.bindProcessToNetwork(null);
            web.loadUrl(url);
            return;
        }
        NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
        cm.requestNetwork(req, new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                cm.bindProcessToNetwork(network);
                runOnUiThread(() -> web.loadUrl(url));
            }
        }, 8000);
    }

    private static String normalize(String raw) {
        String u = raw.trim();
        if (u.isEmpty()) return u;
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
        return u;
    }

    private void askUrl(final boolean cancelable) {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://your-address.workers.dev");
        input.setText(serverUrl());
        input.setSelectAllOnFocus(true);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Pazar server")
                .setMessage("Enter the server address.\nOver the internet: https://your-address.workers.dev\nAt the table (join the Pazar Wi-Fi first): http://192.168.4.1")
                .setView(input)
                .setCancelable(cancelable)
                .setPositiveButton("Connect", (d, w) -> {
                    String u = normalize(input.getText().toString());
                    if (u.isEmpty()) { askUrl(cancelable); return; }
                    prefs.edit().putString(KEY_URL, u).apply();
                    errorShown = false;
                    load(u);
                });
        if (cancelable) b.setNegativeButton("Cancel", null);
        b.show();
    }

    /** The "Server address" button in the web app is wired to this. */
    private class Bridge {
        @JavascriptInterface
        public void changeServer() {
            runOnUiThread(() -> askUrl(true));
        }
    }

    private class PazarClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            Uri home = Uri.parse(serverUrl());
            if (u.getHost() != null && u.getHost().equals(home.getHost())) return false;
            startActivity(new Intent(Intent.ACTION_VIEW, u)); // external links open in the browser
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            errorShown = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame() || errorShown) return;
            errorShown = true;
            new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Could not connect")
                    .setMessage(serverUrl() + "\n\nCheck your connection and the address. At the table, join the Pazar Wi-Fi first.")
                    .setCancelable(false)
                    .setPositiveButton("Try again", (d, w) -> { errorShown = false; open(); })
                    .setNeutralButton("Change address", (d, w) -> askUrl(true))
                    .show();
        }
    }

    /** The DM screen uses prompt/confirm; a WebView swallows them by default. */
    private class PazarChrome extends WebChromeClient {
        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setCancelable(false)
                    .setPositiveButton("OK", (d, w) -> result.confirm()).show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setCancelable(false)
                    .setPositiveButton("OK", (d, w) -> result.confirm())
                    .setNegativeButton("Cancel", (d, w) -> result.cancel()).show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue,
                                  final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue);
            input.setSelectAllOnFocus(true);
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setCancelable(false)
                    .setPositiveButton("OK", (d, w) -> result.confirm(input.getText().toString()))
                    .setNegativeButton("Cancel", (d, w) -> result.cancel()).show();
            return true;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
