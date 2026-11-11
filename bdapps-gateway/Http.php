<?php
require_once __DIR__ . '/config.php';

/** Small response/validation helpers shared by the api/ entry points. */
class GatewayHttp {
    const SUBSCRIBER_PATTERN = '/^tel:[A-Za-z0-9%+\/=._-]{8,160}$/';
    const OTP_PATTERN = '/^\d{4,8}$/';
    const REFERENCE_PATTERN = '/^[A-Za-z0-9_-]{4,64}$/';
    const MAX_SMS_CHARS = 160;

    public static function requirePost() {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Allow: POST');
            self::respond(405, ['statusCode' => 'GW_METHOD_NOT_ALLOWED', 'statusDetail' => 'Method not allowed']);
        }
    }

    public static function respond($httpStatus, array $body) {
        http_response_code($httpStatus);
        header('Content-Type: application/json');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($body, JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function badRequest() {
        self::respond(400, ['statusCode' => 'GW_BAD_REQUEST', 'statusDetail' => 'Invalid request']);
    }

    public static function upstreamFailed() {
        self::respond(502, ['statusCode' => 'GW_UPSTREAM_UNAVAILABLE', 'statusDetail' => 'Upstream unavailable']);
    }

    public static function subscriberId(array $payload) {
        $value = $payload['subscriberId'] ?? null;
        if (!is_string($value) || !preg_match(self::SUBSCRIBER_PATTERN, $value)) self::badRequest();
        return $value;
    }

    public static function otp(array $payload) {
        $value = $payload['otp'] ?? null;
        if (!is_string($value) || !preg_match(self::OTP_PATTERN, $value)) self::badRequest();
        return $value;
    }

    public static function referenceNo(array $payload) {
        $value = $payload['referenceNo'] ?? null;
        if (!is_string($value) || !preg_match(self::REFERENCE_PATTERN, $value)) self::badRequest();
        return $value;
    }

    public static function message(array $payload) {
        $value = $payload['message'] ?? null;
        // The /u modifier rejects invalid UTF-8; no mbstring dependency.
        if (!is_string($value)
            || preg_match('/^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]{1,' . self::MAX_SMS_CHARS . '}$/u', $value) !== 1) {
            self::badRequest();
        }
        return $value;
    }

    /** Copies only the documented, non-secret fields of a BDApps response. */
    public static function pick(array $response, array $fields) {
        $out = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $response) && (is_scalar($response[$field]) || $response[$field] === null)) {
                $out[$field] = $response[$field];
            }
        }
        if (!isset($out['statusCode']) || !is_string($out['statusCode'])) $out['statusCode'] = 'GW_UPSTREAM_INVALID';
        return $out;
    }
}
