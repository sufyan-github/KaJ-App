<?php
require_once __DIR__ . '/config.php';

class BDAppsUnavailable extends \RuntimeException {}

/**
 * Thin BDApps client. Failures from BDApps arrive as HTTP 200 with a
 * statusCode other than S1000; those are returned to the caller unchanged.
 * Transport errors and non-JSON answers throw BDAppsUnavailable.
 */
class BDAppsClient {

    private static function post($path, array $data) {
        $url = BDAPPS_API_BASE . $path;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($data, JSON_UNESCAPED_SLASHES),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $response = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (PHP_VERSION_ID < 80000) curl_close($ch);

        $decoded = is_string($response) ? json_decode($response, true) : null;
        if ($error !== '' || !is_array($decoded) || !isset($decoded['statusCode'])) {
            logError('BDApps call failed', ['path' => $path, 'httpCode' => $httpCode, 'curlError' => $error]);
            throw new BDAppsUnavailable('BDApps unavailable');
        }
        logInfo('BDApps call', ['path' => $path, 'httpCode' => $httpCode, 'statusCode' => (string) $decoded['statusCode']]);
        return $decoded;
    }

    private static function credentials() {
        return ['applicationId' => BDAPPS_APP_ID, 'password' => BDAPPS_PASSWORD];
    }

    public static function requestOtp($subscriberId) {
        return self::post('/subscription/otp/request', self::credentials() + [
            'subscriberId' => $subscriberId,
            'applicationHash' => BDAPPS_APP_HASH,
            'applicationMetaData' => [
                'client' => 'MOBILEAPP',
                'device' => 'App',
                'os' => 'android',
                'appCode' => BDAPPS_APP_CODE,
            ],
        ]);
    }

    public static function verifyOtp($referenceNo, $otp) {
        return self::post('/subscription/otp/verify', self::credentials() + [
            'referenceNo' => $referenceNo,
            'otp' => $otp,
        ]);
    }

    public static function getStatus($subscriberId) {
        return self::post('/subscription/getStatus', self::credentials() + [
            'subscriberId' => $subscriberId,
        ]);
    }

    /** action "1" subscribe, "0" unsubscribe. */
    public static function subscription($subscriberId, $action) {
        return self::post('/subscription/send', self::credentials() + [
            'subscriberId' => $subscriberId,
            'action' => $action === '1' ? '1' : '0',
        ]);
    }

    public static function sendSms($subscriberId, $message) {
        $data = ['version' => '1.0'] + self::credentials() + [
            'message' => $message,
            'destinationAddresses' => [$subscriberId],
            'deliveryStatusRequest' => '0',
        ];
        if (BDAPPS_SMS_SOURCE_ADDRESS !== '') $data['sourceAddress'] = BDAPPS_SMS_SOURCE_ADDRESS;
        return self::post('/sms/send', $data);
    }

    /** REGISTERED | UNREGISTERED | CHARGE_PENDING, or null when unknown. */
    public static function normalizeStatus($value) {
        if (!is_string($value)) return null;
        $status = preg_replace('/[_\s]+/', ' ', rtrim(strtoupper(trim($value)), '.'));
        if ($status === 'REGISTERED') return 'REGISTERED';
        if (in_array($status, ['UNREGISTERED', 'UNSUBSCRIBED', 'NOT REGISTERED', 'EXPIRED', 'CANCELLED'], true)) return 'UNREGISTERED';
        if (in_array($status, ['PENDING', 'CHARGE', 'PENDING CHARGE', 'CHARGE PENDING'], true)) return 'CHARGE_PENDING';
        return null;
    }
}
