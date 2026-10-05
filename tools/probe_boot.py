import json, sys, time
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8777/web/"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    logs = []
    page.on("pageerror", lambda e: logs.append("PAGEERROR " + str(e)[:300]))
    page.on("console", lambda m: logs.append(m.type + " " + m.text[:300]))
    page.on("requestfailed", lambda r: logs.append("REQFAILED " + r.url[:140] + " " + str(r.failure)))
    t0 = time.time()
    page.goto(url)
    last = ""
    while time.time() - t0 < float(sys.argv[2] if len(sys.argv) > 2 else 120):
        try:
            text = page.evaluate("document.getElementById('bootText').textContent + ' | done=' + document.getElementById('boot').classList.contains('done')")
        except Exception as e:
            text = "EVAL FAILED " + str(e)[:120]
        if text != last:
            print(round(time.time() - t0, 1), text, flush=True); last = text
        if "done=true" in text or "did not start" in text:
            break
        time.sleep(0.5)
    print("\n".join(logs[:30]))
    b.close()
