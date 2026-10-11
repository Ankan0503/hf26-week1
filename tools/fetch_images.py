"""Download freely licensed test photos from Wikimedia Commons, one folder per brand.

Usage: python3 tools/fetch_images.py OUT_DIR [PER_BRAND]
Writes OUT_DIR/<brand>/<n>.jpg and OUT_DIR/credits.json (title, author, license, url).
The photos are used only for testing and the demo video; they are not committed.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "KiskaKachraEval/1.0 (https://github.com/Ankan0503/hf26-week1)"
HERE = os.path.dirname(os.path.abspath(__file__))


def get(url, tries=3):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))  # rate limited: back off and retry


def search(query, limit=10):
    q = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrsearch": f"{query} filetype:bitmap", "gsrlimit": limit, "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime", "iiurlwidth": 500,  # a standard Wikimedia thumbnail step
    }
    data = json.loads(get(API + "?" + urllib.parse.urlencode(q)))
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    return pages


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def main():
    out = sys.argv[1]
    per = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    labels = json.load(open(os.path.join(HERE, "..", "data", "labels.json")))
    credits = []
    deadline = time.time() + float(os.environ.get("FETCH_BUDGET_S", 300))
    for brand in labels["brands"]:
        if time.time() > deadline:
            print("time budget used up; continuing with what we have", flush=True)
            break
        got, seen = 0, set()
        for q in (f'"{brand}" litter', f'"{brand}" can OR bottle OR packet OR wrapper', f'"{brand}"'):
            if got >= per:
                break
            try:
                pages = search(q)
            except Exception as e:  # network hiccup: skip this query
                print("search failed", q, e)
                continue
            for p in pages:
                if got >= per or p["title"] in seen:
                    continue
                seen.add(p["title"])
                if re.search(r"logo|wordmark|icon|map|graph|chart", p["title"], re.I):
                    continue
                ii = (p.get("imageinfo") or [{}])[0]
                if ii.get("mime") not in ("image/jpeg", "image/png"):
                    continue
                meta = ii.get("extmetadata", {})
                try:
                    blob = get(ii["thumburl"])
                except Exception as e:
                    print("download failed", p["title"], e)
                    continue
                d = os.path.join(out, brand)
                os.makedirs(d, exist_ok=True)
                path = os.path.join(d, f"{got}.jpg")
                open(path, "wb").write(blob)
                credits.append({
                    "brand": brand, "file": os.path.relpath(path, out), "title": p["title"],
                    "author": strip_html(meta.get("Artist", {}).get("value")),
                    "license": strip_html(meta.get("LicenseShortName", {}).get("value")),
                    "url": ii.get("descriptionurl"),
                })
                got += 1
            time.sleep(0.2)
        print(f"{brand}: {got}", flush=True)
    json.dump(credits, open(os.path.join(out, "credits.json"), "w"), indent=1)
    print("total", len(credits))


if __name__ == "__main__":
    main()
