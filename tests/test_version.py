from importlib.metadata import version

from mojiang_chaogu import __version__
from mojiang_chaogu.web import create_app


def test_version_has_one_canonical_source() -> None:
    assert __version__ == "1.5.0"
    assert version("mojiang-chaogu") == __version__
    assert create_app().version == __version__
