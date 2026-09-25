<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');

function respond(int $status, bool $ok, string $message): never {
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, false, 'Method not allowed.');
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 16000) {
    respond(413, false, 'Message is too large.');
}

// Hidden field: real visitors never fill this; simple bots usually do.
if (trim((string) ($_POST['website'] ?? '')) !== '') {
    respond(200, true, 'Message received.');
}

$name = trim((string) ($_POST['name'] ?? ''));
$contact = trim((string) ($_POST['contact'] ?? ''));
$subject = trim((string) ($_POST['subject'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

if (mb_strlen($name) < 2 || mb_strlen($name) > 80 ||
    mb_strlen($contact) < 5 || mb_strlen($contact) > 120 ||
    mb_strlen($subject) < 3 || mb_strlen($subject) > 120 ||
    mb_strlen($message) < 10 || mb_strlen($message) > 3000) {
    respond(422, false, 'Please complete every field correctly.');
}

foreach ([$name, $contact, $subject] as $headerValue) {
    if (preg_match('/[\r\n]/', $headerValue)) {
        respond(422, false, 'Invalid form data.');
    }
}

$recipient = 'abusufyan.cse20@gmail.com';
$host = preg_replace('/[^a-z0-9.-]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? 'kaaj.app'));
$host = preg_replace('/^www\./i', '', $host);
$from = 'no-reply@' . ($host ?: 'kaaj.app');
$mailSubject = '[Kaaj Website] ' . $subject;
$body = "New Kaaj website message\n\n"
    . "Name: {$name}\n"
    . "Email/Phone: {$contact}\n"
    . "Subject: {$subject}\n\n"
    . "Message:\n{$message}\n\n"
    . 'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";

$headers = [
    'From: Kaaj Website <' . $from . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
];

if (filter_var($contact, FILTER_VALIDATE_EMAIL)) {
    $headers[] = 'Reply-To: ' . $contact;
}

if (!mail($recipient, $mailSubject, $body, implode("\r\n", $headers))) {
    respond(500, false, 'The server could not send the message.');
}

respond(200, true, 'Message sent successfully.');
