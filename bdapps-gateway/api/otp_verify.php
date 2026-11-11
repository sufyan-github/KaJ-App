<?php
// Nest -> BDApps: verify a subscription OTP. On S1000 the returned subscriberId
// (real or masked) must be stored by Nest and used for every later call.
require_once dirname(__DIR__) . '/Security.php';
require_once dirname(__DIR__) . '/BDAppsClient.php';

$payload = Security::validateInternalRequest();
$referenceNo = GatewayHttp::referenceNo($payload);
$otp = GatewayHttp::otp($payload);
try {
    $response = BDAppsClient::verifyOtp($referenceNo, $otp);
} catch (BDAppsUnavailable $e) {
    GatewayHttp::upstreamFailed();
}
GatewayHttp::respond(200, GatewayHttp::pick($response, ['statusCode', 'statusDetail', 'subscriptionStatus', 'subscriberId', 'version']));
