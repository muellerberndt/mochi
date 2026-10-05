"""The page's promise, tried on the really served page in headless Chromium.

Clauses: the brain starts, decisions flow, the brain view draws the settling steps, the bowl
can be filled, a word can be said and a move shown (a lesson is counted), praise lands, the life
saves by itself and by hand, and a reload wakes the same pet. No JavaScript error is allowed.

Usage: python tools/check_page.py [--url http://127.0.0.1:8777/web/] [--expect-raised]
Prints a JSON receipt and exits nonzero when a clause fails. Needs `pip install playwright`
and `playwright install chromium`.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:8777/web/")
parser.add_argument("--expect-raised", action="store_true", help="the default pack must hold a raised brain")
parser.add_argument("--shot", default="")
args = parser.parse_args()

receipt: dict = {"schema": "mochi-page-check/1", "url": args.url, "clauses": {}, "errors": []}
passed = True


def clause(name: str, ok: bool, detail=None) -> None:
    global passed
    receipt["clauses"][name] = {"ok": bool(ok), "detail": detail}
    passed = passed and bool(ok)
    print(("PASS " if ok else "FAIL ") + name, "" if detail is None else detail, flush=True)


def wait(page, expression: str, seconds: float) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if page.evaluate(expression):
            return True
        time.sleep(0.4)
    return False


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    started = time.time()
    page.goto(args.url)
    booted = wait(page, "document.getElementById('boot').classList.contains('done')", 180)
    clause("brain_starts", booted, {"seconds": round(time.time() - started, 1), "status": page.text_content("#bootText")})
    if booted:
        about = page.evaluate("document.getElementById('about').textContent")
        clause("pack_named", "Brain pack" in about and "Cadence" in about, about[:120])
        if args.expect_raised:
            raised = page.evaluate("fetch('brains/index.json').then(r => r.json()).then(i => !i.packs.find(p => p.id === i.default).raised.untrained)")
            clause("raised_brain", raised)

        first = page.evaluate("window.mochi.ticks")
        time.sleep(8)
        later = page.evaluate("window.mochi.ticks")
        clause("decisions_flow", later - first >= 20, {"in_8_s": later - first, "latency_ms": round(page.evaluate("window.mochi.latency"), 1)})

        steps = page.evaluate("window.mochi.brainView.scan ? window.mochi.brainView.scan.stepCount : -1")
        time.sleep(4)
        more = page.evaluate("window.mochi.brainView.scan ? window.mochi.brainView.scan.stepCount : -1")
        clause("brain_view_draws_settling", more > steps >= 0, {"steps": more - steps, "mode": page.text_content("#mode")})

        box = page.evaluate("(() => { const r = document.getElementById('room').getBoundingClientRect(); const b = window.mochi.world.furniture.bowl; return [r.left + b.x / 960 * r.width, r.top + b.y / 600 * r.height]; })()")
        page.evaluate("window.mochi.world.furniture.bowl.food = 0.5")
        page.mouse.move(box[0], box[1]); page.mouse.down(); page.mouse.up()
        clause("bowl_fills", wait(page, "window.mochi.world.furniture.bowl.food > 2.5", 5))

        lessons = page.evaluate("window.mochi.page.lessons")
        page.click("#word0 button")
        clause("word_is_heard", wait(page, "Object.keys(window.mochi.world.sounds).includes('word1')", 3))
        show = page.locator("#shows button").first
        box = show.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down(); time.sleep(1.2); page.mouse.up()
        clause("showing_is_a_lesson", wait(page, f"window.mochi.page.lessons > {lessons}", 6),
               {"lessons": page.evaluate("window.mochi.page.lessons") - lessons, "pose": page.evaluate("window.mochi.world.m.pose")})
        page.click("#good")
        clause("praise_lands", wait(page, "window.mochi.world.m.touch.stroke > 0.05 || window.mochi.arousal.level > 0.2", 3))

        page.fill("#name", "Pixel")
        decisions = page.evaluate("window.mochi.page.decisions")
        page.evaluate("document.getElementById('saved').textContent = 'pending'")
        page.click("#save")
        clause("saves", wait(page, "document.getElementById('saved').textContent.startsWith('saved')", 30), page.text_content("#saved"))
        page.reload()
        again = wait(page, "document.getElementById('boot').classList.contains('done')", 180)
        resumed = again and page.evaluate("window.mochi.page.name === 'Pixel' && window.mochi.page.decisions >= %d" % decisions)
        clause("reload_wakes_the_same_pet", resumed, {"name": page.evaluate("window.mochi.page.name") if again else None,
                                                      "diary": page.evaluate("window.mochi.page.diary[0] && window.mochi.page.diary[0].text") if again else None})
        if args.shot:
            time.sleep(3)
            page.screenshot(path=args.shot)
    clause("no_js_errors", not errors, errors[:3])
    receipt["errors"] = errors[:10]
    browser.close()

print(json.dumps(receipt))
sys.exit(0 if passed else 1)
