from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITIES = {
    "agoura-hills": "Agoura Hills",
    "camarillo": "Camarillo",
    "newbury-park": "Newbury Park",
    "oak-park": "Oak Park",
    "simi-valley": "Simi Valley",
    "westlake-village": "Westlake Village",
}
FAQ_MARKER = '<section class="section section-alt" id="faq">'
REQUIRED_LINKS = (
    "/car-accident-lawyer/",
    "/dog-bite-lawyer/",
    "/slip-and-fall-lawyer/",
)


def practice_area_block(city: str) -> str:
    return f'''<section class="section">\n  <div class="wrap">\n    <p class="eyebrow">Practice Areas</p>\n    <h2>Personal injury representation for {city} clients.</h2>\n    <p class="measure">Explore the firm’s primary California personal injury practice areas, or contact Alexey Savostyanov directly to discuss your case.</p>\n    <div class="card-grid">\n      <article class="card"><h3><a href="/car-accident-lawyer/">Car Accidents</a></h3><p>Representation for people injured in California motor vehicle collisions.</p></article>\n      <article class="card"><h3><a href="/dog-bite-lawyer/">Dog Bites</a></h3><p>Representation for people injured in dog attacks and bite incidents.</p></article>\n      <article class="card"><h3><a href="/slip-and-fall-lawyer/">Slip-and-Fall / Premises Liability</a></h3><p>Representation for injuries involving unsafe property conditions.</p></article>\n    </div>\n    <div class="btn-row"><a class="btn btn-primary" href="#contact">Free Case Review</a></div>\n  </div>\n</section>\n\n'''


def main() -> None:
    changed = 0
    for slug, city in CITIES.items():
        path = ROOT / "website" / slug / "index.html"
        html = path.read_text(encoding="utf-8")
        if all(f'href="{href}"' in html for href in REQUIRED_LINKS):
            continue
        if html.count(FAQ_MARKER) != 1:
            raise RuntimeError(f"Expected exactly one FAQ marker in {path}")
        html = html.replace(FAQ_MARKER, practice_area_block(city) + FAQ_MARKER, 1)
        path.write_text(html, encoding="utf-8")
        changed += 1
    print(f"Updated {changed} city page(s).")


if __name__ == "__main__":
    main()
