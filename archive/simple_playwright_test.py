#!/usr/bin/env python3
"""Simple Playwright test to capture CS2 Scout screenshots"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8889"
OUT = Path("C:\\Users\\BOSS\\demos")


def main():
    print("Capturing CS2 Scout screenshots...")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Step 1: Load the page
        print("  Loading scout.html...")
        page.goto(f"{BASE}/scout.html", wait_until="networkidle")
        page.wait_for_timeout(3000)  # Give time for scout_data.json to load
        page.screenshot(path=str(OUT / "vlm_check_1_loaded.png"))
        print("  -> vlm_check_1_loaded.png")

        # Step 2: Click first player pill
        print("  Selecting first player...")
        page.wait_for_selector("#players-row .pill", timeout=10000)
        page.click("#players-row .pill:nth-child(1)")
        page.wait_for_timeout(2000)
        page.screenshot(path=str(OUT / "vlm_check_2_player.png"))
        print("  -> vlm_check_2_player.png")

        # Step 3: Toggle some buttons
        print("  Toggling trails...")
        page.click("#trailBtn")
        page.wait_for_timeout(800)
        page.click("#trailBtn")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "vlm_check_3_trails.png"))
        print("  -> vlm_check_3_trails.png")

        # Step 4: Scrub timeline
        print("  Scrubbing timeline...")
        slider = page.locator("#tl-slider")
        box = slider.bounding_box()
        if box:
            mid_x = box["x"] + box["width"] * 0.5
            mid_y = box["y"] + box["height"] / 2
            page.mouse.move(box["x"], mid_y)
            page.mouse.down()
            page.mouse.move(mid_x, mid_y, steps=10)
            page.mouse.up()
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "vlm_check_4_timeline.png"))
        print("  -> vlm_check_4_timeline.png")

        browser.close()

    print("\nDone! Screenshots captured for VLM review.")
    return 0


if __name__ == "__main__":
    main()
