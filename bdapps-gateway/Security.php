<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Http.php';

class Security {

    /**
     * Authenticates a request from the KAAJ Nest API.
     * Mandatory: X-Timestamp (unix seconds, +-300 s), X-Nonce (32 hex, single use)
     * and X-Signature = hex HMAC-SHA256(rawBody . timestamp . nonce, INTERNAL_API_KEY).
     * Optional: X-API-Key. Newer Nest builds do not send the secret in a header;
     * when an older caller still sends it, it must match.
     */
    public static function validateInternalRequest() {
        GatewayHttp::requirePost();
        $headers = array_change_key_case(self::headers(), CASE_LOWER);

        $apiKey = (string) ($headers['x-api-key'] ?? '');
        $timestamp = (string) ($headers['x-timestamp'] ?? '');
        $nonce = (string) ($headers['x-nonce'] ?? '');
        $signature = strtolower((string) ($headers['x-signature'] ?? ''));

        if (!preg_match('/^\d{10,13}$/', $timestamp)
            || !preg_match('/^[a-f0-9]{32}$/i', $nonce)
            || !preg_match('/^[a-f0-9]{64}$/', $signature)) {
            self::reject('missing or malformed security headers');
        }
        if ($apiKey !== '' && !hash_equals(INTERNAL_API_KEY, $apiKey)) {
            self::reject('api key mismatch');
        }
        if (abs(time() - (int) $timestamp) > 300) {
            self::reject('timestamp outside window');
        }

        $rawBody = file_get_contents('php://input');
        if ($rawBody === false || strlen($rawBody) > 8192) self::reject('body unreadable or too large');
        $expected = hash_hmac('sha256', $rawBody . $timestamp . $nonce, INTERNAL_API_KEY);
        if (!hash_equals($expected, $signature)) {
            self::reject('signature mismatch');
        }

        // Claim the nonce only after the signature is valid so unauthenticated
        // callers cannot fill the nonce store.
        if (!self::claimOnce('nonces', strtolower($nonce), 600)) {
            self::reject('nonce replay');
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) GatewayHttp::badRequest();
        return $payload;
    }

    /**
     * Atomically records a key in GATEWAY_STORAGE_DIR/<bucket>. Returns false
     * when it was already recorded within $ttlSeconds.
     */
    public static function claimOnce($bucket, $key, $ttlSeconds) {
        $dir = GATEWAY_STORAGE_DIR . '/' . $bucket;
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            logError('Replay store unavailable', ['bucket' => $bucket]);
            GatewayHttp::respond(503, ['statusCode' => 'GW_UNAVAILABLE', 'statusDetail' => 'Service unavailable']);
        }
        if (random_int(1, 20) === 1) {
            foreach (glob($dir . '/*.claim') ?: [] as $file) {
                if (@filemtime($file) < time() - $ttlSeconds) @unlink($file);
            }
        }
        $path = $dir . '/' . hash('sha256', $key) . '.claim';
        if (is_file($path) && @filemtime($path) < time() - $ttlSeconds) @unlink($path);
        $handle = @fopen($path, 'x');
        if ($handle === false) return false;
        fwrite($handle, (string) time());
        fclose($handle);
        @chmod($path, 0600);
        return true;
    }

    /** Returns false when $key was seen less than $seconds ago; records it otherwise. */
    public static function throttle($bucket, $key, $seconds) {
        if ($seconds <= 0) return true;
        $dir = GATEWAY_STORAGE_DIR . '/' . $bucket;
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        $path = $dir . '/' . hash('sha256', $key) . '.last';
        $handle = @fopen($path, 'c+');
        if ($handle === false) return true;
        $allowed = true;
        if (flock($handle, LOCK_EX)) {
            $last = (int) stream_get_contents($handle);
            if ($last > 0 && time() - $last < $seconds) {
                $allowed = false;
            } else {
                ftruncate($handle, 0);
                rewind($handle);
                fwrite($handle, (string) time());
            }
            flock($handle, LOCK_UN);
        }
        fclose($handle);
        @chmod($path, 0600);
        return $allowed;
    }

    private static function headers() {
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            if (is_array($headers)) return $headers;
        }
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (strpos($name, 'HTTP_') === 0) {
                $headers[str_replace('_', '-', substr($name, 5))] = $value;
            }
        }
        return $headers;
    }

    private static function reject($reason) {
        logError('Rejected internal request', ['reason' => $reason]);
        GatewayHttp::respond(403, ['statusCode' => 'GW_FORBIDDEN', 'statusDetail' => 'Forbidden']);
    }
}
