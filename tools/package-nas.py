"""Pacchetto Container Manager costruito esclusivamente dal checkout NAS."""
import argparse
from pathlib import Path
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = {"assets", "calendars", "documents", "documenti", "assemblea",
               "peg", "area-riservata", "config", "server"}
FILES = {"404.html", "index.html", "manifest.webmanifest", ".dockerignore",
         "deploy/synology/Dockerfile", "deploy/synology/nginx.conf", "tools/build-site.cjs"}


def create_package(output):
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip()
    if branch != "NAS":
        raise ValueError("Il pacchetto deve essere creato dal branch NAS.")
    names = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
    ).decode().split("\0")
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name in sorted(set(names) - {""}):
            file = ROOT / name
            safe = name == ".dockerignore" or not any(
                part.startswith(".") or part in {"data", "__pycache__", "node_modules"} or
                ".sqlite" in part or part in {"admin-password.txt", "tunnel-token.txt", "nas.env"}
                for part in Path(name).parts
            )
            if safe and (name in FILES or name.split("/")[0] in DIRECTORIES) and file.is_file() and not file.is_symlink():
                archive.write(file, "canicattini1/site/" + name)
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        compose = (ROOT / "deploy/synology/container-manager.yaml").read_text()
        archive.writestr("canicattini1/docker-compose.yml",
                        compose.replace("${NAS_RELEASE_REVISION:-manual}", revision))
        archive.write(ROOT / "deploy/synology/container-manager.env.example", "canicattini1/.env")
        archive.write(ROOT / "docs/synology.md", "canicattini1/ISTRUZIONI.md")
        archive.write(ROOT / "docs/ottimizzazione-synology.md", "canicattini1/DETTAGLI.md")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    print(create_package(parser.parse_args().output))
