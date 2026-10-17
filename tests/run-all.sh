#!/usr/bin/env bash
# Runs every end-to-end suite against a fresh production build.
#   ./tests/run-all.sh            # build, then run auth + ingest/persistence + deploy suites
#   SKIP_BUILD=1 ./tests/run-all.sh
# They start real servers on ports 4100, 4200, 4210, 4300, 4310 and 4400 and use a
# throwaway directory under $TMPDIR; they never touch ./data.
set -u
cd "$(dirname "$0")/.."

if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "== building =="
  rm -rf .next && npm run build >/tmp/langhao-build.log 2>&1 || { tail -30 /tmp/langhao-build.log; echo "BUILD FAILED"; exit 1; }
fi
[ -d data ] && DATA_BEFORE=present || DATA_BEFORE=absent

STATUS=0
for suite in auth ingest-persistence products deploy; do
  echo; echo "################ $suite ################"
  bash "tests/$suite.test.sh" 2>&1 | grep -v "ExperimentalWarning\|trace-warnings"
  [ "${PIPESTATUS[0]}" -eq 0 ] || STATUS=1
done

[ "$DATA_BEFORE" = absent ] && [ -d data ] && { echo "WARNING: a ./data directory appeared during the tests"; STATUS=1; }
echo
[ "$STATUS" -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $STATUS
