# Audyt lokalizacji GPS w tle — Grafik Pracy
Data: 2026-10-13
Repozytorium: gry17051997-commits/GrafikPracyApp
Baza kodu: punkt kontrolny mapy z 2026-10-13, commit e57f02bc55f50d21078838fff2af9fa7581b27c1
Gałąź audytowa: audit/background-gps-2026-10-13

## Cel
Niezależny audyt przyczyny, dla której lokalizacja przestaje aktualizować się w tle / po zablokowaniu telefonu. Nie wdrażać naprawy przed przedstawieniem ustaleń, dowodów, ryzyk i planu testów. Nie scalać do main.

## Objaw zaobserwowany na telefonie
Zrzuty ekranu z 2026-10-13, około 14:21:
- Widok „Auto” pokazuje „NIEAKTUALNA”; ostatnia pozycja Kobierzyce, 50.99732, 16.96701, aktualizacja około 4 min temu, dokładność ±8 m, prędkość 0 km/h, pojazd PZ387WR.
- Interfejs informuje: „Nadajnik istnieje, ale ostatnia pozycja jest starsza niż 3 minuty”.
- Widok „Teraz” pokazuje tę samą pozycję z aktualizacją około 14:16 i statusem „Lokalizacja nieaktualna”.
- Kafelki MapTiler i mapa renderują się; bieżący problem dotyczy świeżości/ciągłości danych GPS, nie renderowania mapy.
- Nie traktować samego istnienia nadajnika ani poprzedniej lokalizacji jako dowodu, że Android nadal dostarcza pomiary.

## Pliki źródłowe do obowiązkowej analizy
1. `GrafikPracy_Final/LocationService.js`
2. `GrafikPracy_Final/index.js`
3. `GrafikPracy_Final/AppRuntime.js` — znaleźć wszystkie miejsca wywołań `startVehicleLocationTracking`, `ensureVehicleLocationTracking`, `stopVehicleLocationTracking`, obsługę `AppState`, logowania, wylogowania, przypisania pojazdu i zmian uprawnień.
4. `GrafikPracy_Final/app.json`
5. `GrafikPracy_Final/apiClient.js`
6. Backend: endpointy rejestracji urządzenia/przypisania i `POST /api/gps`, zapisy historii i walidacja czasu obserwacji.
7. `.github/workflows/diagnostic-apk.yml`, konfiguracja Expo i testy istniejące w repozytorium.

## Wstępne obserwacje do zweryfikowania, nie gotowy werdykt
- `LocationService.js` rejestruje `TaskManager.defineTask` na poziomie modułu, a `index.js` importuje `./LocationService` przed rejestracją komponentu. Zweryfikować również rzeczywisty bundle i natywny manifest.
- `startVehicleLocationTracking()` natychmiast zwraca `app-not-active`, gdy `AppState.currentState !== 'active'`. Ocenić wszystkie ścieżki startu/odtworzenia oraz wyścigi lifecycle.
- `ensureVehicleLocationTracking()` nie uruchamia się samoczynnie po restarcie procesu/telefonu; sprawdzić, czy istnieje niezawodny mechanizm ponownego uruchomienia usługi i jak Android Expo Location zachowuje się po zabiciu procesu.
- Przy błędzie sieci `saveLocationInternal()` ponawia wysyłkę 3 razy, ale po niepowodzeniu nie ma trwałej kolejki oczekujących pomiarów. Ocenić utratę punktów i zachowanie po offline.
- `getDeviceAssignment()` zwraca `null` dla HTTP 401/404; `ensureVehicleLocationTracking()` w takim przypadku zatrzymuje tracking. Sprawdzić, czy krótkotrwały problem autoryzacji/odpowiedzi może bezpowrotnie wyłączyć usługę.
- `LOCATION_OPTIONS` ustawia `timeInterval: 10000`, `distanceInterval: 0`, `deferredUpdatesInterval: 0`, `pausesUpdatesAutomatically: false`, a foreground service ma `killServiceOnDestroy: false`. Zweryfikować zgodność z Expo SDK 54, Androidem 13–16 i wersją natywnego modułu. Nie zakładać, że samo ustawienie opcji gwarantuje 10-sekundowe aktualizacje.
- Sprawdzić manifest wygenerowany przez `expo prebuild`, kanał i widoczność powiadomienia foreground service, uprawnienia w czasie działania oraz skutki optymalizacji baterii producenta (Xiaomi/HyperOS).
- `saveLocationInternal()` ustawia lokalny `receivedAt` po odpowiedzi API, a payload zawiera `observedAt` z czasu pomiaru. Backend/UI muszą odróżniać czas pomiaru, odbioru przez serwer i odczytu przez klienta. Zweryfikować strefy czasu i odrzucanie starych/nieuporządkowanych punktów.
- Serializacja `saveQueue` może powodować kolejkę oczekującą na timeouty API; ocenić maksymalne opóźnienie i blokowanie kolejnych punktów.
- `stopVehicleLocationTracking()` usuwa `LOCATION_CURRENT_KEY`; sprawdzić, czy jest wywoływana przy zdarzeniach, które nie powinny wyłączać śledzenia, oraz czy błędy konfiguracji nie zostawiają niespójnego stanu.

## Zakres niezależnych audytów
### A. Android / Expo / lifecycle
- TaskManager task definition, rejestracja w global scope, cold start, proces ubity przez Androida, restart urządzenia, aktualizacja aplikacji, przełączenie konta.
- Foreground service, typ usługi lokalizacyjnej, powiadomienie, Android 13+ notifications, Android 14+ foreground service location.
- Uprawnienia „podczas używania” vs „zawsze”, usługi lokalizacji wyłączone, ograniczenia producenta/HyperOS, oszczędzanie baterii.
- Czy Expo SDK 54 i użyte API wspierają wymagany scenariusz; jasno wskazać ograniczenia platformy. Nie obiecywać restartu po każdym force-stop, bo Android może go blokować.

### B. Przepływ danych / backend
- Telefon → task → kolejka lokalna → API → baza → endpointy odczytu → status świeżości w UI.
- Obsługa offline, timeoutów, HTTP 401/403/404/429/5xx, rotacji tokenu i zmiany przypisania.
- Idempotencja, monotoniczność timestampów, kolejność punktów, deduplikacja, trwałe buforowanie i retry z backoff.
- Rozróżnienie „brak nowego pomiaru”, „pomiar lokalny, upload nieudany”, „brak przypisania”, „brak uprawnień” i „usługa nie działa”.

### C. Niezależny code review / architektura
- Zidentyfikować dokładną przyczynę i pokazać linie kodu/łańcuch zdarzeń.
- Nie robić zmian kodu w trakcie audytu.
- Nie proponować regexowych podmian kodu w CI, sztucznych testów statycznych jako dowodu działania GPS ani wielkiego monolitu.
- Zaproponować mały, etapowy plan naprawy, z logowaniem diagnostycznym bez danych wrażliwych.
- Sprawdzić wpływ na baterię, transfer, prywatność, role i bezpieczeństwo tokenów.

## Oczekiwany format raportu każdego audytora
1. Werdykt: przyczyna potwierdzona / prawdopodobna / niepotwierdzona.
2. Dowody: ścieżka pliku, funkcja i dokładne linie/warunki.
3. Łańcuch przyczynowy wyjaśniający, jak powstaje stara pozycja.
4. P0/P1/P2 z uzasadnieniem i ryzykiem regresji.
5. Zalecana naprawa z rozdzieleniem zmian JS, natywnych, backendowych i UI.
6. Plan testów fizycznych z oczekiwanymi wynikami i czasem obserwacji.
7. Rzeczy, których nie da się rozstrzygnąć bez logów/urządzenia.

## Testy fizyczne wymagane przed uznaniem poprawki
- App otwarta, ekran włączony: świeża pozycja oraz czasy pomiaru i uploadu.
- Zablokowany ekran przez 5, 15 i 30 minut, przy ruchu i postoju.
- Przełączenie do innej aplikacji i powrót.
- Utrata internetu przez 2–5 minut i przywrócenie sieci; ocenić kolejkę i kolejność.
- Proces ubity przez system; osobno ręczne „Wymuś zatrzymanie” (to inne zachowanie Androida).
- Restart telefonu.
- Odmowa/odebranie uprawnienia w tle, wyłączona lokalizacja, tryb oszczędzania baterii.
- Weryfikacja z drugim kontem/urządzeniem: serwer pokazuje nowy pomiar i poprawną świeżość.
- Co najmniej dwa przebiegi na fizycznym urządzeniu Xiaomi/HyperOS; zapisać dokładny model, wersję Androida/HyperOS i ustawienia baterii.

## Zasady bezpieczeństwa
- Nie umieszczać w raporcie haseł, pełnych tokenów, kluczy API ani danych prywatnych.
- Nie drukować tokenów urządzenia i Authorization headers w logach.
- Nie scalać żadnej naprawy do `main` bez osobnej zgody właściciela.
- Audyt ma być niezależny; różnice między audytorami zebrać w tabeli przed wdrożeniem.

## Punkt kontrolny
Przed audytem zabezpieczony branch: `backup/2026-10-13-maptiler-working`.
Punkt bazowy audytu: `e57f02bc55f50d21078838fff2af9fa7581b27c1`.
