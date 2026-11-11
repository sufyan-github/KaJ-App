<?php
// Nest -> BDApps: live subscription status (/subscription/getStatus only).
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

$payload = Security::validateInternalRequest();
$subscriberId = GatewayHttp::subscriberId($payload);
try {
    $response = BDAppsClient::getStatus($subscriberId);
} catch (BDAppsUnavailable $e) {
    GatewayHttp::upstreamFailed();
}
GatewayHttp::respond(200, GatewayHttp::pick($response, ['statusCode', 'statusDetail', 'subscriptionStatus', 'version']));
