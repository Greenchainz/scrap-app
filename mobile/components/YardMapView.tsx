/**
 * YardMapView — Azure Maps rendered inside a WebView.
 *
 * Uses the official Azure Maps JavaScript SDK (atlas.js) served from CDN.
 * No Google Maps, no Apple Maps — pure Azure.
 *
 * Pin colours:
 *   Green  = #1 ranked yard (best payout)
 *   Amber  = ranks 2 through top 40%
 *   Grey   = rest
 */
import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

export type YardMapRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  distanceMiles: number | null;
  totalLow: number;
  totalHigh: number;
};

type Props = {
  yards: YardMapRow[];
  userLatitude?: number;
  userLongitude?: number;
  /** Azure Maps subscription key — pass via EXPO_PUBLIC_AZURE_MAPS_KEY */
  azureMapsKey: string;
  style?: object;
};

function buildMapHtml(
  yards: YardMapRow[],
  userLatitude: number | undefined,
  userLongitude: number | undefined,
  azureMapsKey: string,
): string {
  const amberThreshold = Math.max(1, Math.floor(yards.length * 0.4));

  // Centre map: user location if available, else first yard, else Seattle fallback
  const centerLon = userLongitude ?? yards[0]?.longitude ?? -122.3321;
  const centerLat = userLatitude ?? yards[0]?.latitude ?? 47.6062;

  const yardsJson = JSON.stringify(
    yards.map((y, i) => ({
      id: y.id,
      name: y.name,
      city: y.city,
      state: y.state,
      lat: y.latitude,
      lon: y.longitude,
      dist: y.distanceMiles,
      low: y.totalLow,
      high: y.totalHigh,
      rank: i + 1,
      color: i === 0 ? '#1a7f4b' : i < amberThreshold ? '#e08a00' : '#888888',
    })),
  );

  const userMarkerJs =
    userLatitude != null && userLongitude != null
      ? `
        map.markers.add(new atlas.HtmlMarker({
          htmlContent: '<div style="width:14px;height:14px;background:#2196F3;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
          position: [${userLongitude}, ${userLatitude}],
        }));`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>Yard Map</title>
  <link rel="stylesheet" href="https://atlas.microsoft.com/sdk/javascript/mapcontrol/2/atlas.min.css">
  <script src="https://atlas.microsoft.com/sdk/javascript/mapcontrol/2/atlas.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .popup-box { padding: 10px; min-width: 150px; font-family: -apple-system, sans-serif; }
    .popup-name { font-weight: 700; font-size: 13px; color: #222; }
    .popup-loc  { font-size: 11px; color: #888; margin-top: 2px; }
    .popup-pay  { font-weight: 800; font-size: 13px; color: #1a7f4b; margin-top: 4px; }
    .popup-dist { font-size: 11px; color: #aaa; margin-top: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var yards = ${yardsJson};
    var popup = new atlas.Popup({ pixelOffset: [0, -32], closeButton: true });

    var map = new atlas.Map('map', {
      center: [${centerLon}, ${centerLat}],
      zoom: 10,
      style: 'road',
      language: 'en-US',
      authOptions: {
        authType: 'subscriptionKey',
        subscriptionKey: '${azureMapsKey}'
      }
    });

    map.events.add('ready', function () {
      ${userMarkerJs}

      yards.forEach(function (y) {
        var marker = new atlas.HtmlMarker({
          htmlContent:
            '<div style="width:28px;height:28px;background:' + y.color +
            ';border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
            'box-shadow:0 2px 6px rgba(0,0,0,.35);font-size:11px;font-weight:700;color:#fff;cursor:pointer;">' +
            y.rank + '</div>',
          position: [y.lon, y.lat],
        });

        map.events.add('click', marker, function () {
          popup.setOptions({
            content:
              '<div class="popup-box">' +
              '<div class="popup-name">' + y.name + '</div>' +
              '<div class="popup-loc">' + y.city + ', ' + y.state + '</div>' +
              '<div class="popup-pay">$' + y.low.toFixed(2) + ' – $' + y.high.toFixed(2) + '</div>' +
              (y.dist != null ? '<div class="popup-dist">' + y.dist + ' mi away</div>' : '') +
              '</div>',
            position: [y.lon, y.lat],
          });
          popup.open(map);
        });

        map.markers.add(marker);
      });

      // Auto-fit camera to show all yards + user position
      var positions = yards.map(function (y) { return [y.lon, y.lat]; });
      ${userLatitude != null ? `positions.push([${userLongitude}, ${userLatitude}]);` : ''}
      if (positions.length > 1) {
        map.setCamera({ bounds: atlas.data.BoundingBox.fromPositions(positions), padding: 50 });
      }
    });
  </script>
</body>
</html>`;
}

export default function YardMapView({
  yards,
  userLatitude,
  userLongitude,
  azureMapsKey,
  style,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const html = buildMapHtml(yards, userLatitude, userLongitude, azureMapsKey);

  return (
    <View style={[styles.container, style]}>
      {!azureMapsKey && (
        <View style={styles.keyMissing}>
          <ActivityIndicator color="#888" />
        </View>
      )}
      {!!azureMapsKey && (
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={styles.webView}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#1a7f4b" />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e8ece8',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8ece8',
  },
  keyMissing: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
