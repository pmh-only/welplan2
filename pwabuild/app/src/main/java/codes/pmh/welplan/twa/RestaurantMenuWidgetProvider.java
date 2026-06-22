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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    private static final String PREF_RESTAURANT_IDS = "restaurant_ids";
    private static final String PREF_RESTAURANT_NAMES = "restaurant_names";
    private static final String VALUE_SEPARATOR = "|||";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action) || AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)) {
            PendingResult pendingResult = goAsync();
            Context appContext = context.getApplicationContext();
            int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            int[] appWidgetIds = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS);
            EXECUTOR.execute(() -> {
                try {
                    if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                        updateWidget(appContext, appWidgetId);
                    } else {
                        updateWidgets(appContext, appWidgetIds);
                    }
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

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences.Editor editor = prefs(context).edit();
        for (int appWidgetId : appWidgetIds) {
            removeWidgetPrefs(editor, appWidgetId);
        }
        editor.apply();
    }

    static void saveRestaurantSelection(Context context, int appWidgetId, List<RestaurantSelection> restaurants) {
        List<String> ids = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (RestaurantSelection restaurant : restaurants) {
            ids.add(restaurant.id);
            names.add(restaurant.name);
        }

        prefs(context)
                .edit()
                .putString(key(PREF_RESTAURANT_IDS, appWidgetId), joinValues(ids))
                .putString(key(PREF_RESTAURANT_NAMES, appWidgetId), joinValues(names))
                .apply();
    }

    static List<RestaurantSelection> readRestaurantSelection(Context context, int appWidgetId) {
        SharedPreferences preferences = prefs(context);
        List<String> ids = splitValues(preferences.getString(key(PREF_RESTAURANT_IDS, appWidgetId), ""));
        List<String> names = splitValues(preferences.getString(key(PREF_RESTAURANT_NAMES, appWidgetId), ""));
        List<RestaurantSelection> restaurants = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            String name = i < names.size() ? names.get(i) : ids.get(i);
            restaurants.add(new RestaurantSelection(ids.get(i), name));
        }
        return restaurants;
    }

    static void requestUpdate(Context context, int appWidgetId) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> updateWidget(appContext, appWidgetId));
    }

    private static void updateWidgets(Context context, int[] appWidgetIds) {
        int[] widgetIds = appWidgetIds;
        if (widgetIds == null || widgetIds.length == 0) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            widgetIds = manager.getAppWidgetIds(new ComponentName(context, RestaurantMenuWidgetProvider.class));
        }

        for (int appWidgetId : widgetIds) {
            updateWidget(context, appWidgetId);
        }
    }

    private static void updateWidget(Context context, int appWidgetId) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        showLoading(context, manager, new int[] { appWidgetId });

        try {
            WidgetMenu menu = fetchMenu(context, appWidgetId);
            saveMenu(context, appWidgetId, menu);
            renderMenu(context, manager, appWidgetId, menu, context.getString(R.string.widget_updated, currentTime()));
        } catch (Exception error) {
            WidgetMenu cached = readSavedMenu(context, appWidgetId);
            if (cached != null) {
                renderMenu(context, manager, appWidgetId, cached, context.getString(R.string.widget_cached_after_error));
            } else {
                renderError(context, manager, appWidgetId);
            }
        }
    }

    private static void showLoading(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            String openUrl = readOpenUrl(context, appWidgetId);
            RemoteViews views = baseViews(context, appWidgetId, openUrl);
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
            views.setTextViewText(R.id.widget_subtitle, loadingSubtitle(context, appWidgetId));
            views.setTextViewText(R.id.widget_menu_list, context.getString(R.string.widget_loading_detail));
            views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_open_hint));
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static String loadingSubtitle(Context context, int appWidgetId) {
        List<RestaurantSelection> restaurants = readRestaurantSelection(context, appWidgetId);
        if (restaurants.isEmpty()) return context.getString(R.string.widget_loading);
        if (restaurants.size() == 1) return context.getString(R.string.widget_loading_for_restaurant, restaurants.get(0).name);
        return context.getString(R.string.widget_loading_for_restaurants, restaurants.size());
    }

    private static void renderMenu(Context context, AppWidgetManager manager, int appWidgetId, WidgetMenu menu, String status) {
        RemoteViews views = baseViews(context, appWidgetId, menu.openUrl);
        views.setTextViewText(R.id.widget_title, menu.title);
        views.setTextViewText(R.id.widget_subtitle, menu.subtitle);
        views.setTextViewText(R.id.widget_menu_list, menu.menuText);
        views.setTextViewText(R.id.widget_status, status);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static void renderError(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = baseViews(context, appWidgetId, DEFAULT_OPEN_URL);
        views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
        views.setTextViewText(R.id.widget_subtitle, context.getString(R.string.widget_error));
        views.setTextViewText(R.id.widget_menu_list, context.getString(R.string.widget_error_detail));
        views.setTextViewText(R.id.widget_status, context.getString(R.string.widget_open_hint));
        manager.updateAppWidget(appWidgetId, views);
    }

    private static RemoteViews baseViews(Context context, int appWidgetId, String openUrl) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.restaurant_menu_widget);
        views.setOnClickPendingIntent(R.id.widget_container, openPendingIntent(context, appWidgetId, openUrl));
        views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent(context, appWidgetId));
        return views;
    }

    private static PendingIntent openPendingIntent(Context context, int appWidgetId, String openUrl) {
        Intent intent = new Intent(context, LauncherActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(openUrl == null || openUrl.isEmpty() ? DEFAULT_OPEN_URL : openUrl));
        return PendingIntent.getActivity(context, appWidgetId, intent, pendingIntentFlags());
    }

    private static PendingIntent refreshPendingIntent(Context context, int appWidgetId) {
        Intent intent = new Intent(context, RestaurantMenuWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        return PendingIntent.getBroadcast(context, 100000 + appWidgetId, intent, pendingIntentFlags());
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    private static WidgetMenu fetchMenu(Context context, int appWidgetId) throws Exception {
        Uri.Builder uri = Uri.parse(WIDGET_API_URL).buildUpon();
        for (RestaurantSelection restaurant : readRestaurantSelection(context, appWidgetId)) {
            uri.appendQueryParameter("restaurantId", restaurant.id);
        }

        HttpURLConnection connection = (HttpURLConnection) new URL(uri.build().toString()).openConnection();
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
        JSONArray restaurants = json.optJSONArray("restaurants");
        JSONObject mealTime = json.optJSONObject("mealTime");
        boolean multipleRestaurants = restaurants != null && restaurants.length() > 1;
        String fallbackTitle = restaurant == null ? "Welplan" : restaurant.optString("name", "Welplan");
        String title = json.optString("title", fallbackTitle);
        String subtitle = json.optString("subtitle", "");
        if (subtitle.isEmpty()) {
            String dateLabel = json.optString("dateLabel", "");
            String mealTimeName = mealTime == null ? "메뉴" : mealTime.optString("name", "메뉴");
            subtitle = dateLabel.isEmpty() ? mealTimeName : dateLabel + " " + mealTimeName;
        }

        JSONArray menus = json.optJSONArray("menus");
        String menuText = multipleRestaurants
                ? groupedMenuText(restaurants, menus)
                : menuListText(menus);

        if (menuText.isEmpty()) menuText = "표시할 메뉴가 없습니다.";
        String openUrl = json.optString("openUrl", DEFAULT_OPEN_URL);
        return new WidgetMenu(title, subtitle, menuText, openUrl);
    }

    private static String menuListText(JSONArray menus) {
        List<String> menuLines = new ArrayList<>();

        if (menus != null) {
            for (int i = 0; i < menus.length(); i++) {
                JSONObject menu = menus.optJSONObject(i);
                if (menu == null) continue;
                String name = menu.optString("name", "").trim();
                if (name.isEmpty()) continue;
                menuLines.add("* " + menuLine(name, menu));
            }
        }

        return joinValuesWithLineBreaks(menuLines);
    }

    private static String groupedMenuText(JSONArray restaurants, JSONArray menus) {
        Map<String, String> labels = new LinkedHashMap<>();
        Map<String, List<String>> grouped = new LinkedHashMap<>();

        if (restaurants != null) {
            for (int i = 0; i < restaurants.length(); i++) {
                JSONObject restaurant = restaurants.optJSONObject(i);
                if (restaurant == null) continue;
                String id = restaurant.optString("id", "").trim();
                String name = restaurant.optString("name", "").trim();
                if (id.isEmpty() || name.isEmpty()) continue;
                labels.put(id, name);
                grouped.put(id, new ArrayList<>());
            }
        }

        if (menus != null) {
            for (int i = 0; i < menus.length(); i++) {
                JSONObject menu = menus.optJSONObject(i);
                if (menu == null) continue;
                String name = menu.optString("name", "").trim();
                if (name.isEmpty()) continue;

                String restaurantId = menu.optString("restaurantId", "").trim();
                String restaurantName = menu.optString("restaurantName", "").trim();
                String key = restaurantId.isEmpty() ? restaurantName : restaurantId;
                if (key.isEmpty()) key = "restaurant";
                if (!labels.containsKey(key)) labels.put(key, restaurantName.isEmpty() ? key : restaurantName);
                if (!grouped.containsKey(key)) grouped.put(key, new ArrayList<>());
                grouped.get(key).add("* " + menuLine(name, menu));
            }
        }

        List<String> sections = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : grouped.entrySet()) {
            if (entry.getValue().isEmpty()) continue;
            List<String> lines = new ArrayList<>();
            lines.add(labels.get(entry.getKey()));
            lines.addAll(entry.getValue());
            sections.add(joinValuesWithLineBreaks(lines));
        }

        return joinSections(sections);
    }

    private static String menuLine(String name, JSONObject menu) {
        if (!menu.has("calories")) return name;
        return name + " (" + menu.optInt("calories") + " kcal)";
    }

    private static String currentTime() {
        return DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(new Date());
    }

    private static void saveMenu(Context context, int appWidgetId, WidgetMenu menu) {
        prefs(context)
                .edit()
                .putString(key(PREF_TITLE, appWidgetId), menu.title)
                .putString(key(PREF_SUBTITLE, appWidgetId), menu.subtitle)
                .putString(key(PREF_MENU_TEXT, appWidgetId), menu.menuText)
                .putString(key(PREF_OPEN_URL, appWidgetId), menu.openUrl)
                .apply();
    }

    private static WidgetMenu readSavedMenu(Context context, int appWidgetId) {
        SharedPreferences preferences = prefs(context);
        String title = preferences.getString(key(PREF_TITLE, appWidgetId), null);
        String subtitle = preferences.getString(key(PREF_SUBTITLE, appWidgetId), null);
        String menuText = preferences.getString(key(PREF_MENU_TEXT, appWidgetId), null);
        String openUrl = preferences.getString(key(PREF_OPEN_URL, appWidgetId), DEFAULT_OPEN_URL);
        if (title == null || subtitle == null || menuText == null) return null;
        return new WidgetMenu(title, subtitle, menuText, openUrl);
    }

    private static String readOpenUrl(Context context, int appWidgetId) {
        return prefs(context).getString(key(PREF_OPEN_URL, appWidgetId), DEFAULT_OPEN_URL);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static String key(String prefix, int appWidgetId) {
        return prefix + '_' + appWidgetId;
    }

    private static void removeWidgetPrefs(SharedPreferences.Editor editor, int appWidgetId) {
        editor.remove(key(PREF_TITLE, appWidgetId));
        editor.remove(key(PREF_SUBTITLE, appWidgetId));
        editor.remove(key(PREF_MENU_TEXT, appWidgetId));
        editor.remove(key(PREF_OPEN_URL, appWidgetId));
        editor.remove(key(PREF_RESTAURANT_IDS, appWidgetId));
        editor.remove(key(PREF_RESTAURANT_NAMES, appWidgetId));
    }

    private static String joinValues(List<String> values) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) builder.append(VALUE_SEPARATOR);
            builder.append(values.get(i));
        }
        return builder.toString();
    }

    private static String joinValuesWithLineBreaks(List<String> values) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) builder.append('\n');
            builder.append(values.get(i));
        }
        return builder.toString();
    }

    private static String joinSections(List<String> sections) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < sections.size(); i++) {
            if (i > 0) builder.append("\n\n");
            builder.append(sections.get(i));
        }
        return builder.toString();
    }

    private static List<String> splitValues(String value) {
        List<String> values = new ArrayList<>();
        if (value == null || value.isEmpty()) return values;
        String[] parts = value.split("\\|\\|\\|", -1);
        for (String part : parts) {
            if (!part.isEmpty()) values.add(part);
        }
        return values;
    }

    static final class RestaurantSelection {
        final String id;
        final String name;

        RestaurantSelection(String id, String name) {
            this.id = id;
            this.name = name;
        }
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
