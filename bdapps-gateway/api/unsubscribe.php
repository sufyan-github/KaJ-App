<?php
// Nest -> BDApps: stop carrier billing (/subscription/send action "0").
// E1356 (already unregistered) is a success for the caller.
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

$payload = Security::validateInternalRequest();
$subscriberId = GatewayHttp::subscriberId($payload);
try {
    $response = BDAppsClient::subscription($subscriberId, '0');
} catch (BDAppsUnavailable $e) {
    GatewayHttp::upstreamFailed();
}
$statusCode = (string) ($response['statusCode'] ?? '');
if ($statusCode === 'S1000' || $statusCode === 'E1356') {
    GatewayHttp::respond(200, [
        'statusCode' => 'S1000',
        'statusDetail' => $statusCode === 'E1356' ? 'Already unregistered' : 'Unregistered',
        'subscriptionStatus' => 'UNREGISTERED',
    ]);
}
GatewayHttp::respond(200, GatewayHttp::pick($response, ['statusCode', 'statusDetail', 'subscriptionStatus']));
