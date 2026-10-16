# Audyt drzew gałęzi Git

Data: 2026-10-15  
Repozytorium: `gry17051997-commits/3gf`  
Bazowe drzewo `main`: `7c5008a7dfce19d87a0d5e547c18da1fe4fba79c`

## Metoda i ograniczenia

Standardowe porównanie GitHub `compare/main...branch` zwracało `No common ancestor`. Commity końcowe gałęzi są zgłaszane bez rodziców, więc nie wolno wyciągać wniosków o scaleniu na podstawie historii commitów. Zamiast tego pobrano rekurencyjne drzewa i porównano ścieżki plików oraz SHA blobów z drzewem `main`.

Kolumna „różne pliki” liczy pliki dodane, usunięte lub o innej zawartości. Nie jest to ocena jakości zmian ani dowód, że gałąź można usunąć. Drzewa katalogów nie są liczone jako pliki.

## Potwierdzone identyczne drzewa

| Gałąź / grupa | Wynik |
|---|---|
| `fix/android-api-base-url-normalization` | Drzewo identyczne z `main` (0 różnic plików). Najmocniejszy kandydat do późniejszego usunięcia, po sprawdzeniu odwołań i zachowaniu historii. |
| `backup/2026-10-13-maptiler-working` oraz `fix/android-live-map-webview-2026-10-13` | Identyczne drzewo `1aa36711bd3d9df92f14b9e7b7c0c7113608f5d6`. Zachować backup MapTiler; druga gałąź może być kandydatem do usunięcia po weryfikacji. |
| `fix/web-api-api-prefix` oraz `fix/web-login-diagnostics` | Identyczne drzewo `6a5ae7ee630bb421fd3136b247e15c0c5fdd7e33`. Można rozważyć pozostawienie jednej gałęzi. |
| `diagnostic/app-bootstrap-runtime` oraz `fix/production-hardening-2026-09-28` | Identyczne drzewo `9fc9266663afcbc3ecf9bda0fdb4143bc98a900a`. Można rozważyć pozostawienie jednej gałęzi. |
| `build/android-apk-test` oraz `ui/full-refresh-2` | Identyczne drzewo `a4c202cea4555468a337a9cc5201a9f3d22e3816`. Można rozważyć pozostawienie jednej gałęzi. |

Nie usuwaj gałęzi backupowych, dopóki odpowiadający im stan nie został sprawdzony i nie ma lepszej kopii.

## Gałęzie z małą liczbą różnic od main

Mała liczba różnic oznacza, że gałąź wymaga ręcznego obejrzenia plików, nie że jest zbędna.

| Gałąź | Różne pliki | Znaczenie |
|---|---:|---|
| `fix/gps-monotonic-current-main-2026-10-13` | 1 | Zmiana w `backend/server.js`; zachować do przeglądu. |
| `fix/gps-offline-queue-recovery-2026-10-15` | 2 | `LocationService.js` i testy; zachować, bo dotyczy odzyskiwania GPS offline. |
| `fix/android-live-map-and-gps-stability` | 2 | Dashboard Teraz i testy; zachować do porównania z wymaganiem MapTiler. |
| `fix/web-live-map-stable-iframe-2026-10-13` | 2 | Dashboard mapy i testy; zachować do weryfikacji. |
| `fix/web-runtime-native-guards` | 2 | Klient API i testy; zachować do weryfikacji. |
| `fix/web-api-url-config` | 4 | API, GPS, entry point i testy; zachować do weryfikacji. |
| `fix/apk-login-api-config-2026-10-13` | 2 | Różnice workflow; sprawdzić, czy zawierają poprawkę konfiguracji builda. |

## Wyniki wszystkich pozostałych porównań

Wszystkie poniższe wartości to liczba plików, których ścieżka lub blob SHA różni się od `main`. Wysokie wartości często oznaczają starszy pełny snapshot, a nie tyle niezależnych poprawek.

| Gałąź | Różne pliki |
|---|---:|
| `audit/background-gps-2026-10-13` | 12 |
| `audit/gemini-package` | 58 |
| `audit/gps-background-2026-10-13` | 20 |
| `audit/production-hardening-2026-10-04` | 54 |
| `backup/2026-10-11-current-stage` | 15 |
| `build/admin-crud-fallback-apk` | 46 |
| `checkpoint/app-starts-2026-09-28` | 52 |
| `deepseek-audit-2026-09-29` | 51 |
| `diagnostic/android-black-screen` | 46 |
| `diagnostic/apk-build-1.0.4` | 45 |
| `diagnostic/clean-native-boot` | 43 |
| `diagnostic/minimal-app` | 43 |
| `diagnostic/minimal-app-clean` | 43 |
| `diagnostic/no-native-widget` | 45 |
| `feature/admin-user-management` | 51 |
| `feature/gps-live-route-stop-dedup` | 13 |
| `fix/admin-auth-hardening-2026-10-01` | 43 |
| `fix/admin-crud-without-functions-2026-09-28` | 39 |
| `fix/baseline-ci-and-tests` | 44 |
| `fix/deepseek-production-final` | 38 |
| `fix/deepseek-production-patches` | 38 |
| `fix/firebase-functions-gps-2026-09-28` | 39 |
| `fix/firestore-realtime-shift-sync` | 39 |
| `fix/full-production-audit-2026-09-29` | 44 |
| `fix/gps-background-diagnostics-2026-10-13` | 18 |
| `fix/gps-live-map-status-dedup` | 11 |
| `fix/gps-monotonic-current-2026-10-13` | 8 |
| `fix/gps-stop-debounce-live-map` | 11 |
| `fix/gps-users-mainline-2026-09-28` | 39 |
| `fix/gps-users-runtime-from-kafel-2026-09-28` | 43 |
| `fix/offline-first-delta-sync` | 39 |
| `fix/p0-production-hardening` | 10 |
| `fix/production-gps-admin-2026-10-03` | 37 |
| `fix/production-patches-v2` | 37 |
| `fix/production-patches-v3` | 37 |
| `fix/proposals-recovery-2026-09-24` | 49 |
| `fix/real-gps-and-runtime-validation-2026-10-04` | 36 |
| `fix/real-gps-central-assignment-ci-2026-10-04` | 36 |
| `fix/report-query-and-functions-region-2026-09-28` | 39 |
| `fix/runtime-performance-2026-09-28` | 42 |
| `fix/schedule-sync-test-and-apk` | 37 |
| `fix/security-auth-firestore` | 50 |
| `fix/shared-gps-live-location` | 52 |
| `fix-deepseek-followup` | 38 |
| `fix-deepseek-followup-v2` | 38 |
| `fix-production-audit` | 38 |
| `gemini-audit-package` | 40 |
| `grafik-pracy-2.0` | 69 |
| `gry17051997-commits-patch-1` | 43 |
| `integration/emergent-ui` | 46 |
| `integration/emergent-ui-clean` | 43 |
| `migration/supabase` | 43 |
| `recovery/last-full-before-black` | 53 |
| `recovery/no-native-widget-baseline` | 61 |
| `release/apk-1.0.4-artifact` | 45 |
| `security/backend-hardening-review` | 9 |
| `stable/full-app-before-black-screen` | 47 |
| `stable/test-before-57027` | 47 |
| `ui/bottom-navigation-polish` | 51 |
| `ui/full-refresh` | 51 |
| `ui/safe-area-navigation` | 51 |
| `variant-b-invites-2026-10-04` | 44 |

## Rekomendacja dotycząca usuwania

1. Najpierw zachować kopie `backup/*` i `recovery/*`.
2. Nie usuwać gałęzi GPS, API, bezpieczeństwa, produkcyjnych ani buildowych na podstawie samej nazwy.
3. Kandydatów o identycznych drzewach można skasować dopiero po potwierdzeniu, że ich identyczność jest nadal aktualna.
4. Usuwanie gałęzi nie jest dostępne przez obecnie użyte narzędzie GitHub w tej sesji. Dlatego raport wskazuje kandydatów, ale nie usuwa refów.
5. Ponieważ gałęzie mają brak wspólnego przodka, do bezpiecznego odzyskiwania zmian trzeba używać porównania plików/tree SHA lub cherry-pickować konkretne zmiany po ręcznym sprawdzeniu, a nie polegać na zwykłym merge ancestry.

