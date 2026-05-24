#!/usr/bin/env python3
"""Interactive manual test checklist — run before every release."""

import sys

CHECKS = [
    ("Startup", [
        "Dashboard starts without Terminal errors",
        "Loads in browser within 3 seconds",
    ]),
    ("Top Bar", [
        "All 7 nav tabs visible and clickable",
        "Currency dropdown shows GBP / USD / EUR",
        "Switching currency updates all costs instantly",
        "Cmd+B blur toggle works",
    ]),
    ("Overview Tab", [
        "Total cost shows in selected currency",
        "Session and turn counts look correct",
        "Charts load without errors",
    ]),
    ("Prompts Tab", [
        "Prompts list loads",
        "Sort by tokens works",
        "Sort by recent works",
    ]),
    ("Sessions Tab", [
        "Sessions list loads",
        "Clicking a session shows its turns",
    ]),
    ("Projects Tab", [
        "Projects show real names (not raw slugs)",
        "Cowork sessions show human-readable titles",
        "First prompt visible as subtitle",
    ]),
    ("Skills & Tips", [
        "Skills tab loads",
        "Tips tab loads and dismiss works",
    ]),
    ("Settings", [
        "Plan selector saves correctly",
    ]),
]

def run():
    passed = 0
    failed = 0
    skipped = 0

    print("\n" + "=" * 56)
    print("  Ultimate Token Dashboard — Manual Test Checklist")
    print("=" * 56)
    print("  y = pass   n = fail   s = skip\n")

    results = []

    for section, items in CHECKS:
        print(f"\n── {section} " + "─" * (50 - len(section)))
        for item in items:
            while True:
                answer = input(f"  {item}\n  > ").strip().lower()
                if answer in ("y", "n", "s"):
                    break
                print("  Please enter y, n, or s")
            if answer == "y":
                passed += 1
                results.append(("PASS", section, item))
            elif answer == "n":
                failed += 1
                results.append(("FAIL", section, item))
                note = input("  Note (optional): ").strip()
                if note:
                    results.append(("NOTE", section, note))
            else:
                skipped += 1
                results.append(("SKIP", section, item))

    total = passed + failed + skipped
    print("\n" + "=" * 56)
    print(f"  Results: {passed} passed  {failed} failed  {skipped} skipped")
    print("=" * 56)

    if failed > 0:
        print("\n  Failed items:")
        for status, section, item in results:
            if status == "FAIL":
                print(f"  ✗  [{section}] {item}")
        print("\n  Fix all failures before releasing.\n")
        sys.exit(1)
    else:
        print("\n  All checks passed. Safe to release.\n")
        sys.exit(0)

if __name__ == "__main__":
    run()
