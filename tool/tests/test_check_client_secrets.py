"""Verify that missing inputs cannot silently pass the release secret gate."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "check_client_secrets.sh"


class SecretScanTests(unittest.TestCase):
    def run_scan(self, mode="clean"):
        with tempfile.TemporaryDirectory(prefix="kaaj-secret-test-") as folder:
            root = Path(folder)
            for name in ("tool", "lib", "android", "landing-page", "docs", "bin"):
                (root / name).mkdir()
            (root / "README.md").write_text("Test fixture\n")
            sample = root / "lib" / "sample.dart"
            sample.write_text("void main() {}\n")
            shutil.copyfile(SCRIPT, root / "tool" / SCRIPT.name)
            fake_git = root / "bin" / "git"
            fake_git.write_text(
                "#!/bin/sh\nexit 63\n" if mode == "git_error" else
                "#!/bin/sh\nprintf 'lib/sample.dart\\0'\n"
            )
            fake_git.chmod(0o700)
            if mode == "rg_error":
                fake_rg = root / "bin" / "rg"
                fake_rg.write_text("#!/bin/sh\nexit 2\n")
                fake_rg.chmod(0o700)
            elif mode == "credential":
                sample.write_text("const " + "API_" + "KEY = 'sensitive-fixture';\n")
            env = {
                **os.environ,
                "PATH": str(root / "bin") + os.pathsep + os.environ["PATH"],
                "TMPDIR": folder,
            }
            result = subprocess.run(
                ["bash", str(root / "tool" / SCRIPT.name)], env=env,
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(list(root.glob("kaaj-secret-scan-*")), [])
            return result

    def test_clean_sources_pass(self):
        result = self.run_scan()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_git_failure_blocks_release(self):
        result = self.run_scan("git_error")
        self.assertEqual(result.returncode, 63)
        self.assertNotIn("scan passed", result.stdout)

    def test_read_failure_blocks_release(self):
        result = self.run_scan("rg_error")
        self.assertEqual(result.returncode, 2)
        self.assertNotIn("scan passed", result.stdout)

    def test_credential_reports_path_without_value(self):
        result = self.run_scan("credential")
        self.assertEqual(result.returncode, 1)
        self.assertIn("lib/sample.dart", result.stderr)
        self.assertNotIn("sensitive-fixture", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
