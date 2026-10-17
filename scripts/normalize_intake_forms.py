#!/usr/bin/env python3
"""Make every case-review form a working HTML form before JavaScript runs.

Idempotent. For each <form data-form-integration="pending"> in website/:
- action="/api/case-review" method="post" (native POST works without JS);
- name/phone/message required, email optional, maxlength on every field;
- a real submit button (no aria-disabled);
- hidden language + honeypot fields so the server sees the same contract;
- a status line that does not claim the form is "loading".
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "website"
LIMITS = {"name": 120, "phone": 60, "email": 254, "message": 6000}
STATUS = {
    "en": "Secure online submission. Do not rely on this form for a deadline or other time-sensitive matter; call (818) 213-8798.",
    "ru": "Защищённая онлайн-форма. Не используйте её, если срок может истечь до ответа фирмы; позвоните по номеру (818) 213-8798.",
}
EMAIL_LABEL = {"en": "Email (optional)", "ru": "Электронная почта (необязательно)"}
HONEYPOT = ('<div class="hp-field" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">'
            '<label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>')
FORM_RE = re.compile(r'<form data-form-integration="pending"[^>]*>.*?</form>', re.S)


def fix_form(form: str, lang: str) -> str:
    status_id = "form-status" if 'id="form-status"' in form else "form-integration-note"
    form = re.sub(r'<form data-form-integration="pending"[^>]*>',
                  f'<form data-form-integration="pending" aria-describedby="{status_id}" action="/api/case-review" method="post">',
                  form, count=1)
    for field, limit in LIMITS.items():
        tag = "textarea" if field == "message" else "input"
        pattern = re.compile(rf'<{tag}([^>]*?)name="{field}"([^>]*)>')

        def repl(match, field=field, limit=limit, tag=tag):
            attrs = (match.group(1) + 'name="%s"' % field + match.group(2))
            attrs = re.sub(r'\s+(required|maxlength="\d+")', "", attrs)
            attrs = attrs.rstrip()
            extra = f' maxlength="{limit}"' + ("" if field == "email" else " required")
            return f"<{tag}{attrs}{extra}>"

        form = pattern.sub(repl, form, count=1)
    # Email label marks the field as optional.
    form = re.sub(r'<label>[^<]*(<input[^>]*name="email")', lambda m: f"<label>{EMAIL_LABEL[lang]}{m.group(1)}", form, count=1)
    form = re.sub(r'<button class="btn btn-primary" type="button"[^>]*>',
                  f'<button class="btn btn-primary" type="submit" aria-describedby="{status_id}">', form, count=1)
    form = re.sub(rf'<p class="fine-print" id="{status_id}">.*?</p>',
                  f'<p class="fine-print" id="{status_id}">{STATUS[lang]}</p>', form, count=1, flags=re.S)
    if 'name="language"' not in form:
        form = form.replace("</form>", f'<input type="hidden" name="language" value="{lang}">' + "</form>")
    if 'name="website"' not in form:
        form = form.replace("</form>", HONEYPOT + "</form>")
    return form


def main() -> int:
    changed = 0
    for path in sorted(ROOT.glob("**/*.html")):
        html = path.read_text(encoding="utf-8")
        if 'data-form-integration="pending"' not in html:
            continue
        lang = "ru" if re.search(r'<html[^>]*lang="ru', html) else "en"
        new = FORM_RE.sub(lambda m: fix_form(m.group(0), lang), html)
        if new != html:
            path.write_text(new, encoding="utf-8")
            changed += 1
            print(f"updated {path.relative_to(ROOT)}")
    print(f"{changed} file(s) changed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
