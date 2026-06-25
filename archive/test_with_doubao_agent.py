#!/usr/bin/env python3
"""Playwright E2E test, then use vlm-review agent to verify screenshots"""
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8889"
OUT = Path("C:\\Users\\BOSS\\demos")


def main():
    print("=" * 70)
    print("Playwright Test for CS2 Scout (with Doubao VLM verification)")
    print("=" * 70)

    screenshots = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        # ──────────────────────────────────────────────────────────
        # Step 1: Load page
        print("\n[1/5] Loading scout page...")
        page.goto(f"{BASE}/scout.html", wait_until="networkidle")
        page.wait_for_timeout(2000)

        ss_path = OUT / "agent_step1_loaded.png"
        page.screenshot(path=str(ss_path))
        screenshots.append(("Page Loaded", ss_path))
        print(f"  -> {ss_path.name}")

        # ──────────────────────────────────────────────────────────
        # Step 2: Select opponent
        print("\n[2/5] Selecting opponent...")
        page.wait_for_selector("#opponentSelect option:nth-child(2)", state="attached", timeout=10000)
        page.select_option("#opponentSelect", index=1)
        page.wait_for_timeout(2500)

        ss_path = OUT / "agent_step2_player.png"
        page.screenshot(path=str(ss_path))
        screenshots.append(("Player Selected", ss_path))
        print(f"  -> {ss_path.name}")

        # ──────────────────────────────────────────────────────────
        # Step 3: Toggle trails
        print("\n[3/5] Toggling trails off/on...")
        page.click("#trailBtn")
        page.wait_for_timeout(1000)
        page.click("#trailBtn")
        page.wait_for_timeout(1000)

        ss_path = OUT / "agent_step3_trails.png"
        page.screenshot(path=str(ss_path))
        screenshots.append(("Trails Toggled", ss_path))
        print(f"  -> {ss_path.name}")

        # ──────────────────────────────────────────────────────────
        # Step 4: Scrub timeline
        print("\n[4/5] Scrubbing timeline...")
        slider = page.locator("#tl-slider")
        box = slider.bounding_box()
        if box:
            start_x = box["x"]
            mid_x = box["x"] + box["width"] * 0.7
            mid_y = box["y"] + box["height"] / 2
            page.mouse.move(start_x, mid_y)
            page.mouse.down()
            page.mouse.move(mid_x, mid_y, steps=15)
            page.mouse.up()

        page.wait_for_timeout(2000)

        ss_path = OUT / "agent_step4_timeline.png"
        page.screenshot(path=str(ss_path))
        screenshots.append(("Timeline Scrubbed", ss_path))
        print(f"  -> {ss_path.name}")

        # ──────────────────────────────────────────────────────────
        # Step 5: Toggle smokes
        print("\n[5/5] Toggling smokes...")
        page.click("#smokeBtn")
        page.wait_for_timeout(1500)

        ss_path = OUT / "agent_step5_smokes.png"
        page.screenshot(path=str(ss_path))
        screenshots.append(("Smokes Shown", ss_path))
        print(f"  -> {ss_path.name}")

        browser.close()

    # Save screenshot list for agent
    with open(OUT / "agent_screenshots.json", "w") as f:
        json.dump([{"name": n, "path": str(p)} for n, p in screenshots], f, indent=2)

    print("\n" + "=" * 70)
    print(f"Captured {len(screenshots)} screenshots")
    print("Now launching vlm-review agent to verify them...")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())
