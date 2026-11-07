#!/usr/bin/env python3
"""Build: _data/*.json + src/*.html (Jinja2) + img/ + static/ -> dist/

  python3 build.py            # sestaví dist/
  python3 build.py --serve    # + lokální server na http://localhost:8765/<base>

Co dělá sám: WebP + srcset 640/1280/1920, lazy u všech fotek kromě první na stránce, ?v=<hash obsahu> u CSS/JS,
noindex a robots.txt podle site.navrh, JSON-LD LocalBusiness ze site.json, og:image 1200x630, sitemap.xml, 404.html,
.nojekyll (+ CNAME u ostrého webu s doménou). Design si nedědí: styl a šablony píšeš ty.
"""
import datetime
import glob
import hashlib
import html
import json
import os
import re
import shutil
import sys

from markupsafe import Markup
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC, DATA, IMG, STATIC, DIST, CACHE = (os.path.join(ROOT, p) for p in ("src", "_data", "img", "static", "dist", ".cache/img"))
SIRKY = (640, 1280, 1920)
RASTER = (".jpg", ".jpeg", ".png", ".webp")


class BuildError(Exception):
    pass


def nacti_data():
    d = {}
    for f in sorted(os.listdir(DATA)):
        if f.endswith(".json"):
            with open(os.path.join(DATA, f), encoding="utf-8") as fh:
                d[f[:-5]] = json.load(fh)
    if "site" not in d:
        raise BuildError("chybí _data/site.json")
    return d


class Obrazky:
    """Převod do WebP + generování <img srcset>. Počítá fotky na stránce: první je eager."""

    def __init__(self, base):
        self.base = base
        self.pocet = 0
        self.info = {}
        os.makedirs(CACHE, exist_ok=True)

    def reset(self):
        self.pocet = 0

    def _zpracuj(self, nazev):
        if nazev in self.info:
            return self.info[nazev]
        zdroj = os.path.join(IMG, nazev)
        if not os.path.exists(zdroj):
            raise BuildError(f"obrázek img/{nazev} neexistuje")
        stem, ext = os.path.splitext(nazev)
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem)
        cil_dir = os.path.join(DIST, "img")
        os.makedirs(cil_dir, exist_ok=True)
        if ext.lower() not in RASTER:   # svg a ostatní se kopírují beze změny
            shutil.copy(zdroj, os.path.join(cil_dir, os.path.basename(nazev)))
            self.info[nazev] = {"raster": False, "src": f"img/{os.path.basename(nazev)}"}
            return self.info[nazev]
        h = hashlib.sha1(open(zdroj, "rb").read()).hexdigest()[:12]
        im = ImageOps.exif_transpose(Image.open(zdroj))
        im.load()
        w0, h0 = im.size
        sirky = sorted({w for w in SIRKY if w < w0} | {min(w0, SIRKY[-1])})
        varianty = []
        for w in sirky:
            vyska = round(h0 * w / w0)
            cache = os.path.join(CACHE, f"{h}-{w}.webp")
            if not os.path.exists(cache):
                r = im.resize((w, vyska), Image.LANCZOS) if w != w0 else im
                if r.mode not in ("RGB", "RGBA"):
                    r = r.convert("RGBA" if "A" in r.getbands() else "RGB")
                r.save(cache, "WEBP", quality=80, method=6)
            out = f"{stem}-{w}.webp"
            shutil.copy(cache, os.path.join(cil_dir, out))
            varianty.append((w, vyska, f"img/{out}"))
        self.info[nazev] = {"raster": True, "varianty": varianty}
        return self.info[nazev]

    def img(self, nazev, alt=None, sizes="100vw", cls="", eager=None, styl=""):
        if alt is None:
            raise BuildError(f"img('{nazev}'): chybí alt (pro dekorativní fotku alt='')")
        self.pocet += 1
        prvni = (self.pocet == 1) if eager is None else eager
        i = self._zpracuj(nazev)
        a = f' alt="{html.escape(alt, quote=True)}"'
        c = f' class="{cls}"' if cls else ""
        s = f' style="{styl}"' if styl else ""
        if not i["raster"]:
            return Markup(f'<img src="{self.base}{i["src"]}"{a}{c}{s} loading="{"eager" if prvni else "lazy"}" decoding="async">')
        w, h, nejv = i["varianty"][-1][0], i["varianty"][-1][1], i["varianty"][-1][2]
        srcset = ", ".join(f"{self.base}{p} {w_}w" for w_, _, p in i["varianty"])
        nacitani = 'loading="eager" fetchpriority="high"' if prvni else 'loading="lazy"'
        return Markup(f'<img src="{self.base}{nejv}" srcset="{srcset}" sizes="{sizes}" width="{w}" height="{h}"{a}{c}{s} '
                      f'{nacitani} decoding="async">')

    def img_url(self, nazev, w=1280):
        i = self._zpracuj(nazev)
        if not i["raster"]:
            return self.base + i["src"]
        best = min(i["varianty"], key=lambda v: abs(v[0] - w))
        return self.base + best[2]

    def og(self, nazev):
        zdroj = os.path.join(IMG, nazev)
        if not os.path.exists(zdroj):
            return None
        im = ImageOps.fit(ImageOps.exif_transpose(Image.open(zdroj)).convert("RGB"), (1200, 630), Image.LANCZOS)
        im.save(os.path.join(DIST, "og.jpg"), quality=84, optimize=True)
        return "og.jpg"


def hash_souboru(cesta):
    return hashlib.sha1(open(cesta, "rb").read()).hexdigest()[:10]


def jsonld(site):
    k = site.get("kontakt", {})
    a = k.get("adresa", {})
    j = {"@context": "https://schema.org", "@type": site.get("typ") or "LocalBusiness", "name": site["nazev"],
         "url": site["url"], "description": site.get("popis", "")}
    if k.get("telefon"): j["telephone"] = k["telefon"]
    if k.get("email"): j["email"] = k["email"]
    if any(a.get(x) for x in ("ulice", "psc", "mesto")):
        adr = {"@type": "PostalAddress", "streetAddress": a.get("ulice"), "postalCode": a.get("psc"),
               "addressLocality": a.get("mesto"), "addressCountry": a.get("zeme") or "CZ"}
        j["address"] = {k: v for k, v in adr.items() if v}
    if site.get("oteviraci_doba"): j["openingHours"] = site["oteviraci_doba"]
    if site.get("sameas"): j["sameAs"] = site["sameas"]
    if site.get("cenove_rozpeti"): j["priceRange"] = site["cenove_rozpeti"]
    if site.get("ico"): j["taxID"] = site["ico"]
    if site.get("logo"): j["logo"] = site["url"] + site["logo"]
    j["image"] = site["url"] + "og.jpg"
    return json.dumps(j, ensure_ascii=False).replace("</", "<\\/")


def main():
    data = nacti_data()
    for p in data.get("produkty", []):
        for k, v in (("znacka", ""), ("latin", ""), ("podkat", ""), ("varianty", []), ("parametry", []), ("pece", []),
                     ("foto", []), ("foto_typ", "packshot"), ("foto_autor", ""), ("foto_licence", ""), ("foto_zdroj", ""),
                     ("ziva", False), ("mrazene", False), ("stitek", ""), ("kratky_popis", ""), ("popis", "")):
            p.setdefault(k, v)
    for k in data.get("kategorie", []):
        for kl, v in (("kratce", ""), ("foto", ""), ("foto_typ", "foto"), ("alt", "")):
            k.setdefault(kl, v)
    svety = data.get("svety", [])
    svet_podle = {s["slug"]: s for s in svety}
    for s in svety:
        if s.get("foto") and not os.path.exists(os.path.join(IMG, s["foto"])):
            print(f"VAROVÁNÍ: chybí fotka světa {s['slug']}: img/{s['foto']}")
            s["foto"] = ""
        s["kategorie"], s["produkty"] = [], []
    kredity = {}
    for fj in glob.glob(os.path.join(ROOT, "_produkty", "*", "svet_foto.json")):
        try:
            k = json.load(open(fj, encoding="utf-8"))
            kredity[k.get("soubor", "")] = k
        except (ValueError, OSError):
            print(f"VAROVÁNÍ: nečitelný {fj}")
    for s in svety:
        s["kredit"] = kredity.get(s.get("foto"), {})
    kat_podle = {k["slug"]: k for k in data.get("kategorie", [])}
    for k in data.get("kategorie", []):
        if k["svet"] not in svet_podle:
            raise BuildError(f"kategorie {k['slug']}: neznámý svět {k['svet']}")
        k["svet_obj"] = svet_podle[k["svet"]]
        k["produkty"] = [p for p in data.get("produkty", []) if p["kat"] == k["slug"]]
        svet_podle[k["svet"]]["kategorie"].append(k)
    for k in data.get("kategorie", []):
        svet_podle[k["svet"]]["produkty"].extend(k["produkty"])
    vyprodej = {a: b for a, b in data.get("vyprodej", {}).items() if not a.startswith("_")}
    for p in data.get("produkty", []):
        if p["kat"] not in kat_podle:
            raise BuildError(f"produkt {p['slug']}: neznámá kategorie {p['kat']}")
        p["kategorie"] = kat_podle[p["kat"]]
        p["svet"] = p["kategorie"]["svet_obj"]
        p["varianty"].sort(key=lambda v: v["cena"])
        p["_cena0"] = p["varianty"][0]["cena"] if p["varianty"] else p["cena"]
        p["cena_puvodni"] = vyprodej.get(p["slug"], 0)
        if p["cena_puvodni"]:
            p["stitek"] = "Výprodej"
    data["vyprodej"] = [p for p in data.get("produkty", []) if p["cena_puvodni"]]
    znacky = {}
    for p in data.get("produkty", []):
        if p["znacka"]:
            znacky.setdefault(p["znacka"], []).append(p)
    data["znacky"] = sorted(znacky.items(), key=lambda x: x[0].lower())

    def prolozit(kats, n=8):
        """Výběr: kategorie se střídají v pořadí z dat."""
        fronty = [list(k["produkty"]) for k in kats]
        out = []
        while len(out) < n and any(fronty):
            for f in fronty:
                if f and len(out) < n:
                    out.append(f.pop(0))
        return out
    for s in svety:
        s["vyber"] = prolozit(s["kategorie"])
    site = data["site"]
    base = site.get("base", "/")
    if not base.startswith("/") or not base.endswith("/"):
        raise BuildError("site.base musí začínat a končit lomítkem (např. /slug/ nebo /)")
    if not site["url"].endswith("/"):
        site["url"] += "/"
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)
    obr = Obrazky(base)

    # statické soubory + hash obsahu pro cache busting
    shutil.copytree(STATIC, DIST, dirs_exist_ok=True)
    hashe = {}

    def asset(p):
        cil = os.path.join(DIST, p)
        if not os.path.exists(cil):
            raise BuildError(f"asset {p} neexistuje (static/{p})")
        if p not in hashe:
            hashe[p] = hash_souboru(cil)
        return f"{base}{p}?v={hashe[p]}"

    og = obr.og(site["og_image"]) if site.get("og_image") else None
    if not og:
        print("VAROVÁNÍ: chybí og_image (site.og_image -> soubor v img/)")
    og_url = site["url"] + og if og else None

    def url(cesta):
        cesta = cesta.strip("/")
        return base + (cesta + "/" if cesta else "")

    env = Environment(loader=FileSystemLoader(SRC), autoescape=select_autoescape(["html"]), undefined=StrictUndefined)
    def kc(n):
        return Markup(f"{int(n):,}".replace(",", "\u00a0") + "\u00a0Kč")

    def cz(t):
        t = re.sub(r"(?<=[\s(„])([vVkKsSzZoOuUaAiI])\s+", lambda m: m.group(1) + "\u00a0", str(t))
        t = re.sub(r"(\d) (?=(l|cm|kg|ks|Kč|m|°C|W)\b)", "\\1\u00a0", t)
        return t

    def slugify(t):
        import unicodedata
        t = unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode().lower()
        return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

    env.filters.update(kc=kc, cz=cz, slug=slugify)
    env.globals.update(site=site, data=data, base=base, asset=asset, url=url, img=obr.img, img_url=obr.img_url,
                       og_url=og_url, jsonld=jsonld(site), tel=site.get("kontakt", {}).get("telefon", "").replace(" ", ""), titulek="", popis="", cesta="", noindex=False)
    stranky = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".html") or f.startswith("_"):
            continue
        jmeno = f[:-5]
        obr.reset()
        tpl = env.get_template(f)
        kod = tpl.render()
        if jmeno == "404":
            vystup = os.path.join(DIST, "404.html")
        elif jmeno == "index":
            vystup = os.path.join(DIST, "index.html")
            stranky.append("")
        else:
            os.makedirs(os.path.join(DIST, jmeno), exist_ok=True)
            vystup = os.path.join(DIST, jmeno, "index.html")
            stranky.append(jmeno + "/")
        with open(vystup, "w", encoding="utf-8") as fh:
            fh.write(kod)

    # stránky e-shopu: src/eshop/<jmeno>.html -> eshop/<jmeno>/
    if os.path.isdir(os.path.join(SRC, "eshop")):
        for f in sorted(os.listdir(os.path.join(SRC, "eshop"))):
            if not f.endswith(".html") or f.startswith("_"):
                continue
            jmeno = f[:-5]
            obr.reset()
            kod = env.get_template("eshop/" + f).render()
            rel = "eshop/" if jmeno == "index" else f"eshop/{jmeno}/"
            os.makedirs(os.path.join(DIST, rel), exist_ok=True)
            with open(os.path.join(DIST, rel, "index.html"), "w", encoding="utf-8") as fh:
                fh.write(kod)
            stranky.append(rel)

    # generované detaily: realizace a produkty
    for sablona, polozky, cesta_fn, klic in (
            ("_realizace.html", data.get("realizace", []), lambda x: f"realizace/{x['slug']}/", "r"),
            ("_svet.html", svety, lambda x: f"eshop/{x['slug']}/", "s"),
            ("_kategorie.html", data.get("kategorie", []), lambda x: f"eshop/{x['svet']}/{x['slug']}/", "k"),
            ("_produkt.html", data.get("produkty", []), lambda x: f"eshop/produkt/{x['slug']}/", "p")):
        if not os.path.exists(os.path.join(SRC, sablona)):
            continue
        tpl = env.get_template(sablona)
        for i, pol in enumerate(polozky):
            obr.reset()
            kod = tpl.render(**{klic: pol, "index": i})
            rel = cesta_fn(pol)
            os.makedirs(os.path.join(DIST, rel), exist_ok=True)
            with open(os.path.join(DIST, rel, "index.html"), "w", encoding="utf-8") as fh:
                fh.write(kod)
            stranky.append(rel)

    # robots, sitemap, CNAME
    navrh = bool(site.get("navrh"))
    with open(os.path.join(DIST, "robots.txt"), "w") as fh:
        if navrh:
            fh.write("User-agent: *\nDisallow: /\n")
        else:
            fh.write(f"User-agent: *\nAllow: /\n\nSitemap: {site['url']}sitemap.xml\n")
    dnes = datetime.date.today().isoformat()
    with open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for s in stranky:
            fh.write(f"  <url><loc>{site['url']}{s}</loc><lastmod>{dnes}</lastmod></url>\n")
        fh.write("</urlset>\n")
    open(os.path.join(DIST, ".nojekyll"), "w").close()
    if site.get("domena") and not navrh:
        open(os.path.join(DIST, "CNAME"), "w").write(site["domena"] + "\n")

    print(f"OK: {len(stranky)} stránek, {len(obr.info)} obrázků -> dist/ ({'NÁVRH, noindex' if navrh else 'OSTRÝ WEB, indexovatelný'})")


if __name__ == "__main__":
    try:
        main()
    except BuildError as e:
        sys.exit(f"CHYBA buildu: {e}")
    if "--serve" in sys.argv:
        import functools, http.server, socketserver
        os.chdir(DIST)
        print("http://localhost:8765" + json.load(open(os.path.join(DATA, "site.json")))["base"] + "  (Ctrl+C = konec; base řeš prefixem)")
        socketserver.TCPServer.allow_reuse_address = True
        socketserver.TCPServer(("", 8765), http.server.SimpleHTTPRequestHandler).serve_forever()
