"""E2E test for CS2 Scout platform at http://localhost:8889/scout.html"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8889"
OUT = "C:\\Users\\BOSS\\demos"

def main():
    with sync_playwright() as p:
        # Launch headless Chromium using the system Chrome
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        print("[1/5] Loading scout page...")
        page.goto(f"{BASE}/scout.html", wait_until="networkidle")
        # Wait for scout_data.json to load and populate the opponent dropdown
        # Options inside <select> may be hidden to Playwright, so use attached state
        page.wait_for_selector("#opponentSelect option:nth-child(2)", state="attached", timeout=15000)
        # Extra wait for canvas to render the radar
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}\\e2e_step1_loaded.png")
        print("  -> Screenshot: e2e_step1_loaded.png")

        print("[2/5] Selecting first opponent...")
        # Select the first actual opponent (skip "-- select --")
        page.select_option("#opponentSelect", index=1)
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{OUT}\\e2e_step2_player_selected.png")
        print("  -> Screenshot: e2e_step2_player_selected.png")

        print("[3/5] Toggling Trails off, then on...")
        # Click Trails button to toggle it off
        page.click("#trailBtn")
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}\\e2e_step3_trails_toggled.png")
        print("  -> Screenshot: e2e_step3_trails_toggled.png")
        # Toggle trails back on for subsequent steps
        page.click("#trailBtn")
        page.wait_for_timeout(500)

        print("[4/5] Scrubbing timeline to 50%...")
        # Drag the timeline slider to 50%
        slider = page.locator("#tl-slider")
        # Get the slider's bounding box
        box = slider.bounding_box()
        if box:
            # Move to left edge, then drag to 50% of width
            start_x = box["x"]
            mid_x = box["x"] + box["width"] * 0.5
            mid_y = box["y"] + box["height"] / 2
            page.mouse.move(start_x, mid_y)
            page.mouse.down()
            page.mouse.move(mid_x, mid_y, steps=10)
            page.mouse.up()
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}\\e2e_step4_timeline_scrubbed.png")
        print("  -> Screenshot: e2e_step4_timeline_scrubbed.png")

        print("[5/5] Toggling Smokes...")
        # Click Smokes button (toggle off then on to ensure visual change)
        page.click("#smokeBtn")
        page.wait_for_timeout(1500)
        page.click("#smokeBtn")
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}\\e2e_step5_smokes.png")
        print("  -> Screenshot: e2e_step5_smokes.png")

        browser.close()
        print("E2E complete")

if __name__ == "__main__":
    main()
