# Grafik Pracy: niezależny audyt techniczny

Audytuj wyłącznie kod i konfigurację z dokładnego commita, z którego utworzono pakiet. Nie zmieniaj kodu. Nie uznawaj istniejących komentarzy ani testów za dowód poprawności.

## Aktualna architektura do zweryfikowania
- Aplikacja Android/Web: Expo SDK 54, React Native 0.81.x.
- Centralny backend: Node.js/Express w `backend/server.js`.
- Baza danych: PostgreSQL, schemat w `backend/schema.sql`.
- Konfiguracja wdrożenia backendu: `render.yaml`.
- Klient API: `GrafikPracy_Final/apiClient.js`.
- Lokalizacja i usługi GPS: `GrafikPracy_Final/LocationService.js`.
- Główne runtime/UI: `GrafikPracy_Final/AppRuntime.js`.
- Mini mapa i dashboard: `GrafikPracy_Final/NowDashboard.js`.
- Mapa i lista lokalizacji na żywo: `GrafikPracy_Final/LiveLocationDashboard.js`.
- Testy regresyjne: `GrafikPracy_Final/tests/production-hardening.test.js`.

Nie zakładaj, że Firebase Auth, Firestore lub Firebase Functions są backendem aplikacji. Sprawdź aktualny kod i odróżnij Firebase Hosting używany do WWW od centralnego API.

## Zakres audytu
1. Start aplikacji, CrashBoundary, importy i zgodność Expo/React Native/Android/Hermes.
2. GPS w foreground/background, uprawnienia, odtwarzanie po ubiciu procesu, kolejka offline, retry, świeżość i wiarygodność danych.
3. Mini mapa i mapa live: źródło mapy, klucze/konfiguracja, aktualizacja bez niepotrzebnego remountu, zgodność Android/Web.
4. Centralne API: uwierzytelnianie, role admin/employee/locator, walidacja wejścia, autoryzacja, timeouty, błędy sieci i konflikty wersji.
5. PostgreSQL: schemat, transakcje, migracje, indeksy, integralność i bezpieczeństwo zapytań.
6. Synchronizacja i stan lokalny: race conditions, retry, offline, utrata danych, konflikty, nieaktualne cache.
7. Grafik: generator, ręczne/locked przypisania, rozdzielenie tygodni, strefy czasowe, rozliczenia i odzyskiwanie danych.
8. Raporty/powiadomienia: harmonogram, deduplikacja, strefy czasowe, Android notification channel, zachowanie po restarcie.
9. CI/CD: instalacja lockfile, skrypty postinstall, Expo export, prebuild, APK, artefakty i deployment WWW/backendu.
10. Testy krytycznych przepływów, dostępność, wydajność i utrzymanie kodu.

## Raport
Dla każdego znaleziska podaj: priorytet P0-P3, ścieżkę pliku, mechanizm błędu, warunek wystąpienia, wpływ, dowód, kroki reprodukcji i rekomendowaną poprawkę. Rozdziel fakty potwierdzone od hipotez. Na końcu podaj 10 najważniejszych działań przed testami użytkowników.

Nie uruchamiaj wdrożeń, nie publikuj APK i nie zmieniaj repozytorium. Jeśli test/build nie został wykonany, zaznacz to wyraźnie.