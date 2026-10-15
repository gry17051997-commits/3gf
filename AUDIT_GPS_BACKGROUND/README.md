# Pakiet audytu: lokalizacja GPS w tle — 13.10.2026

## Cel
Zdiagnozować, dlaczego lokalizacja pojazdu w aplikacji Grafik Pracy nie działa niezawodnie po zablokowaniu ekranu, przełączeniu aplikacji lub ubiciu procesu Androida. To jest pakiet do niezależnego audytu, nie gotowa poprawka.

## Stan repozytorium
- Repozytorium: `gry17051997-commits/GrafikPracyApp`
- Bazowa rewizja audytu: `e57f02bc55f50d21078838fff2af9fa7581b27c1`
- Gałąź audytowa: `audit/gps-background-2026-10-13`
- Bazowa gałąź aplikacji: `fix/android-live-map-webview-2026-10-13`
- PR #58 pozostaje niepołączony z `main`.
- Backend jest centralnym API Express + PostgreSQL; lokalizacja nie używa bezpośredniego Firestore.
- Expo SDK 54, expo-location ~19.0.8, expo-task-manager ~14.0.9, Android package `pl.grafikpracy.app`.

## Objawy zgłaszane przez użytkownika
- GPS działa częściowo, ale lokalizacja w tle nadal nie działa prawidłowo.
- Zdarzało się, że po zablokowaniu telefonu inni użytkownicy tracili podgląd lokalizacji.
- Wcześniejszy audyt wskazał brak pewnego mechanizmu automatycznego odtworzenia foreground service po ubiciu procesu/restarcie urządzenia.
- Aktualny ekran może pokazywać starszą lokalizację; trzeba rozróżnić brak nowych pomiarów, błąd uploadu API, problem uprawnień, ograniczenia producenta/Androida i brak synchronizacji po stronie serwera.
- Na Redmi/HyperOS mogą występować dodatkowe ograniczenia baterii i autostartu; należy je zweryfikować, a nie zakładać z góry.

## Pliki źródłowe skopiowane do tego pakietu
Kopie odpowiadają dokładnie rewizji bazowej i mają służyć audytorom do analizy. Nie edytować ich jako poprawki produkcyjnej bez osobnego PR:
- `source/LocationService.js`: rejestracja TaskManager, opcje lokalizacji, zapis pomiarów i upload API, start/stop/ensure.
- `source/index.js`: globalny import LocationService i konfiguracja powiadomień.
- `source/App.js`: granica błędów aplikacji.
- `source/AppRuntime.js`: lifecycle, uruchamianie i diagnostyka śledzenia lokalizacji, ustawienia/uprawnienia.
- `source/apiClient.js`: timeout, endpoint GPS i konfiguracja API.
- `source/app.json`: uprawnienia Androida i konfiguracja expo-location.
- `source/package.json`: wersje SDK i bibliotek.
- `source/diagnostic-apk.yml`: workflow kompilacji APK.

## Wstępne punkty wymagające potwierdzenia
1. `startVehicleLocationTracking()` odmawia startu, gdy `AppState.currentState !== 'active'`; czy każde ścieżki wznowienia prawidłowo wywołują `ensureVehicleLocationTracking()`?
2. Czy po proces death/reboot istnieje natywna, wspierana przez Expo ścieżka odtworzenia taska i foreground service, bez oczekiwania na ręczne otwarcie aplikacji?
3. Czy status `cfg.enabled`, token urządzenia i przypisanie auta są spójne po ponownym uruchomieniu i błędach sieci?
4. `saveLocationInternal()` ponawia upload 3 razy, ale po wyczerpaniu prób pomiar nie trafia do trwałej kolejki. Czy wymagany jest trwały, ograniczony rozmiarem outbox i idempotentne API?
5. Czy odpowiedzi 401/404 z `/gps/device` zawsze oznaczają usunięte przypisanie, czy mogą wynikać z przejściowego/nieprawidłowego stanu serwera?
6. Czy serwer przyjmuje `observedAt`, poprawnie odrzuca starsze pomiary i udostępnia `updatedAt` zgodne z czasem obserwacji?
7. Czy w interfejsie „brak lokalizacji” jest oparty na wieku ostatniego pomiaru, a nie tylko na istnieniu rekordu?
8. Czy wersje Expo i natywne uprawnienia generują prawidłowy foreground service dla docelowej wersji Androida, w tym Android 13/14+?
9. Jak zachowuje się śledzenie po: zablokowaniu ekranu, przełączeniu aplikacji, wymuszeniu zatrzymania, ubiciu procesu przez system, restarcie telefonu, utracie internetu, cofnięciu uprawnień i oszczędzaniu baterii?
10. Czy zadanie jest definiowane w globalnym zakresie i importowane z entrypointu przed renderowaniem React? (w aktualnym źródle: import w `index.js`).

## Wymagany rezultat od audytorów
Każdy audyt ma wskazać:
- konkretne pliki, funkcje i linie;
- potwierdzone przyczyny vs. hipotezy;
- sekwencję reprodukcji problemu;
- ryzyko dla Androida/Expo oraz backendu;
- propozycję docelowej architektury naprawy, bez regexowych podmian kodu i bez prowizorek;
- testy jednostkowe/integracyjne oraz scenariusze testów na prawdziwym telefonie;
- wpływ na baterię, transfer danych, prywatność i limity API;
- listę zmian, które nie powinny być łączone z poprawką GPS.

## Zasady
- Nie scalać do `main`.
- Nie wdrażać automatycznie propozycji audytorów.
- Nie twierdzić, że działanie po restarcie/ubiciu procesu jest naprawione bez testu urządzeniowego.
- TaskManager i definicje zadań muszą pozostać w globalnym zakresie entrypointu/importowanego modułu.
- Rozdzielić: zbieranie GPS, trwałe buforowanie, wysyłkę do API, walidację przypisania, backend i prezentację statusu.
