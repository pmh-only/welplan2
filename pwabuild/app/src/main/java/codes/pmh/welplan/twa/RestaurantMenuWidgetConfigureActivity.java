package codes.pmh.welplan.twa;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RestaurantMenuWidgetConfigureActivity extends Activity {
    private static final String SEARCH_URL = "https://welplan.pmh.codes/proxy/search?q=";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final List<RestaurantOption> results = new ArrayList<>();
    private final Map<String, RestaurantOption> selected = new LinkedHashMap<>();
    private RestaurantAdapter adapter;
    private TextView statusView;
    private TextView selectedView;
    private EditText searchInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        for (RestaurantMenuWidgetProvider.RestaurantSelection restaurant : RestaurantMenuWidgetProvider.readRestaurantSelection(this, appWidgetId)) {
            selected.put(restaurant.id, new RestaurantOption(restaurant.id, restaurant.name, "", ""));
        }

        setContentView(buildContentView());
        updateSelectedSummary();
        searchRestaurants("");
    }

    private LinearLayout buildContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        root.setBackgroundColor(0xffffffff);

        TextView title = new TextView(this);
        title.setText(R.string.widget_config_title);
        title.setTextColor(0xff0f172a);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView description = new TextView(this);
        description.setText(R.string.widget_config_description);
        description.setTextColor(0xff475569);
        description.setTextSize(13);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        descriptionParams.setMargins(0, dp(4), 0, dp(14));
        root.addView(description, descriptionParams);

        selectedView = new TextView(this);
        selectedView.setTextColor(0xff059669);
        selectedView.setTextSize(13);
        selectedView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams selectedParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        selectedParams.setMargins(0, 0, 0, dp(10));
        root.addView(selectedView, selectedParams);

        LinearLayout searchRow = new LinearLayout(this);
        searchRow.setOrientation(LinearLayout.HORIZONTAL);
        searchRow.setGravity(Gravity.CENTER_VERTICAL);

        searchInput = new EditText(this);
        searchInput.setSingleLine(true);
        searchInput.setHint(R.string.widget_config_search_hint);
        searchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT);
        searchInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                searchRestaurants(searchInput.getText().toString());
                return true;
            }
            return false;
        });
        searchRow.addView(searchInput, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button searchButton = new Button(this);
        searchButton.setText(R.string.widget_config_search_button);
        searchButton.setOnClickListener(view -> searchRestaurants(searchInput.getText().toString()));
        LinearLayout.LayoutParams searchButtonParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        searchButtonParams.setMargins(dp(8), 0, 0, 0);
        searchRow.addView(searchButton, searchButtonParams);
        root.addView(searchRow, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        statusView = new TextView(this);
        statusView.setTextColor(0xff64748b);
        statusView.setTextSize(12);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.setMargins(0, dp(8), 0, dp(8));
        root.addView(statusView, statusParams);

        adapter = new RestaurantAdapter(this);
        ListView listView = new ListView(this);
        listView.setAdapter(adapter);
        listView.setOnItemClickListener((parent, view, position, id) -> toggleRestaurant(results.get(position)));
        root.addView(listView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsParams.setMargins(0, dp(12), 0, 0);

        Button cancelButton = new Button(this);
        cancelButton.setText(R.string.widget_config_cancel);
        cancelButton.setOnClickListener(view -> finish());
        actions.addView(cancelButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button saveButton = new Button(this);
        saveButton.setText(R.string.widget_config_save);
        saveButton.setOnClickListener(view -> saveConfiguration());
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        saveParams.setMargins(dp(8), 0, 0, 0);
        actions.addView(saveButton, saveParams);
        root.addView(actions, actionsParams);

        return root;
    }

    private void searchRestaurants(String query) {
        statusView.setText(R.string.widget_config_loading);
        EXECUTOR.execute(() -> {
            try {
                List<RestaurantOption> restaurants = fetchRestaurants(query);
                runOnUiThread(() -> showResults(restaurants));
            } catch (Exception error) {
                runOnUiThread(() -> {
                    results.clear();
                    adapter.notifyDataSetChanged();
                    statusView.setText(R.string.widget_config_error);
                });
            }
        });
    }

    private void showResults(List<RestaurantOption> restaurants) {
        results.clear();
        results.addAll(restaurants);
        adapter.notifyDataSetChanged();
        if (restaurants.isEmpty()) {
            statusView.setText(R.string.widget_config_empty);
        } else {
            statusView.setText(getString(R.string.widget_config_result_count, restaurants.size()));
        }
    }

    private List<RestaurantOption> fetchRestaurants(String query) throws Exception {
        URL url = new URL(SEARCH_URL + URLEncoder.encode(query == null ? "" : query.trim(), "UTF-8"));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");

        int statusCode = connection.getResponseCode();
        InputStream stream = statusCode >= 200 && statusCode < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readStream(stream);
        connection.disconnect();

        if (statusCode < 200 || statusCode >= 300) throw new IllegalStateException("Search failed with HTTP " + statusCode);

        JSONArray json = new JSONArray(body);
        List<RestaurantOption> restaurants = new ArrayList<>();
        for (int i = 0; i < json.length(); i++) {
            JSONObject item = json.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id", "");
            String name = item.optString("name", "");
            if (id.isEmpty() || name.isEmpty()) continue;
            String vendor = item.optString("vendor", "");
            String path = pathText(item.optJSONArray("path"));
            restaurants.add(new RestaurantOption(id, name, vendor, path));
        }
        return restaurants;
    }

    private static String readStream(InputStream stream) throws Exception {
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

    private static String pathText(JSONArray path) {
        if (path == null || path.length() == 0) return "";
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < path.length(); i++) {
            String item = path.optString(i, "");
            if (item.isEmpty()) continue;
            if (builder.length() > 0) builder.append(" / ");
            builder.append(item);
        }
        return builder.toString();
    }

    private void toggleRestaurant(RestaurantOption restaurant) {
        if (selected.containsKey(restaurant.id)) {
            selected.remove(restaurant.id);
        } else {
            selected.put(restaurant.id, restaurant);
        }
        updateSelectedSummary();
        adapter.notifyDataSetChanged();
    }

    private void updateSelectedSummary() {
        if (selectedView == null) return;
        if (selected.isEmpty()) {
            selectedView.setText(R.string.widget_config_selected_empty);
        } else {
            selectedView.setText(getString(R.string.widget_config_selected_count, selected.size()));
        }
    }

    private void saveConfiguration() {
        if (selected.isEmpty()) {
            Toast.makeText(this, R.string.widget_config_select_required, Toast.LENGTH_SHORT).show();
            return;
        }

        List<RestaurantMenuWidgetProvider.RestaurantSelection> restaurants = new ArrayList<>();
        for (RestaurantOption restaurant : selected.values()) {
            restaurants.add(new RestaurantMenuWidgetProvider.RestaurantSelection(restaurant.id, restaurant.name));
        }

        RestaurantMenuWidgetProvider.saveRestaurantSelection(this, appWidgetId, restaurants);
        RestaurantMenuWidgetProvider.requestUpdate(this, appWidgetId);

        Intent resultValue = new Intent();
        resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, resultValue);
        finish();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class RestaurantAdapter extends BaseAdapter {
        private final Context context;

        RestaurantAdapter(Context context) {
            this.context = context;
        }

        @Override
        public int getCount() {
            return results.size();
        }

        @Override
        public RestaurantOption getItem(int position) {
            return results.get(position);
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public android.view.View getView(int position, android.view.View convertView, android.view.ViewGroup parent) {
            RestaurantOption restaurant = getItem(position);
            LinearLayout row = new LinearLayout(context);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(4), dp(10), dp(4), dp(10));

            CheckBox checkBox = new CheckBox(context);
            checkBox.setChecked(selected.containsKey(restaurant.id));
            checkBox.setClickable(false);
            row.addView(checkBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            LinearLayout text = new LinearLayout(context);
            text.setOrientation(LinearLayout.VERTICAL);
            text.setPadding(dp(8), 0, 0, 0);

            TextView name = new TextView(context);
            name.setText(restaurant.name);
            name.setTextColor(0xff0f172a);
            name.setTextSize(15);
            name.setTypeface(Typeface.DEFAULT_BOLD);
            text.addView(name, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            TextView meta = new TextView(context);
            meta.setText(restaurant.meta());
            meta.setTextColor(0xff64748b);
            meta.setTextSize(12);
            text.addView(meta, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            row.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            return row;
        }
    }

    private static final class RestaurantOption {
        final String id;
        final String name;
        final String vendor;
        final String path;

        RestaurantOption(String id, String name, String vendor, String path) {
            this.id = id;
            this.name = name;
            this.vendor = vendor;
            this.path = path;
        }

        String meta() {
            String vendorLabel = "welstory".equals(vendor) ? "삼성웰스토리" : "shinsegae".equals(vendor) ? "신세계푸드" : vendor;
            if (vendorLabel == null || vendorLabel.isEmpty()) return path;
            if (path == null || path.isEmpty()) return vendorLabel;
            return vendorLabel + " · " + path;
        }
    }
}
