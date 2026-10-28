"""Gemeinsame Test-Einstellungen: alles in temporären Ordnern, nichts auf dem echten Mac."""
import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="tp-test-"))
os.environ.setdefault("TP_LOKAL_DIR", str(_TMP / "lokal"))
os.environ.setdefault("TP_DATEN_DIR", str(_TMP / "daten"))
os.environ.setdefault("TP_KEINE_AUTOMATIK", "1")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "TurnierPro"))
