<?php
// BDApps -> gateway: "Subscription notification URL".
// BDApps does not sign notifications; it echoes our applicationId and password.
// We therefore (1) authenticate those with hash_equals, (2) drop duplicates and
// bursts, (3) never trust the posted status but re-query /subscription/getStatus,
// and (4) forward a normalized, HMAC-signed event to the Nest API.
// Authenticated notifications ALWAYS get HTTP 200 + S1000 so BDApps does not
// retry forever; forward failures are logged and Nest also polls the status.
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

const CALLBACK_ACK = ['statusCode' => 'S1000', 'statusDetail' => 'Request was successfully processed'];

GatewayHttp::requirePost();

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) && strlen($rawBody) <= 8192 ? json_decode($rawBody, true) : null;
if (!is_array($payload) && !empty($_POST)) $payload = $_POST;
if (!is_array($payload)) GatewayHttp::badRequest();

$applicationId = $payload['applicationId'] ?? null;
$password = $payload['password'] ?? null;
if (!is_string($applicationId) || !hash_equals(BDAPPS_APP_ID, $applicationId)
    || ($password !== null && (!is_string($password) || !hash_equals(BDAPPS_PASSWORD, $password)))) {
    logError('Rejected subscription notification', ['reason' => 'application credentials mismatch']);
    GatewayHttp::respond(403, ['statusCode' => 'GW_FORBIDDEN', 'statusDetail' => 'Forbidden']);
}

$subscriberId = $payload['subscriberId'] ?? null;
$postedStatus = is_string($payload['status'] ?? null) ? substr($payload['status'], 0, 40) : '';
$timeStamp = is_scalar($payload['timeStamp'] ?? null) ? substr((string) $payload['timeStamp'], 0, 32) : '';
$frequency = is_string($payload['frequency'] ?? null) ? substr($payload['frequency'], 0, 32) : null;

if (!is_string($subscriberId) || !preg_match(GatewayHttp::SUBSCRIBER_PATTERN, $subscriberId)) {
    logError('Ignored notification with an invalid subscriberId');
    GatewayHttp::respond(200, CALLBACK_ACK);
}

// Exact replays (same subscriber, status and provider timestamp) are ignored.
$eventKey = $subscriberId . '|' . strtoupper($postedStatus) . '|' . $timeStamp;
if (!Security::claimOnce('events', $eventKey, 7 * 86400)) {
    logInfo('Ignored duplicate notification');
    GatewayHttp::respond(200, CALLBACK_ACK);
}
if (!Security::throttle('subscriber-throttle', $subscriberId, CALLBACK_THROTTLE_SECONDS)) {
    logInfo('Throttled notification burst');
    GatewayHttp::respond(200, CALLBACK_ACK);
}

try {
    $live = BDAppsClient::getStatus($subscriberId);
} catch (BDAppsUnavailable $e) {
    $live = null;
}
$status = is_array($live) && ($live['statusCode'] ?? '') === 'S1000'
    ? BDAppsClient::normalizeStatus($live['subscriptionStatus'] ?? null)
    : null;
if ($status === null) {
    logError('Could not confirm notification with getStatus');
    GatewayHttp::respond(200, CALLBACK_ACK);
}

$forward = json_encode([
    'subscriberId' => $subscriberId,
    // Nest contract: REGISTERED | UNSUBSCRIBED | CHARGE_PENDING
    'status' => $status === 'UNREGISTERED' ? 'UNSUBSCRIBED' : $status,
    'frequency' => $frequency,
    'providerTimeStamp' => $timeStamp !== '' ? $timeStamp : null,
    'providerEventId' => 'bdapps-' . substr(hash('sha256', $eventKey), 0, 32),
    'verifiedAt' => gmdate('c'),
], JSON_UNESCAPED_SLASHES);
$timestamp = (string) time();
$nonce = bin2hex(random_bytes(16));
$signature = hash_hmac('sha256', $forward . $timestamp . $nonce, INTERNAL_API_KEY);

$ch = curl_init(NODE_BACKEND_URL . NODE_BACKEND_WEBHOOK_PATH);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        "X-Timestamp: $timestamp",
        "X-Nonce: $nonce",
        "X-Signature: $signature",
    ],
    CURLOPT_POSTFIELDS => $forward,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => false,
]);
curl_exec($ch);
$error = curl_error($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
if (PHP_VERSION_ID < 80000) curl_close($ch);

if ($error !== '' || $httpCode < 200 || $httpCode >= 300) {
    logError('Failed to forward notification to the API', ['httpCode' => $httpCode, 'curlError' => $error]);
} else {
    logInfo('Forwarded notification to the API', ['httpCode' => $httpCode, 'status' => $status]);
}
GatewayHttp::respond(200, CALLBACK_ACK);
