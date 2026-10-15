# Grafik Pracy: mapa projektu dla audytora

Pełnym źródłem prawdy jest kod konkretnego commita, nie ten opis.

## Główne moduły
- `GrafikPracy_Final/App.js`: cienki punkt wejścia aplikacji.
- `GrafikPracy_Final/AppRuntime.js`: główny runtime, stan, logika i UI; duży plik wymagający ostrożności przy refaktoryzacji.
- `GrafikPracy_Final/NowDashboard.js`: ekran Teraz i mini mapa.
- `GrafikPracy_Final/LiveLocationDashboard.js`: dashboard lokalizacji i mapa live.
- `GrafikPracy_Final/LocationService.js`: lokalizacja urządzenia i wysyłanie GPS.
- `GrafikPracy_Final/apiClient.js`: klient centralnego API.
- `GrafikPracy_Final/AdminUsersPanel.js`, `AdminUserService.js`: konta i role.
- `GrafikPracy_Final/AdminFleetPanel.js`: pojazdy, telefony GPS i przypisania.
- `GrafikPracy_Final/scheduleEngine.js`: logika i walidacja grafiku.
- `backend/server.js`: API Node.js/Express.
- `backend/schema.sql`: schemat PostgreSQL.
- `render.yaml`: konfiguracja backendu i bazy.
- `.github/workflows/build-apk.yml`: build APK.
- `.github/workflows/web.yml`: export i deployment WWW.
- `.github/workflows/backend-check.yml`: kontrola backendu.
- `.github/workflows/codeql.yml`: analiza bezpieczeństwa.

## Źródło danych
README opisuje centralne API z PostgreSQL jako backend kont, grafiku i GPS. Sprawdź to w kodzie i konfiguracji. Nie zakładaj, że Firebase Auth/Firestore/Functions są aktywną warstwą danych. Firebase Hosting może służyć do hostowania statycznej aplikacji WWW.

## Szczególna uwaga: GPS i mapy
Sprawdź zgodność aktualnego `main` z zachowaną gałęzią `backup/2026-10-13-maptiler-working`. Wymagane źródło mapy musi być ustalone na podstawie działającej wersji referencyjnej, a nie domyślnego założenia. Nie zastępuj MapTiler innym dostawcą bez dowodu i zgody.

Sprawdź background location na Androidzie, zachowanie po zablokowaniu telefonu, ponowne uruchamianie tasków, trwałość offline queue, deduplikację postojów, aktualność danych, przypisanie pojazdu i widoczność lokalizacji dla innych użytkowników.

## Zasada audytu
Testy oparte wyłącznie na dopasowaniu tekstu do źródeł nie dowodzą poprawnego zachowania. Weryfikuj pełny przepływ danych i zgłaszaj ograniczenia wykonania testów.