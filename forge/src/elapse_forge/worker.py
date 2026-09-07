import argparse
import time

from .config import Settings
from .jobs import Conflict, JobStore
from .pipeline import run_job


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    store = JobStore(settings.database_url)
    store.initialize()
    while True:
        row = store.claim()
        if row:
            try:
                run_job(store, settings, row)
            except Conflict:
                # Another worker owns recovery; never overwrite its attempt.
                pass
        if args.once:
            break
        if not row:
            time.sleep(2)


if __name__ == "__main__":
    main()
