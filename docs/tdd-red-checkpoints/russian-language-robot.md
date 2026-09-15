# Russian Language Robot TDD RED checkpoint

Test-first commit: `a0b459e87fe5a406600d2b0cb4815f6730517187`.
At that commit `tests/test_russian_language_robot.py` imports `scripts.russian_language_robot`, which does not yet exist, so the expected test result is RED (`ModuleNotFoundError`). Implementation follows in later commits; branch CI is the GREEN verification.
