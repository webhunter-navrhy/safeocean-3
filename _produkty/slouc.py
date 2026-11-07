#!/usr/bin/env python3
"""Sloučí _produkty/<skupina>/produkty.json do _data/produkty.json a zkopíruje fotky do img/produkty/.

python3 _produkty/slouc.py [--suchy] [--jen=technika,morske,...]
"""
import json
import shutil
import sys
from pathlib import Path

KOREN = Path(__file__).resolve().parent.parent
ZDROJ = KOREN / "_produkty"
CIL_FOTO = KOREN / "img" / "produkty"
KATEGORIE = {k["slug"] for k in json.loads((KOREN / "_data" / "kategorie.json").read_text())}
PORADI = ["technika", "krmiva-voda", "morske", "sladkovodni", "doplnky", "jezirka", "teraria"]


def dvojice(v):
    """pece/parametry → [[název, hodnota], …] ze slovníku i seznamu."""
    if not v:
        return []
    if isinstance(v, dict):
        return [[str(a), str(b)] for a, b in v.items()]
    out = []
    for r in v:
        if isinstance(r, dict):
            klice = list(r.keys())
            a = r.get("nazev") or r.get("parametr") or r.get("k") or r.get(klice[0])
            b = r.get("hodnota") or r.get("v") or r.get(klice[-1])
            out.append([str(a), str(b)])
        else:
            out.append([str(r[0]), str(r[1])])
    return out


def main(suchy):
    produkty, chyby, fotky = [], [], set()
    jen = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--jen=")), None)
    skupiny = sorted((d for d in ZDROJ.iterdir() if (d / "produkty.json").exists() and (not jen or d.name in jen)),
                     key=lambda d: PORADI.index(d.name) if d.name in PORADI else 99)
    for d in skupiny:
        data = json.loads((d / "produkty.json").read_text())
        if isinstance(data, dict):
            data = data.get("produkty", [])
        for p in data:
            s = p.get("slug", "?")
            if p.get("kat") not in KATEGORIE:
                chyby.append(f"{d.name}/{s}: neznámá kategorie {p.get('kat')!r}")
            p["pece"] = dvojice(p.get("pece"))
            p["parametry"] = dvojice(p.get("parametry"))
            var = []
            for v in p.get("varianty") or []:
                if isinstance(v, dict) and v.get("nazev") and v.get("cena") is not None:
                    var.append({"nazev": str(v["nazev"]), "cena": int(round(float(v["cena"])))})
            p["varianty"] = var
            if p.get("cena") is not None:
                p["cena"] = int(round(float(p["cena"])))
            elif var:
                p["cena"] = min(v["cena"] for v in var)
            else:
                chyby.append(f"{d.name}/{s}: chybí cena")
            foto = p.get("foto") or []
            if isinstance(foto, str):
                foto = [foto]
            nove = []
            for f in foto:
                jmeno = Path(f).name
                src = d / jmeno
                if not src.exists():
                    chyby.append(f"{d.name}/{s}: chybí soubor {jmeno}")
                    continue
                nove.append("produkty/" + jmeno)
                fotky.add((src, jmeno))
            if not nove:
                chyby.append(f"{d.name}/{s}: bez fotky")
            p["foto"] = nove
            if not p.get("foto_typ"):
                p["foto_typ"] = "foto" if p.get("ziva") else "packshot"
            p.pop("cena_zdroj_poznamka", None)
            produkty.append(p)
    sl = [p["slug"] for p in produkty]
    for s in {x for x in sl if sl.count(x) > 1}:
        chyby.append(f"duplicitní slug {s}")
    jmena = [j for _, j in fotky]
    for j in {x for x in jmena if jmena.count(x) > 1}:
        chyby.append(f"duplicitní název fotky {j}")
    pocty = {}
    for p in produkty:
        pocty[p["kat"]] = pocty.get(p["kat"], 0) + 1
    print(f"{len(produkty)} produktů, {len(fotky)} fotek, skupiny: {[d.name for d in skupiny]}")
    print("podle kategorií:", pocty)
    for c in chyby:
        print("CHYBA", c)
    if suchy or chyby:
        return 1 if chyby else 0
    CIL_FOTO.mkdir(parents=True, exist_ok=True)
    for f in CIL_FOTO.iterdir():
        f.unlink()
    for src, jmeno in fotky:
        shutil.copy2(src, CIL_FOTO / jmeno)
    (KOREN / "_data" / "produkty.json").write_text(json.dumps(produkty, ensure_ascii=False, indent=1) + "\n")
    print("zapsáno _data/produkty.json")
    return 0


if __name__ == "__main__":
    sys.exit(main("--suchy" in sys.argv))
