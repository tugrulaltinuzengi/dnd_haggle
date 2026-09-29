package app.pazar;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
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

/** Pazar sunucusunu tam ekran gösteren ince kabuk. Oyun mantığı sunucuda. */
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
        s.setDomStorageEnabled(true); // oyuncu girişi localStorage'da tutulur
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
        else web.loadUrl(url);
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
        input.setHint("https://cihaz.tailnet.ts.net");
        input.setText(serverUrl());
        input.setSelectAllOnFocus(true);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Pazar sunucusu")
                .setMessage("Sunucu adresini gir.\nTailscale HTTPS: https://…\nESP32 (HTTP): http://cihaz.tailnet.ts.net:3000")
                .setView(input)
                .setCancelable(cancelable)
                .setPositiveButton("Bağlan", (d, w) -> {
                    String u = normalize(input.getText().toString());
                    if (u.isEmpty()) { askUrl(cancelable); return; }
                    prefs.edit().putString(KEY_URL, u).apply();
                    errorShown = false;
                    web.loadUrl(u);
                });
        if (cancelable) b.setNegativeButton("Vazgeç", null);
        b.show();
    }

    /** Web uygulamasındaki "Sunucu adresi" düğmesi buraya bağlanır. */
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
            startActivity(new Intent(Intent.ACTION_VIEW, u)); // dış bağlantılar tarayıcıda
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
                    .setTitle("Bağlanamadı")
                    .setMessage(serverUrl() + "\n\nİnterneti ve adresi kontrol et. Render ücretsiz planda ilk açılış bir dakika sürebilir.")
                    .setCancelable(false)
                    .setPositiveButton("Tekrar dene", (d, w) -> { errorShown = false; open(); })
                    .setNeutralButton("Adresi değiştir", (d, w) -> askUrl(true))
                    .show();
        }
    }

    /** DM ekranı prompt/confirm kullanır; WebView bunları varsayılan olarak yutar. */
    private class PazarChrome extends WebChromeClient {
        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setCancelable(false)
                    .setPositiveButton("Tamam", (d, w) -> result.confirm()).show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setCancelable(false)
                    .setPositiveButton("Tamam", (d, w) -> result.confirm())
                    .setNegativeButton("Vazgeç", (d, w) -> result.cancel()).show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue,
                                  final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue);
            input.setSelectAllOnFocus(true);
            new AlertDialog.Builder(MainActivity.this).setMessage(message).setView(input).setCancelable(false)
                    .setPositiveButton("Tamam", (d, w) -> result.confirm(input.getText().toString()))
                    .setNegativeButton("Vazgeç", (d, w) -> result.cancel()).show();
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
