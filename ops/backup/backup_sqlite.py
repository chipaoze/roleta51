#!/usr/bin/env python3
"""Create a consistent SQLite copy before the daily OCI boot volume snapshot."""

import fcntl
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SOURCE = Path('/var/lib/area51/data/area51.sqlite')
DESTINATION = Path('/var/lib/area51/backups/automatic')
KEEP = 3


def main():
    DESTINATION.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(DESTINATION, 0o700)
    with (DESTINATION / '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        target = DESTINATION / f'area51-{stamp}.sqlite'
        temporary = DESTINATION / f'.{target.name}.partial'
        try:
            with sqlite3.connect(f'file:{SOURCE}?mode=ro', uri=True) as source:
                with sqlite3.connect(temporary) as backup:
                    source.backup(backup, pages=1000, sleep=0.05)
            with sqlite3.connect(f'file:{temporary}?mode=ro', uri=True) as check:
                result = check.execute('PRAGMA quick_check').fetchone()[0]
                if result != 'ok':
                    raise RuntimeError(f'SQLite quick_check failed: {result}')
            digest = hashlib.sha256()
            with temporary.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
                os.fsync(stream.fileno())
            os.chmod(temporary, 0o600)
            os.replace(temporary, target)
            manifest = {'created_utc': stamp, 'database': target.name,
                        'size_bytes': target.stat().st_size, 'sha256': digest.hexdigest(),
                        'quick_check': result}
            meta_tmp = DESTINATION / f'.{target.stem}.json.partial'
            meta_tmp.write_text(json.dumps(manifest, indent=2) + '\n')
            os.chmod(meta_tmp, 0o600)
            os.replace(meta_tmp, target.with_suffix('.json'))
            for old in sorted(DESTINATION.glob('area51-*.sqlite'), reverse=True)[KEEP:]:
                old.unlink()
                old.with_suffix('.json').unlink(missing_ok=True)
            print(f'Backup verified: {target.name} ({manifest["size_bytes"]} bytes)')
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
