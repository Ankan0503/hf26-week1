"""Download freely licensed test photos, one folder per brand.

Sources: Wikimedia Commons (search by brand name), then Open Food Facts product
front photos (CC BY-SA, brand verified from the product's `brands` field) for
brands that Commons didn't cover.

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


OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"


def off_products(brand, limit=20):
    q = {"search_terms": brand, "json": 1, "page_size": limit,
         "fields": "code,product_name,brands,image_front_url"}
    data = json.loads(get(OFF_SEARCH + "?" + urllib.parse.urlencode(q)))
    key = re.sub(r"[^a-z0-9]", "", brand.lower())
    for p in data.get("products", []):
        brands = [re.sub(r"[^a-z0-9]", "", b.lower()) for b in (p.get("brands") or "").split(",")]
        if p.get("image_front_url") and key in brands:
            yield p


def strip_html(s):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()
    half = len(t) // 2
    if len(t) % 2 == 0 and t[:half] == t[half:]:  # "NameName" from nested spans
        t = t[:half]
    if len(t) % 2 == 1 and t[:half] == t[half + 1:]:  # "Name Name"
        t = t[:half]
    return t


DEMO_ONLY = ["Snickers"]


def fetch_brand(brand, per, out, folder, credits, deadline, demo=False):
    got, seen = 0, set()
    for q in (f'"{brand}" litter', f'"{brand}" can OR bottle OR packet OR wrapper', f'"{brand}"'):
        if got >= per:
            break
        try:
            pages = search(q)
        except Exception as e:  # network hiccup: skip this query
            print("search failed", q, e, flush=True)
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
                print("download failed", p["title"], e, flush=True)
                continue
            d = os.path.join(out, folder)
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, f"{got}.jpg")
            open(path, "wb").write(blob)
            credits.append({
                "brand": brand, "file": os.path.relpath(path, out), "title": p["title"], "source": "commons", "demo": demo,
                "author": strip_html(meta.get("Artist", {}).get("value")),
                "license": strip_html(meta.get("LicenseShortName", {}).get("value")),
                "url": ii.get("descriptionurl"),
            })
            got += 1
        time.sleep(0.2)
    if got < per and time.time() < deadline:
        try:
            for p in off_products(brand):
                if got >= per:
                    break
                try:
                    blob = get(p["image_front_url"])
                except Exception as e:
                    print("download failed", p["code"], e, flush=True)
                    continue
                d = os.path.join(out, folder)
                os.makedirs(d, exist_ok=True)
                path = os.path.join(d, f"{got}.jpg")
                open(path, "wb").write(blob)
                credits.append({
                    "brand": brand, "file": os.path.relpath(path, out), "source": "off", "demo": demo,
                    "title": p.get("product_name") or p["code"],
                    "author": "Open Food Facts contributors", "license": "CC BY-SA 3.0",
                    "url": f"https://world.openfoodfacts.org/product/{p['code']}",
                })
                got += 1
        except Exception as e:
            print("off search failed", brand, e, flush=True)
        time.sleep(6)  # Open Food Facts allows ~10 searches/minute
    print(f"{brand}: {got}", flush=True)


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
        fetch_brand(brand, per, out, brand, credits, deadline)
    # Brands deliberately NOT in labels.json: the demo uses them to show teaching the AI a new brand.
    for brand in DEMO_ONLY:
        fetch_brand(brand, 2, out, os.path.join("_demo", brand), credits, time.time() + 120, demo=True)
    json.dump(credits, open(os.path.join(out, "credits.json"), "w"), indent=1)
    print("total", len(credits))


if __name__ == "__main__":
    main()
