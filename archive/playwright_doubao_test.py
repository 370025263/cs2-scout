#!/usr/bin/env python3
"""E2E test with Playwright + Doubao VLM verification for CS2 Scout platform"""
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8889"
OUT = Path("C:\\Users\\BOSS\\demos")


def vlm_review_screenshot(image_path: str, prompt: str) -> dict:
    """
    Use Doubao VLM via vlm-review agent to analyze a screenshot.
    Returns the VLM's rating and comments.
    """
    from anthropic import Anthropic
    import base64

    client = Anthropic()

    with open(image_path, "rb") as f:
        img_data = base64.b64encode(f.read()).decode()

    message = client.messages.create(
        model="doubao-v3-pro",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": img_data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    text = message.content[0].text

    # Try to parse rating from response
    rating = 5  # default
    try:
        # Look for number between 1-10
        import re
        match = re.search(r'(\d+)/10|rating[^\d]*(\d+)', text, re.IGNORECASE)
        if match:
            rating = int(match.group(1) or match.group(2))
    except:
        pass

    return {"rating": rating, "review": text}


def main():
    print("=" * 70)
    print("Playwright + Doubao VLM Test for CS2 Scout")
    print("=" * 70)

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=False)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        # ──────────────────────────────────────────────────────────
        # Step 1: Load the page
        print("\n[1/5] Loading scout page...")
        page.goto(f"{BASE}/scout.html", wait_until="networkidle")
        page.wait_for_timeout(2000)

        ss_path = OUT / "doubao_step1_loaded.png"
        page.screenshot(path=str(ss_path))
        print(f"  -> Screenshot: {ss_path.name}")

        print("  -> Asking Doubao VLM to review...")
        review1 = vlm_review_screenshot(
            str(ss_path),
            "Is this a CS2 (Counter-Strike 2) radar map interface? "
            "Does it show a de_dust2 map, UI elements like dropdowns and buttons? "
            "Rate the visual quality from 1-10. Be critical about layout and UI elements."
        )
        print(f"  -> VLM Rating: {review1['rating']}/10")
        results.append(("Page Load", review1))

        # ──────────────────────────────────────────────────────────
        # Step 2: Select an opponent
        print("\n[2/5] Selecting opponent...")
        page.wait_for_selector("#opponentSelect option:nth-child(2)", state="attached", timeout=10000)
        page.select_option("#opponentSelect", index=1)
        page.wait_for_timeout(2500)

        ss_path = OUT / "doubao_step2_player_selected.png"
        page.screenshot(path=str(ss_path))
        print(f"  -> Screenshot: {ss_path.name}")

        print("  -> Asking Doubao VLM to review...")
        review2 = vlm_review_screenshot(
            str(ss_path),
            "Now that a player is selected, do you see trails or player movement "
            "rendered on the de_dust2 radar? Is there a timeline at the bottom? "
            "Rate the visual quality and UI clarity from 1-10."
        )
        print(f"  -> VLM Rating: {review2['rating']}/10")
        results.append(("Player Selected", review2))

        # ──────────────────────────────────────────────────────────
        # Step 3: Toggle trails
        print("\n[3/5] Toggling trails...")
        page.click("#trailBtn")
        page.wait_for_timeout(1500)

        ss_path = OUT / "doubao_step3_trails_off.png"
        page.screenshot(path=str(ss_path))

        page.click("#trailBtn")  # turn back on
        page.wait_for_timeout(500)

        print(f"  -> Screenshot: {ss_path.name}")
        print("  -> (Skipping VLM for toggle, moving on)")

        # ──────────────────────────────────────────────────────────
        # Step 4: Scrub timeline
        print("\n[4/5] Scrubbing timeline...")
        slider = page.locator("#tl-slider")
        box = slider.bounding_box()
        if box:
            start_x = box["x"]
            mid_x = box["x"] + box["width"] * 0.6
            mid_y = box["y"] + box["height"] / 2
            page.mouse.move(start_x, mid_y)
            page.mouse.down()
            page.mouse.move(mid_x, mid_y, steps=15)
            page.mouse.up()

        page.wait_for_timeout(2000)

        ss_path = OUT / "doubao_step4_timeline_scrubbed.png"
        page.screenshot(path=str(ss_path))
        print(f"  -> Screenshot: {ss_path.name}")

        print("  -> Asking Doubao VLM to review...")
        review4 = vlm_review_screenshot(
            str(ss_path),
            "Focus on the timeline at the bottom. Does the timeline scrubber "
            "appear to be at ~60% progress? Are there player trails rendered? "
            "Rate 1-10."
        )
        print(f"  -> VLM Rating: {review4['rating']}/10")
        results.append(("Timeline Scrub", review4))

        # ──────────────────────────────────────────────────────────
        # Step 5: Toggle smokes
        print("\n[5/5] Toggling smokes...")
        page.click("#smokeBtn")
        page.wait_for_timeout(1500)

        ss_path = OUT / "doubao_step5_smokes.png"
        page.screenshot(path=str(ss_path))
        print(f"  -> Screenshot: {ss_path.name}")

        print("  -> Asking Doubao VLM to review...")
        review5 = vlm_review_screenshot(
            str(ss_path),
            "Do you see smoke grenades rendered as clouds on the map? "
            "They should be semi-transparent circular areas. Rate 1-10."
        )
        print(f"  -> VLM Rating: {review5['rating']}/10")
        results.append(("Smokes", review5))

        browser.close()

    # ──────────────────────────────────────────────────────────
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    all_ratings = []
    for step, review in results:
        print(f"\n{step}:")
        print(f"  Rating: {review['rating']}/10")
        print(f"  Review: {review['review'][:200]}...")
        all_ratings.append(review["rating"])

    avg_rating = sum(all_ratings) / len(all_ratings)
    print(f"\nAverage Rating: {avg_rating:.1f}/10")

    # Save results
    with open(OUT / "doubao_test_results.json", "w", encoding="utf-8") as f:
        json.dump({"steps": results, "average": avg_rating}, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {OUT / 'doubao_test_results.json'}")
    print("=" * 70)

    return 0 if avg_rating >= 6 else 1


if __name__ == "__main__":
    sys.exit(main())
