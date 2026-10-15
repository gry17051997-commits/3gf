# Pakiet przekazania do audytu — GPS w tle
Data: 2026-10-13
Baza: `e57f02bc55f50d21078838fff2af9fa7581b27c1`

## Co przekazać poprzedniemu zespołowi
- `AUDIT/BACKGROUND_GPS_AUDIT_BRIEF_2026-10-13.md` — objawy, zakres, wstępne hipotezy i oczekiwany format raportu.
- Kod repozytorium z gałęzi `audit/background-gps-2026-10-13`.
- Zrzuty ekranu użytkownika z 2026-10-13, ok. 14:21: ekran „Auto” pokazujący lokalizację nieaktualną przez ok. 4 minuty oraz ekran „Teraz” z tą samą pozycją aktualizowaną ok. 14:16. Zrzuty pokazują działającą mapę; to dowód problemu świeżości GPS, nie dowód przyczyny technicznej.

## Pliki krytyczne
| Plik | Co sprawdzić |
|---|---|
| `GrafikPracy_Final/LocationService.js` | definicja taska, uruchamianie/zatrzymywanie, zgody, kolejka uploadu, trwałość, obsługa błędów |
| `GrafikPracy_Final/index.js` | globalny import LocationService i rejestracja handlera notyfikacji |
| `GrafikPracy_Final/AppRuntime.js` | wszystkie wywołania start/ensure/stop, AppState, logowanie, wylogowanie, przypisanie pojazdu, lifecycle |
| `GrafikPracy_Final/app.json` | Expo SDK, plugin expo-location, uprawnienia Androida i foreground service |
| `GrafikPracy_Final/apiClient.js` | endpoint GPS, timeouty, nagłówki i autoryzacja |
| backend routes/services | `/api/gps/device`, `POST /api/gps`, odczyt bieżącej pozycji i historii, walidacja timestampów |
| `.github/workflows/diagnostic-apk.yml` | odtwarzalny build APK i walidacja konfiguracji |
| `GrafikPracy_Final/tests/production-hardening.test.js` | zakres istniejących testów; nie traktować testów tekstowych jako testu działania Androida |

## Dane, które należy zebrać z urządzenia (bez sekretów)
1. Dokładny model telefonu, wersja Androida i HyperOS/MIUI.
2. Czy dla Grafik Pracy wybrano „Zezwalaj cały czas” dla lokalizacji.
3. Stan przełącznika powiadomień oraz czy stałe powiadomienie „GPS aktywny” pozostaje widoczne po zablokowaniu ekranu.
4. Ustawienie baterii aplikacji: bez ograniczeń / oszczędzanie / ograniczone działanie w tle.
5. Czas ostatniego pomiaru na urządzeniu, czas ostatniej udanej wysyłki, czas ostatniego pomiaru zapisany na serwerze i treść błędu bez tokenów.
6. Czy GPS przestaje działać po ekranie zablokowanym, przełączeniu aplikacji, utracie internetu, zamknięciu procesu czy restarcie telefonu. Każdy scenariusz zanotować oddzielnie.

## Wstępne obserwacje z kodu — do niezależnej weryfikacji
- TaskManager jest deklarowany na poziomie modułu, a `index.js` importuje LocationService globalnie. To wygląda zgodnie z wymogiem rejestracji zadania, ale trzeba zweryfikować rzeczywisty build i zachowanie natywne.
- Funkcja startująca wymaga `AppState.currentState === 'active'`; prześledzić, czy odtworzenie usługi jest wywoływane w każdej ścieżce, w której jest to bezpieczne.
- `ensureVehicleLocationTracking` zależy od wywołania przez aplikację i nie stanowi samodzielnego mechanizmu startu po restarcie systemu.
- Nieudany upload po trzech próbach nie jest zapisywany do trwałej kolejki; pojedyncze pomiary mogą zostać utracone.
- Błąd przypisania 401/404 jest traktowany jako brak przypisania; zweryfikować zachowanie przy chwilowych błędach serwera i tokena.
- Widok uznaje lokalizację za nieaktualną po przekroczeniu progu czasu. Audyt ma ustalić, czy brak świeżych danych pochodzi z Androida, taska, uploadu, backendu czy odczytu.

## Zakaz przed zakończeniem audytu
Nie zmieniać kodu lokalizacji i nie scalać zmian. Najpierw zebrać raporty niezależnych audytorów, porównać ich ustalenia i uzgodnić jeden plan naprawczy.