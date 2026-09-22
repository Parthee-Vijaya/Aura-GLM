"""Kontrollér de faktiske filer, som brugeren henter, frem for kun generatoren."""
import hashlib
import json
import re
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "site/dist"


class DownloadPackages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((PUBLIC / "catalog.json").read_text())

    def test_packages_match_preview_and_source(self):
        rules = (ROOT / "profiles/grundregler.md").read_bytes()
        for tool in self.catalog["tools"]:
            with self.subTest(tool=tool["id"]), ZipFile(PUBLIC / tool["archive"]) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), {tool["file"], ".gitignore", "LAES-MIG.md", "manifest.json"})
                self.assertEqual(archive.read(tool["file"]), rules)
                for file in tool["files"]:
                    self.assertEqual(archive.read(file["name"]), file["content"].encode())
                    self.assertEqual((PUBLIC / file["url"]).read_bytes(), archive.read(file["name"]))
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["version"], self.catalog["version"])
                self.assertEqual(manifest["tool"], tool["id"])
                for name, digest in manifest["files"].items():
                    self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), digest)

    def test_guides_prevent_accidental_overwrite_and_false_assurance(self):
        for tool in self.catalog["tools"]:
            with self.subTest(tool=tool["id"]), ZipFile(PUBLIC / tool["archive"]) as archive:
                guide = archive.read("LAES-MIG.md").decode()
                for required in ["Overskriv ikke", "sammenflette", "Windows", "Mac", "FÆLLES-GRUNDLAG-01", "ikke bevis", tool["source"], tool["file"]]:
                    self.assertIn(required, guide)
                ignored = archive.read(".gitignore").decode()
                self.assertIn(".env\n", ignored)
                self.assertIn("!.env.example", ignored)
                self.assertNotIn("/AGENTS.md", ignored)
                self.assertNotIn("git-ownership", ignored)

    def test_static_links_and_fallback_downloads_exist(self):
        html = (PUBLIC / "index.html").read_text()
        for url in re.findall(r'(?:href|src)="([^"]+)"', html):
            if url.startswith(("https:", "http:", "data:", "#")):
                continue
            self.assertTrue((PUBLIC / url).exists(), url)
        for tool in self.catalog["tools"]:
            self.assertIn(tool["archive"], html)
        self.assertIn('lang="da"', html)


if __name__ == "__main__":
    unittest.main()
