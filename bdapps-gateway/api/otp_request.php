<?php
// Nest -> BDApps: request a subscription OTP. E1351 means "already registered"
// (no OTP sent); Nest then falls back to its own code via sms_send.php.
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

$payload = Security::validateInternalRequest();
$subscriberId = GatewayHttp::subscriberId($payload);
try {
    $response = BDAppsClient::requestOtp($subscriberId);
} catch (BDAppsUnavailable $e) {
    GatewayHttp::upstreamFailed();
}
GatewayHttp::respond(200, GatewayHttp::pick($response, ['statusCode', 'statusDetail', 'referenceNo', 'version']));
