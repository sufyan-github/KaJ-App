<?php
// ================================
// KAAJ BDApps gateway configuration
// ================================
// Secrets are loaded from an env file, never hardcoded here. Lookup order:
//   1. the file named by the KAAJ_GATEWAY_ENV_FILE environment variable
//      (used by local tests; must be an absolute path),
//   2. ../kaaj-bdapps-gateway.env (one level ABOVE this folder, i.e. outside
//      the public document root when the gateway is deployed in public_html/),
//   3. .env in this folder (blocked by .htaccess; least preferred).
// Values from the file always win over ambient variables: on a shared,
// multi-tenant host an unrelated app could export the same generic names.

function bdapps_load_env($path) {
    if (!is_file($path) || !is_readable($path)) return false;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $eq = strpos($line, '=');
        if ($eq === false) continue;
        $key = trim(substr($line, 0, $eq));
        $value = trim(substr($line, $eq + 1));
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && substr($value, -1) === $value[0]) {
            $value = substr($value, 1, -1);
        }
        if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) continue;
        putenv("$key=$value");
    }
    return true;
}

function bdapps_env_file() {
    $explicit = getenv('KAAJ_GATEWAY_ENV_FILE');
    if ($explicit === false || $explicit === '') {
        // Apache SetEnv may surface only in $_SERVER (optionally REDIRECT_-prefixed).
        $explicit = $_SERVER['KAAJ_GATEWAY_ENV_FILE'] ?? ($_SERVER['REDIRECT_KAAJ_GATEWAY_ENV_FILE'] ?? '');
    }
    if (is_string($explicit) && $explicit !== '') return $explicit;
    $outside = dirname(__DIR__) . '/kaaj-bdapps-gateway.env';
    if (is_file($outside)) return $outside;
    return __DIR__ . '/.env';
}

bdapps_load_env(bdapps_env_file());

function bdapps_env($key, $default = '') {
    $value = getenv($key);
    return ($value === false || $value === '') ? $default : $value;
}

function bdapps_require_env($key) {
    $value = getenv($key);
    if ($value === false || $value === '') {
        // Log the missing key server-side only; never reveal config names to callers.
        bdapps_write_log('ERROR', 'Missing required gateway configuration', ['key' => $key]);
        http_response_code(500);
        header('Content-Type: application/json');
        header('Cache-Control: no-store');
        echo json_encode(['statusCode' => 'GW_UNAVAILABLE', 'statusDetail' => 'Service unavailable']);
        exit;
    }
    return $value;
}

// Paths first so configuration errors can be logged.
define('GATEWAY_STORAGE_DIR', rtrim(bdapps_env('GATEWAY_STORAGE_DIR', __DIR__ . '/storage'), '/'));
define('LOG_ERRORS', bdapps_env('GATEWAY_LOG_ENABLED', '1') !== '0');
define('LOG_FILE', bdapps_env('GATEWAY_LOG_FILE', GATEWAY_STORAGE_DIR . '/gateway.log'));
define('LOG_MAX_BYTES', 5 * 1024 * 1024);

// BDApps credentials (only stored here, never in the Nest API or the app).
define('BDAPPS_APP_ID', bdapps_require_env('BDAPPS_APP_ID'));
define('BDAPPS_PASSWORD', bdapps_require_env('BDAPPS_PASSWORD'));
define('BDAPPS_APP_HASH', bdapps_require_env('BDAPPS_APP_HASH'));
// Base URL of the BDApps API. Override only to point at the local mock.
define('BDAPPS_API_BASE', rtrim(bdapps_env('BDAPPS_API_BASE', 'https://developer.bdapps.com'), '/'));
// Android package name (or Play Store URL) reported as applicationMetaData.appCode.
define('BDAPPS_APP_CODE', bdapps_env('BDAPPS_APP_CODE', 'app.kaaj.mobile'));
// Optional SMS sender/short code for /sms/send; omitted when empty.
define('BDAPPS_SMS_SOURCE_ADDRESS', bdapps_env('BDAPPS_SMS_SOURCE_ADDRESS', ''));

// Shared HMAC key with the Nest API (BDAPPS_INTERNAL_API_KEY there). 32+ chars.
define('INTERNAL_API_KEY', bdapps_require_env('INTERNAL_API_KEY'));
if (strlen(INTERNAL_API_KEY) < 32) {
    bdapps_write_log('ERROR', 'Internal HMAC key is too short');
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['statusCode' => 'GW_UNAVAILABLE', 'statusDetail' => 'Service unavailable']);
    exit;
}

// Nest API base URL (no trailing slash): callback.php forwards verified events here.
define('NODE_BACKEND_URL', rtrim(bdapps_require_env('NODE_BACKEND_URL'), '/'));
define('NODE_BACKEND_WEBHOOK_PATH', '/' . ltrim(bdapps_env('NODE_BACKEND_WEBHOOK_PATH', '/api/v1/subscriptions/bdapps/webhook'), '/'));

// Minimum seconds between two forwarded notifications for one subscriber.
// Production keeps the default (10). Local tests may lower it.
define('CALLBACK_THROTTLE_SECONDS', max(0, (int) bdapps_env('CALLBACK_THROTTLE_SECONDS', '10')));

function bdapps_redact_log_context($value, $key = '') {
    $sensitiveKeys = ['subscriberid', 'subscriber', 'mobile', 'phone', 'otp', 'token', 'password', 'signature', 'apikey', 'message', 'referenceno', 'response'];
    if (in_array(strtolower((string) $key), $sensitiveKeys, true)) return '[REDACTED]';
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $childKey => $childValue) {
            $clean[$childKey] = bdapps_redact_log_context($childValue, (string) $childKey);
        }
        return $clean;
    }
    return $value;
}

function bdapps_write_log($level, $message, $context = []) {
    if (defined('LOG_ERRORS') && !LOG_ERRORS) return;
    $file = defined('LOG_FILE') ? LOG_FILE : __DIR__ . '/storage/gateway.log';
    $dir = dirname($file);
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_file($file) && filesize($file) >= LOG_MAX_BYTES) {
        @unlink($file . '.1');
        @rename($file, $file . '.1');
    }
    $date = gmdate('c');
    $safeContext = bdapps_redact_log_context($context);
    $ctx = !empty($safeContext) ? json_encode($safeContext, JSON_UNESCAPED_SLASHES) : '';
    @file_put_contents($file, "[$date] $level: $message $ctx\n", FILE_APPEND | LOCK_EX);
}

function logError($message, $context = []) {
    bdapps_write_log('ERROR', $message, $context);
}

function logInfo($message, $context = []) {
    bdapps_write_log('INFO', $message, $context);
}
