package app.kaaj.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private companion object {
        const val CHANNEL = "app.kaaj.mobile/location"

        /** How long to wait for a live fix before falling back. */
        const val FIX_TIMEOUT_MS = 15_000L

        /**
         * A cached fix older than this is refused.
         *
         * Attendance check-ins drive payment disputes. Returning
         * `getLastKnownLocation` with no age check meant a fix recorded hours
         * earlier and kilometres away could satisfy a geofence, which is a
         * fraud surface rather than a convenience.
         */
        const val MAX_FIX_AGE_MS = 90_000L
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method != "currentLocation") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                currentLocation(result)
            }
    }

    private fun currentLocation(result: MethodChannel.Result) {
        if (!hasLocationPermission()) {
            result.error("PERMISSION_DENIED", "Location permission is required.", null)
            return
        }

        val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        // Listen on every enabled provider rather than picking one. Choosing
        // GPS first meant an indoor worker waited out the whole timeout while
        // the network provider already had a usable fix.
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

        if (providers.isEmpty()) {
            result.error("LOCATION_DISABLED", "Turn on device location and try again.", null)
            return
        }

        val handler = Handler(Looper.getMainLooper())
        var delivered = false
        val listeners = mutableListOf<LocationListener>()

        fun cleanUp() {
            listeners.forEach { runCatching { manager.removeUpdates(it) } }
            listeners.clear()
        }

        fun deliver(location: Location?, errorCode: String, errorMessage: String) {
            if (delivered) return
            delivered = true
            handler.removeCallbacksAndMessages(null)
            cleanUp()
            if (location == null) {
                result.error(errorCode, errorMessage, null)
            } else {
                result.success(location.toPayload())
            }
        }

        providers.forEach { provider ->
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) =
                    deliver(location, "LOCATION_UNAVAILABLE", "Could not get current location.")

                override fun onProviderDisabled(provider: String) = Unit
                override fun onProviderEnabled(provider: String) = Unit

                @Deprecated("Deprecated in Android")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            }
            listeners += listener
            runCatching {
                @Suppress("MissingPermission")
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
            }
        }

        handler.postDelayed({
            val fresh = providers
                .mapNotNull { provider ->
                    runCatching {
                        @Suppress("MissingPermission")
                        manager.getLastKnownLocation(provider)
                    }.getOrNull()
                }
                .filter { it.ageMillis() <= MAX_FIX_AGE_MS }
                .minByOrNull { it.accuracy }

            deliver(
                fresh,
                "LOCATION_TIMEOUT",
                "Could not get a recent location. Move to an open area and try again.",
            )
        }, FIX_TIMEOUT_MS)
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /**
     * Elapsed-realtime age, which a device clock change cannot forge.
     */
    private fun Location.ageMillis(): Long =
        (SystemClock.elapsedRealtimeNanos() - elapsedRealtimeNanos) / 1_000_000

    private fun Location.toPayload(): Map<String, Any> = mapOf(
        "latitude" to latitude,
        "longitude" to longitude,
        "accuracy" to accuracy.toDouble(),
        "time" to time,
        "ageMillis" to ageMillis(),
        "mockLocation" to isMockLocation(),
    )

    @Suppress("DEPRECATION")
    private fun Location.isMockLocation(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else isFromMockProvider
}
