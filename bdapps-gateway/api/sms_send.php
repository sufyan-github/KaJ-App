<?php
// Nest -> BDApps: send one SMS (/sms/send) to a single subscriber, e.g. the
// KAAJ login code for a number that is already subscribed (E1351).
// The message text is never logged.
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

$payload = Security::validateInternalRequest();
$subscriberId = GatewayHttp::subscriberId($payload);
$message = GatewayHttp::message($payload);
try {
    $response = BDAppsClient::sendSms($subscriberId, $message);
} catch (BDAppsUnavailable $e) {
    GatewayHttp::upstreamFailed();
}
$result = GatewayHttp::pick($response, ['statusCode', 'statusDetail', 'requestId']);
// The request can succeed while the single destination failed.
$destination = $response['destinationResponses'][0] ?? null;
if ($result['statusCode'] === 'S1000' && is_array($destination)
    && isset($destination['statusCode']) && $destination['statusCode'] !== 'S1000') {
    $result['statusCode'] = (string) $destination['statusCode'];
    $result['statusDetail'] = (string) ($destination['statusDetail'] ?? 'Destination failed');
}
GatewayHttp::respond(200, $result);
