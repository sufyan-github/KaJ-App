"""Exercise release diagnostics without making network calls."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "smoke_production_api.sh"
FAKE_CURL = r"""#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
url = args[-1]
auth = any(arg.startswith("Authorization: Bearer ") for arg in args)
with open(os.environ["REQUEST_LOG"], "a") as log:
    log.write(json.dumps({"url": url, "auth": auth,
                         "timeout": args[args.index("--max-time") + 1]}) + "\n")
case = os.environ.get("SMOKE_CASE", "")
if case == "transport" and url.endswith("/health"):
    sys.stdout.write("000")
    sys.exit(28)
status, body = 200, {"data": []}
if url.endswith("/health"):
    body = {"data": {"status": "ok"}}
elif url.endswith("/auth/otp/request"):
    status, body = 400, {"error": {"code": "VALIDATION_ERROR"}}
elif url.endswith("/jobs") and not auth:
    status, body = 401, {"error": {"code": "UNAUTHORIZED"}}
elif url.endswith("/auth/session"):
    body = {"data": {"user": {"id": "test-user"}}}
if case == "server_error" and url.endswith("/categories"):
    status, body = 500, {"error": {"code": "INTERNAL_SERVER_ERROR",
                                  "message": "private-error-content",
                                  "requestId": "test-request"}}
output = pathlib.Path(args[args.index("--output") + 1])
if case == "html" and url.endswith("/categories"):
    output.write_text("<html>maintenance</html>")
elif case == "bad_shape" and url.endswith("/locations"):
    output.write_text('{"data": {"error": "unavailable"}}')
else:
    output.write_text(json.dumps(body))
sys.stdout.write(str(status))
"""


class SmokeTests(unittest.TestCase):
    def run_smoke(self, case="", token="", url="https://example.test/api/v1/"):
        with tempfile.TemporaryDirectory(prefix="kaaj-smoke-test-") as folder:
            root = Path(folder)
            curl = root / "curl"
            curl.write_text(FAKE_CURL)
            curl.chmod(0o700)
            log = root / "requests.jsonl"
            env = {
                **os.environ,
                "PATH": str(root) + os.pathsep + os.environ["PATH"],
                "TMPDIR": folder,
                "REQUEST_LOG": str(log),
                "SMOKE_CASE": case,
                "KAAJ_API_URL": url,
                "KAAJ_SMOKE_ACCESS_TOKEN": token,
                "KAAJ_SMOKE_HEALTH_TIMEOUT": "90",
            }
            result = subprocess.run(
                ["bash", str(SCRIPT)], env=env, capture_output=True, text=True,
                timeout=10,
            )
            calls = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            for response in root.glob("kaaj-api-smoke-*/*.json"):
                self.assertEqual(response.stat().st_mode & 0o077, 0)
            return result, calls

    def test_public_checks_and_cold_start_deadline(self):
        result, calls = self.run_smoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 5)
        self.assertEqual(calls[0]["timeout"], "90")
        self.assertTrue(all(call["timeout"] == "30" for call in calls[1:]))
        self.assertFalse(any(call["auth"] for call in calls))

    def test_auth_reads_do_not_bypass_public_auth_check(self):
        result, calls = self.run_smoke(token="test-session-token")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 8)
        self.assertFalse(any(call["auth"] for call in calls[:5]))
        self.assertTrue(all(call["auth"] for call in calls[5:]))
        self.assertNotIn("test-session-token", result.stdout + result.stderr)

    def test_html_and_wrong_json_shape_fail(self):
        for case in ("html", "bad_shape"):
            with self.subTest(case=case):
                result, _ = self.run_smoke(case)
                self.assertEqual(result.returncode, 1)
                self.assertIn("FAIL", result.stderr)

    def test_server_failure_reports_request_id_not_message(self):
        result, _ = self.run_smoke("server_error")
        self.assertEqual(result.returncode, 1)
        self.assertIn("test-request", result.stderr)
        self.assertNotIn("private-error-content", result.stdout + result.stderr)

    def test_transport_failure_is_not_retried_or_hidden(self):
        result, calls = self.run_smoke("transport")
        self.assertEqual(result.returncode, 1)
        self.assertIn("transport error", result.stderr)
        self.assertEqual(len(calls), 5)

    def test_invalid_origins_are_rejected_before_network(self):
        for url in ("http://example.test/api/v1", "https://example.test/wrong",
                    "https://user:password@example.test/api/v1",
                    "https://example.test/api/v1?query=secret"):
            with self.subTest(url=url):
                result, calls = self.run_smoke(url=url)
                self.assertEqual(result.returncode, 64)
                self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
