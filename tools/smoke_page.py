"""Open the served page in headless Chromium, let it live a little and report what happened.

Usage: python tools/smoke_page.py [--url http://127.0.0.1:8777/web/] [--seconds 25] [--shot runs/page.png]
"""

import argparse
import json
import time

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:8777/web/")
parser.add_argument("--seconds", type=float, default=25)
parser.add_argument("--shot", default="runs/page.png")
parser.add_argument("--width", type=int, default=1440)
parser.add_argument("--height", type=int, default=900)
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
    page = browser.new_page(viewport={"width": args.width, "height": args.height})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    started = time.time()
    page.goto(args.url)
    booted = None
    while time.time() - started < 240:
        if page.evaluate("document.getElementById('boot').classList.contains('done')"):
            booted = time.time() - started
            break
        time.sleep(1)
    status = page.text_content("#bootText")
    print(json.dumps({"booted_s": booted, "boot_text": status}))
    if booted is not None:
        time.sleep(args.seconds)
        info = page.evaluate("""() => ({ticks: window.mochi.ticks, latency: window.mochi.latency, t: window.mochi.world.t,
            needs: window.mochi.world.m.needs, action: window.mochi.ACTIONS[window.mochi.world.m.action], mode: document.getElementById('mode').textContent,
            scan: window.mochi.brainView.scan ? window.mochi.brainView.scan.snapshot() : null, facts: document.getElementById('brainFacts').textContent,
            work: document.getElementById('workCaption').textContent})""")
        print(json.dumps(info, indent=1))
    page.screenshot(path=args.shot)
    print(json.dumps({"errors": errors[:8]}))
    browser.close()
