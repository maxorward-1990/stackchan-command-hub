#!/usr/bin/env bash
# Kör alla värdbaserade firmwaretester (ingen hårdvara krävs).
#   bash firmware/run_tests.sh
# Allt byggs i /tmp; repot och v61/ skrivs aldrig.
# Krav: bash, g++ (C++17), python3, git (hämtar ArduinoJson en gång).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
AJ_VERSION=7.4.3   # samma som lib_deps (se prepare_apps.py)
WORK=$(mktemp -d /tmp/stackchan-tests.XXXXXX)
DEPS=/tmp/stackchan-deps
AJ=$DEPS/ArduinoJson-$AJ_VERSION/src
pass=0; fail=0; failed=()

if [ ! -f "$AJ/ArduinoJson.h" ]; then
  mkdir -p $DEPS && git -c advice.detachedHead=false clone -q --depth 1 --branch v$AJ_VERSION \
    https://github.com/bblanchon/ArduinoJson.git $DEPS/ArduinoJson-$AJ_VERSION || { echo "Kunde inte hämta ArduinoJson"; exit 2; }
fi

ok()  { echo "  OK    $1"; pass=$((pass+1)); }
bad() { echo "  FEL   $1"; sed 's/^/        /' "$2" | tail -15; fail=$((fail+1)); failed+=("$1"); }

# Lägger ArduinoJson där python-testerna letar (<katalog>/.pio/libdeps/...).
link_json() { mkdir -p "$1/.pio/libdeps/m5stack-cores3"; ln -sfn "$DEPS/ArduinoJson-$AJ_VERSION" "$1/.pio/libdeps/m5stack-cores3/ArduinoJson"; }

cpp_tests() { # katalog etikett
  local d=$1 label=$2 out=$WORK/bin-$2; mkdir -p $out
  for t in "$d"/tests/*.cpp; do
    local n=$(basename "$t" .cpp) extra=""
    [ "$n" = servo_gesture_sequence ] && extra="$d/src/ServoGestureController.cpp"
    if g++ -std=c++17 -I "$d/src" -I "$d/apps" -I "$d/tests/stubs" -I "$AJ" "$t" $extra -o "$out/$n" > "$out/$n.log" 2>&1 \
       && (cd "$out" && timeout 300 "./$n" >> "$out/$n.log" 2>&1); then ok "$label/$n"; else bad "$label/$n" "$out/$n.log"; fi
  done
}
py_test() { # etikett katalog skript [arg...]
  local label=$1 d=$2 s=$3; shift 3; local log=$WORK/py-$label-$(basename "$s" .py).log
  if (cd "$d" && timeout 900 python3 "$s" "$@" > "$log" 2>&1); then ok "$label/$(basename "$s")"; else bad "$label/$(basename "$s")" "$log"; fi
}

echo "== 1. Repots firmware/ (kopia i $WORK/repo)"
cp -r "$ROOT/firmware" $WORK/repo; rm -rf $WORK/repo/.pio; link_json $WORK/repo
cpp_tests $WORK/repo repo

echo "== 2. Aktuell firmware förberedd från v61 med prepare_apps.py"
STAGED=$WORK/staged
if python3 "$ROOT/firmware/apps/prepare_apps.py" $STAGED > $WORK/prepare.log 2>&1; then ok "prepare_apps.py"; else bad "prepare_apps.py" $WORK/prepare.log; fi
if [ -d $STAGED/src ]; then
  link_json $STAGED
  cpp_tests $STAGED staged
  R=$WORK/repo
  py_test repo $R tests/desk_app_runtime.py "$AJ"
  py_test repo $R tests/focus_app_runtime.py "$AJ"
  py_test repo $R tests/wake_dma_v76.py $STAGED
  py_test repo $R tests/wake_threshold_v72.py $STAGED
  py_test repo $R tests/personality_threshold_v72.py $STAGED
  py_test repo $R tests/wake_word_lifecycle.py
  py_test repo $R tests/proximity_io.py
  py_test repo $R tests/search_handoff_wiring.py
  py_test repo $R tests/live_setup_memory.py
  py_test repo $R tests/web_research_memory.py
  py_test staged $STAGED tests/live_setup_memory.py
  py_test staged $STAGED tests/web_research_memory.py
fi

echo "== 3. v61-baslinjen (kopia)"
cp -r "$ROOT/v61/firmware" $WORK/v61; link_json $WORK/v61
for s in wake_word_lifecycle search_handoff_wiring live_setup_memory web_research_memory; do py_test v61 $WORK/v61 tests/$s.py; done
# v61:s wake_word_lifecycle/search_handoff_wiring körs inte mot den förberedda källan: v76+ ändrar avsiktligt
# WakeWord.cpp och raden w.search; de ersätts av wake_threshold_v72/wake_dma_v76 ovan.
# robot_v8_smoke.py kräver en fysisk robot och körs inte här.

echo
echo "Resultat: $pass godkända, $fail fel   (loggar: $WORK)"
[ $fail -eq 0 ] || { printf '  - %s\n' "${failed[@]}"; exit 1; }
