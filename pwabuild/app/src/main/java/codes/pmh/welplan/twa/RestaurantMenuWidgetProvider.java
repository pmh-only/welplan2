package codes.pmh.welplan.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver.PendingResult;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RestaurantMenuWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_REFRESH = "codes.pmh.welplan.twa.action.REFRESH_RESTAURANT_MENU_WIDGET";
    private static final String WIDGET_API_URL = "https://welplan.pmh.codes/api/widget/menu";
    private static final String DEFAULT_OPEN_URL = "https://welplan.pmh.codes/takein";
    private static final String PREFS_NAME = "restaurant_menu_widget";
    private static final String PREF_TITLE = "title";
    private static final String PREF_SUBTITLE = "subtitle";
    private static final String PREF_MENU_TEXT = "menu_text";
    private static final String PREF_OPEN_URL = "open_url";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            PendingResult pendingResult = goAsync();
            Context appContext = context.getApplicationContext();
            EXECUTOR.execute(() -> {
                try {
                    updateWidgets(appContext);
                } finally {
                    pendingResult.finish();
                }
            });
            return;
        }

        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        showLoading(context.getApplicationContext(), appWidgetManager, appWidgetIds);
    }

    private static void updateWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, RestaurantMenuWidgetProvider.class));
        if (widgetIds.length == 0) return;

        showLoading(context, manager, widgetIds);

        try {
            WidgetMenu menu = fetchMenu();
            saveMenu(context, menu);
            renderMenu(context, manager, widgetIds, menu, context.getString(R.string.widget_updated, currentTime(context)));
        } catch (Exception error) {
            WidgetMenu cached = readSavedMenu(context);
            if (cached != null) {
                renderMenu(context, manager, widgetIds, cached, context.getString(R.string.widget_cached_after_error));
            } else {
                renderError(context, manager, widgetIds);
            }
        }
    }

    private static void showLoading(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            RemoteViews views = baseViews(context, DEFAULT_OPEN_URL);
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_loading));
            views.setTextViewText(R.id.widget_menu_list, context.getString(R.string.widget_loading_detail));
            views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_open_hint));
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static void renderMenu(Context context, AppWidgetManager manager, int[] widgetIds, WidgetMenu menu, String status) {
        for (int widgetId : widgetIds) {
            RemoteViews views = baseViews(context, menu.openUrl);
            views.setTextViewText(R.id.widget_title, menu.title);
            views.setTextViewText(R.id.widget_subtitle, menu.subtitle);
            views.setTextViewText(R.id.widget_menu_list, menu.menuText);
            views.setTextViewText(R.id.widget_status, status);
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static void renderError(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            RemoteViews views = baseViews(context, DEFAULT_OPEN_URL);
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
            views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_error));
            views.setTextViewText(R.id.widget_menu_list, context.getString(R.string.widget_error_detail));
            views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_open_hint));
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static RemoteViews baseViews(Context context, String openUrl) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.restaurant_menu_widget);
        views.setOnClickPendingIntent(R.id.widget_container, openPendingIntent(context, openUrl));
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent(context));
        return views;
    }

    private static PendingIntent openPendingIntent(Context context, String openUrl) {
        Intent intent = new Intent(context, LauncherActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(openUrl == null || openUrl.isEmpty() ? DEFAULT_OPEN_URL : openUrl));
        return PendingIntent.getActivity(context, 100, intent, pendingIntentFlags());
    }

    private static PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, RestaurantMenuWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 101, intent, pendingIntentFlags());
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    private static WidgetMenu fetchMenu() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(WIDGET_API_URL).openConnection();
        connection.setConnectTimeout(3000);
        connection.setReadTimeout(5000);
        connection.setRequestProperty("Accept", "application/json");

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 200 && statusCode < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String body = readStream(stream);
        connection.disconnect();

        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException("Widget menu request failed with HTTP " + statusCode);
        }

        return parseMenu(body);
    }

    private static String readStream(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
        }
        return body.toString();
    }

    private static WidgetMenu parseMenu(String body) throws Exception {
        JSONObject json = new JSONObject(body);
        JSONObject restaurant = json.optJSONObject("restaurant");
        JSONObject mealTime = json.optJSONObject("mealTime");
        String restaurantName = restaurant == null ? "Welplan" : restaurant.optString("name", "Welplan");
        String dateLabel = json.optString("dateLabel", "");
        String mealTimeName = mealTime == null ? "메뉴" : mealTime.optString("name", "메뉴");
        String subtitle = dateLabel.isEmpty() ? mealTimeName : dateLabel + " " + mealTimeName;
        List<String> menuLines = new ArrayList<>();
        JSONArray menus = json.optJSONArray("menus");

        if (menus != null) {
            for (int i = 0; i < menus.length(); i++) {
                JSONObject menu = menus.optJSONObject(i);
                if (menu == null) continue;
                String name = menu.optString("name", "").trim();
                if (name.isEmpty()) continue;
                if (menu.has("calories")) {
                    menuLines.add("- " + name + " · " + menu.optInt("calories") + "kcal");
                } else {
                    menuLines.add("- " + name);
                }
            }
        }

        String menuText = menuLines.isEmpty() ? "표시할 메뉴가 없습니다." : joinLines(menuLines);
        String openUrl = json.optString("openUrl", DEFAULT_OPEN_URL);
        return new WidgetMenu(restaurantName, subtitle, menuText, openUrl);
    }

    private static String joinLines(List<String> lines) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) builder.append('\n');
            builder.append(lines.get(i));
        }
        return builder.toString();
    }

    private static String currentTime(Context context) {
        return DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(new Date());
    }

    private static void saveMenu(Context context, WidgetMenu menu) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_TITLE, menu.title)
                .putString(PREF_SUBTITLE, menu.subtitle)
                .putString(PREF_MENU_TEXT, menu.menuText)
                .putString(PREF_OPEN_URL, menu.openUrl)
                .apply();
    }

    private static WidgetMenu readSavedMenu(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String title = prefs.getString(PREF_TITLE, null);
        String subtitle = prefs.getString(PREF_SUBTITLE, null);
        String menuText = prefs.getString(PREF_MENU_TEXT, null);
        String openUrl = prefs.getString(PREF_OPEN_URL, DEFAULT_OPEN_URL);
        if (title == null || subtitle == null || menuText == null) return null;
        return new WidgetMenu(title, subtitle, menuText, openUrl);
    }

    private static final class WidgetMenu {
        final String title;
        final String subtitle;
        final String menuText;
        final String openUrl;

        WidgetMenu(String title, String subtitle, String menuText, String openUrl) {
            this.title = title;
            this.subtitle = subtitle;
            this.menuText = menuText;
            this.openUrl = openUrl;
        }
    }
}
