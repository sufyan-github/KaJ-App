package app.kaaj.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "app.kaaj.mobile/location"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                if (call.method != "currentLocation") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                currentLocation(result)
            }
    }

    private fun currentLocation(result: MethodChannel.Result) {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            result.error("PERMISSION_DENIED", "Location permission is required.", null)
            return
        }
        val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            result.error("LOCATION_DISABLED", "Turn on device location and try again.", null)
            return
        }
        var delivered = false
        lateinit var listener: LocationListener
        fun deliver(location: Location?, error: String? = null) {
            if (delivered) return
            delivered = true
            manager.removeUpdates(listener)
            if (location == null) {
                result.error("LOCATION_UNAVAILABLE", error ?: "Could not get current location.", null)
            } else {
                result.success(
                    mapOf(
                        "latitude" to location.latitude,
                        "longitude" to location.longitude,
                        "accuracy" to location.accuracy.toDouble(),
                        "time" to location.time,
                        "mockLocation" to location.isFromMockProvider,
                    ),
                )
            }
        }
        listener = object : LocationListener {
            override fun onLocationChanged(location: Location) = deliver(location)
            override fun onProviderDisabled(provider: String) = deliver(null, "Location was turned off.")
            override fun onProviderEnabled(provider: String) = Unit
            @Deprecated("Deprecated in Android")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        @Suppress("MissingPermission")
        manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
        Handler(Looper.getMainLooper()).postDelayed({
            @Suppress("MissingPermission")
            val fallback = manager.getLastKnownLocation(provider)
            deliver(fallback, "Location timed out. Move outdoors and try again.")
        }, 12_000)
    }
}
