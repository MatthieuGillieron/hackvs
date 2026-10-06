"""CLI du moteur FlexRadar.

    python3 -m engine build            # tout le pipeline : export -> emails -> fiches d'appel
    python3 -m engine export           # alertes, candidats, clients, missions, sources -> frontend/public/data/
    python3 -m engine geo              # fond de carte + vignettes de district (une fois, versionné)

Les étapes LLM (emails, fiches d'appel) lisent leur cache versionné (data/llm/, frontend/public/data/) : sans clé
OpenAI, seules les fiches nouvelles restent sans texte rédigé. Extraction : `python3 -m engine.llm.extract`.
"""
from __future__ import annotations

import argparse


def main() -> None:
    ap = argparse.ArgumentParser(prog="python3 -m engine", description="Moteur de signaux FlexRadar")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="export + emails + fiches d'appel")
    b.add_argument("--force", action="store_true", help="re-rédige les textes LLM même s'ils sont en cache")
    sub.add_parser("export", help="export des données du front")
    sub.add_parser("geo", help="fond de carte du Valais")
    a = ap.parse_args()

    if a.cmd == "geo":
        from . import geo
        geo.main()
        return
    from . import export
    export.main()
    if a.cmd == "build":
        from .llm import calls, emails
        emails.main(force=a.force)
        calls.main(force=a.force)


if __name__ == "__main__":
    main()
